"""System backups (Admin > Backup): a zip of the whole database plus the uploaded files, built by backups.service and listed / downloaded by the
Admin. Run ONLY with the file storage overridden to a temporary folder (below), never against the real bucket."""
import io
import json
import os
import shutil
import tempfile
import zipfile
from datetime import date, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management import call_command
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from backups import service
from backups.models import BackupRecord
from farmers.models import Farmer

_MEDIA = tempfile.mkdtemp(prefix='oma_test_media_backup_')
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage', 'OPTIONS': {'location': _MEDIA}},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}
URL = '/api/backups/'


def open_zip_text(test, record, name):
    return test.open_zip(record).read(name).decode('utf-8')


@override_settings(STORAGES=STORAGES, MEDIA_ROOT=_MEDIA)
class BackupTests(TransactionTestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_user(username='bk-admin', password='pw', role='ADMIN', email='bk@x.test')
        self.focal = User.objects.create_user(username='bk-foc', password='pw', role='EVALUATOR', email='bf@x.test')
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        Farmer.objects.create(
            rsbsa_number='01-033-02-019-990001', first_name='Back', last_name='Peña Up', gender='Male', birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        default_storage.save('photos/one.txt', ContentFile(b'hello photo'))

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(_MEDIA, ignore_errors=True)

    def make(self, **over):
        record = BackupRecord.objects.create(created_by=self.admin, **over)
        service.run_backup(record.id)
        record.refresh_from_db()
        return record

    def open_zip(self, record):
        with default_storage.open(record.file_path, 'rb') as f:
            return zipfile.ZipFile(io.BytesIO(f.read()))

    # --- the file
    def test_a_backup_holds_the_database_the_uploaded_files_and_a_manifest(self):
        record = self.make()
        self.assertEqual(record.status, 'done', record.detail)
        self.assertTrue(record.file_path.startswith('backups/oma_backup_') and record.file_path.endswith('.zip'))
        self.assertGreater(record.size_bytes, 0)
        names = self.open_zip(record).namelist()
        self.assertIn('database.json', names)
        self.assertIn('manifest.json', names)
        self.assertIn('media/photos/one.txt', names)
        data = json.loads(self.open_zip(record).read('database.json'))
        self.assertTrue(any(row['model'] == 'farmers.farmer' for row in data))
        self.assertIn('Peña Up', open_zip_text(self, record, 'database.json'))
        self.assertEqual(self.open_zip(record).read('media/photos/one.txt'), b'hello photo')
        manifest = json.loads(self.open_zip(record).read('manifest.json'))
        self.assertEqual(manifest['records'], record.records_count)
        self.assertEqual(manifest['files'], record.files_count)
        self.assertGreaterEqual(record.files_count, 1)

    def test_the_database_file_is_written_as_utf8_on_any_server(self):
        # a peso sign cannot be written with some servers' default encoding (cp1252 on Windows); the dump is always UTF-8
        def fake(*args, stdout, **kwargs):
            stdout.write('[{"model": "interventions.x", "fields": {"quantity": "₱300 per head"}}]')
        path = tempfile.mktemp(suffix='.json')
        try:
            with mock.patch('backups.service.call_command', fake):
                self.assertEqual(service.dump_database(path), 1)
            self.assertIn('₱300 per head', open(path, 'rb').read().decode('utf-8'))
        finally:
            os.remove(path)

    def test_secrets_and_session_data_are_not_in_it(self):
        data = json.loads(self.open_zip(self.make()).read('database.json'))
        models = {row['model'] for row in data}
        self.assertFalse(models & {'sessions.session', 'contenttypes.contenttype', 'auth.permission', 'admin.logentry', 'backups.backuprecord'}, models)

    def test_an_earlier_backup_is_not_packed_into_the_next_one(self):
        self.make()
        names = self.open_zip(self.make()).namelist()
        self.assertFalse([n for n in names if n.startswith('media/backups/')], names)

    def test_a_file_over_the_size_limit_is_left_out_and_said_so(self):
        default_storage.save('photos/big.bin', ContentFile(b'x' * 2000))
        with override_settings(BACKUP_MAX_MEDIA_BYTES=1000):
            record = self.make()
        self.assertEqual(record.status, 'done')
        self.assertIn('media/photos/one.txt', self.open_zip(record).namelist())
        self.assertNotIn('media/photos/big.bin', self.open_zip(record).namelist())
        self.assertEqual(record.files_skipped, 1)
        self.assertIn('big.bin', record.detail)

    def test_a_failure_is_recorded_and_leaves_no_file(self):
        before = set(default_storage.listdir('backups')[1]) if default_storage.exists('backups') else set()
        with mock.patch('backups.service.dump_database', side_effect=RuntimeError('disk full')):
            record = self.make()
        self.assertEqual(record.status, 'failed')
        self.assertIn('disk full', record.detail)
        self.assertEqual(record.file_path, '')
        after = set(default_storage.listdir('backups')[1]) if default_storage.exists('backups') else set()
        self.assertEqual(after, before)

    def test_only_the_latest_backups_are_kept(self):
        with override_settings(BACKUP_KEEP=2):
            first, second, third = self.make(), self.make(), self.make()
        kept = list(BackupRecord.objects.filter(status='done').values_list('id', flat=True))
        self.assertEqual(sorted(kept), sorted([second.id, third.id]))
        self.assertFalse(default_storage.exists(first.file_path))
        self.assertTrue(default_storage.exists(third.file_path))

    # --- the Admin screen's endpoints
    def test_the_admin_lists_creates_downloads_and_deletes(self):
        with mock.patch('backups.views.start_backup', side_effect=lambda record_id: service.run_backup(record_id)):
            r = self.client.post(URL, {}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        listing = self.client.get(URL).json()
        self.assertEqual([b['status'] for b in listing['results']], ['done'])
        row = listing['results'][0]
        self.assertEqual(row['created_by_name'], 'bk-admin')
        self.assertGreater(row['size_bytes'], 0)
        d = self.client.get(f"{URL}{row['id']}/download/")
        self.assertEqual(d.status_code, 200)
        self.assertEqual(d['Content-Type'], 'application/zip')
        self.assertIn('attachment; filename="oma_backup_', d['Content-Disposition'])
        self.assertTrue(zipfile.ZipFile(io.BytesIO(b''.join(d.streaming_content))).namelist())
        self.assertEqual(self.client.delete(f"{URL}{row['id']}/").status_code, 204)
        self.assertEqual(BackupRecord.objects.count(), 0)

    def test_only_one_backup_runs_at_a_time(self):
        BackupRecord.objects.create(created_by=self.admin, status='running')
        with mock.patch('backups.views.start_backup') as start:
            r = self.client.post(URL, {}, format='json')
        self.assertEqual(r.status_code, 409)
        start.assert_not_called()

    def test_a_stuck_running_backup_is_marked_failed_when_listed(self):
        old = BackupRecord.objects.create(created_by=self.admin, status='running')
        BackupRecord.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(hours=2))
        self.client.get(URL)
        old.refresh_from_db()
        self.assertEqual(old.status, 'failed')

    def test_only_the_admin_can_use_it(self):
        record = self.make()
        self.client.force_authenticate(self.focal)
        self.assertEqual(self.client.get(URL).status_code, 403)
        self.assertEqual(self.client.post(URL, {}, format='json').status_code, 403)
        self.assertEqual(self.client.get(f'{URL}{record.id}/download/').status_code, 403)
        self.assertEqual(self.client.delete(f'{URL}{record.id}/').status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(URL).status_code, (401, 403))

    def test_a_missing_file_is_a_404_not_a_crash(self):
        record = self.make()
        default_storage.delete(record.file_path)
        self.assertEqual(self.client.get(f'{URL}{record.id}/download/').status_code, 404)

    # --- the command a scheduler can run
    def test_the_command_makes_a_scheduled_backup(self):
        call_command('backup_system')
        record = BackupRecord.objects.get()
        self.assertEqual((record.kind, record.status), ('scheduled', 'done'))
        self.assertIsNone(record.created_by)
