"""System backups (Admin > Backup): a zip of the whole database plus the uploaded files, built by backups.service when the Admin asks, downloaded to
the Admin's computer (the online copy goes once it is downloaded), never deleted from the list, and restored from the list.
Run ONLY with the file storage overridden to a temporary folder (below), never against the real bucket."""
import hashlib
import io
import json
import os
import shutil
import tempfile
import zipfile
from datetime import date, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import TransactionTestCase, override_settings
from django.test.utils import CaptureQueriesContext
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
        shutil.rmtree(_MEDIA, ignore_errors=True)      # every test starts with its own uploaded files, not the last test's
        os.makedirs(_MEDIA, exist_ok=True)
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
        def fake(fmt, objects, stream, **kwargs):
            stream.write('[{"model": "interventions.x", "fields": {"quantity": "₱300 per head"}}]')
        path = tempfile.mktemp(suffix='.json')
        try:
            with mock.patch('backups.service.serializers.serialize', fake):
                self.assertEqual(service.dump_database(path), 1)
            self.assertIn('₱300 per head', open(path, 'rb').read().decode('utf-8'))
        finally:
            os.remove(path)

    def test_the_dump_is_the_same_as_dumpdata(self):
        # the dump replaced `manage.py dumpdata` (which is far too slow over a network); what it writes must be what dumpdata would write
        path = tempfile.mktemp(suffix='.json')
        try:
            service.dump_database(path)
            ours = json.load(open(path, encoding='utf-8'))
        finally:
            os.remove(path)
        out = io.StringIO()
        call_command('dumpdata', exclude=service.EXCLUDE, format='json', stdout=out, verbosity=0)
        self.assertEqual(ours, json.loads(out.getvalue()))
        self.assertTrue(any(row['model'] == 'farmers.farmer' for row in ours))

    def test_many_to_many_values_cost_no_extra_query_per_record(self):
        # dumpdata asks once more for every record with a many-to-many field; a run from GitHub to the live database never finished
        User = get_user_model()
        self.assertTrue([f for f in User._meta.many_to_many if f.remote_field.through._meta.auto_created])

        def queries():
            with CaptureQueriesContext(connection) as captured:
                list(service.objects_to_dump())
            return len(captured)
        few = queries()
        for i in range(15):
            User.objects.create_user(username=f'bk-many-{i}', password='pw', role='ADMIN', email=f'm{i}@x.test')
        self.assertEqual(queries(), few)

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

    def test_a_backup_keeps_its_name_its_file_name_and_its_fingerprint(self):
        record = self.make(name='Before the harvest season', location='Office computer, drive D', remarks='Monthly copy')
        self.assertEqual((record.name, record.location, record.remarks), ('Before the harvest season', 'Office computer, drive D', 'Monthly copy'))
        self.assertTrue(record.file_name.startswith('oma_backup_') and record.file_name.endswith('.zip'), record.file_name)
        with default_storage.open(record.file_path, 'rb') as f:
            self.assertEqual(record.checksum, hashlib.sha256(f.read()).hexdigest())

    def test_no_backup_is_ever_deleted(self):
        with override_settings(BACKUP_KEEP=2):
            first, second, third = self.make(), self.make(), self.make()
        self.assertEqual(BackupRecord.objects.filter(status='done').count(), 3)
        self.assertTrue(default_storage.exists(first.file_path))
        self.assertEqual(self.client.delete(f'{URL}{first.id}/').status_code, 405)
        self.assertEqual(BackupRecord.objects.count(), 3)

    # --- the Admin screen's endpoints
    def start(self, **body):
        with mock.patch('backups.views.start_backup', side_effect=lambda *args: service.run_backup(*args)):
            return self.client.post(URL, body, format='json')

    def restore(self, record, password='pw', data=None):
        body = {'password': password}
        if data is not None:
            body['file'] = SimpleUploadedFile('backup.zip', data, content_type='application/zip')
        with mock.patch('backups.views.start_restore', side_effect=lambda *args: service.run_restore(*args)):
            return self.client.post(f'{URL}{record.id}/restore/', body, format='multipart')

    def download(self, record):
        r = self.client.get(f'{URL}{record.id}/download/')
        self.assertEqual(r.status_code, 200, getattr(r, 'content', b''))
        return b''.join(r.streaming_content)

    def test_the_admin_makes_one_names_it_and_downloads_it(self):
        r = self.start(name='October copy', location='USB drive in the vault')
        self.assertEqual(r.status_code, 201, r.content)
        listing = self.client.get(URL).json()
        self.assertFalse(listing['busy'])
        self.assertEqual([b['status'] for b in listing['results']], ['done'])
        row = listing['results'][0]
        self.assertEqual((row['name'], row['location'], row['made_by'], row['kind_label']), ('October copy', 'USB drive in the vault', 'bk-admin', 'Manual'))
        self.assertTrue(row['has_file'] and row['can_restore'])
        self.assertGreater(row['size_bytes'], 0)
        d = self.client.get(f"{URL}{row['id']}/download/")
        self.assertEqual(d.status_code, 200)
        self.assertEqual(d['Content-Type'], 'application/zip')
        self.assertIn('attachment; filename="oma_backup_', d['Content-Disposition'])
        self.assertTrue(zipfile.ZipFile(io.BytesIO(b''.join(d.streaming_content))).namelist())

    def test_a_backup_with_no_name_is_named_by_its_date(self):
        self.assertEqual(self.start().status_code, 201)
        row = self.client.get(URL).json()['results'][0]
        self.assertTrue(row['name'].startswith('Backup of '), row['name'])

    def test_once_downloaded_the_online_copy_goes_and_the_entry_stays(self):
        record = self.make()
        path = record.file_path
        self.download(record)
        self.assertTrue(default_storage.exists(path))          # still there until the page says the file arrived
        r = self.client.post(f'{URL}{record.id}/downloaded/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(default_storage.exists(path))
        record.refresh_from_db()
        self.assertEqual(record.file_path, '')
        self.assertIsNotNone(record.downloaded_at)
        row = self.client.get(URL).json()['results'][0]
        self.assertEqual((row['id'], row['has_file'], row['can_restore']), (record.id, False, True))
        self.assertEqual(row['file_name'], record.file_name)
        self.assertEqual(self.client.get(f'{URL}{record.id}/download/').status_code, 404)

    def test_an_older_backup_with_no_fingerprint_gets_one_when_it_is_downloaded(self):
        record = self.make()
        BackupRecord.objects.filter(pk=record.pk).update(checksum='', file_name='')
        data = self.download(record)
        record.refresh_from_db()
        self.assertEqual(record.checksum, hashlib.sha256(data).hexdigest())
        self.assertTrue(record.file_name.endswith('.zip'))

    def test_the_name_the_location_and_the_remarks_can_be_edited(self):
        record = self.make()
        made = record.created_at
        r = self.client.patch(f'{URL}{record.id}/', {'name': 'Year-end copy', 'location': 'Cabinet 2, blue USB', 'remarks': 'Kept by the Admin',
                                                     'created_at': '2001-01-01T00:00:00Z', 'status': 'failed'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        record.refresh_from_db()
        self.assertEqual((record.name, record.location, record.remarks), ('Year-end copy', 'Cabinet 2, blue USB', 'Kept by the Admin'))
        self.assertEqual((record.created_at, record.status), (made, 'done'))      # the date, the time and the result are facts, not editable
        self.assertEqual(self.client.patch(f'{URL}{record.id}/', {'name': '   '}, format='json').status_code, 400)

    def test_only_one_backup_runs_at_a_time(self):
        BackupRecord.objects.create(created_by=self.admin, status='running')
        with mock.patch('backups.views.start_backup') as start:
            r = self.client.post(URL, {}, format='json')
        self.assertEqual(r.status_code, 409)
        start.assert_not_called()

    def test_nothing_else_can_be_done_while_one_is_running(self):
        done = self.make()
        BackupRecord.objects.create(created_by=self.admin, status='running')
        self.assertTrue(self.client.get(URL).json()['busy'])
        self.assertEqual(self.client.patch(f'{URL}{done.id}/', {'name': 'x'}, format='json').status_code, 409)
        self.assertEqual(self.client.get(f'{URL}{done.id}/download/').status_code, 409)
        self.assertEqual(self.client.post(f'{URL}{done.id}/downloaded/').status_code, 409)
        with mock.patch('backups.views.start_restore') as start:
            self.assertEqual(self.client.post(f'{URL}{done.id}/restore/', {'password': 'pw'}, format='multipart').status_code, 409)
        start.assert_not_called()
        done.refresh_from_db()
        self.assertNotEqual(done.name, 'x')

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
        self.assertEqual(self.client.post(f'{URL}{record.id}/downloaded/').status_code, 403)
        self.assertEqual(self.client.patch(f'{URL}{record.id}/', {'name': 'x'}, format='json').status_code, 403)
        self.assertEqual(self.client.post(f'{URL}{record.id}/restore/', {'password': 'pw'}, format='multipart').status_code, 403)
        self.assertEqual(self.client.get(f'{URL}summary/').status_code, 403)
        self.assertEqual(self.client.post(f'{URL}restore/preview/', {}, format='multipart').status_code, 403)
        self.assertEqual(self.client.post(f'{URL}restore/', {'password': 'pw'}, format='multipart').status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(URL).status_code, (401, 403))
        self.assertTrue(default_storage.exists(record.file_path))

    def test_a_missing_file_is_a_404_not_a_crash(self):
        record = self.make()
        default_storage.delete(record.file_path)
        self.assertEqual(self.client.get(f'{URL}{record.id}/download/').status_code, 404)

    # --- restore
    def change_things(self):
        """What happens after a backup: a record is edited, one is added, one is removed, a file is replaced and a new file arrives."""
        Farmer.objects.filter(rsbsa_number='01-033-02-019-990001').update(first_name='Changed')
        Farmer.objects.create(
            rsbsa_number='01-033-02-019-990002', first_name='Added', last_name='Later', gender='Female', birthdate=date(1990, 2, 2), barangay='Alaska', civil_status='Single')
        self.admin.groups.clear()
        default_storage.delete('photos/one.txt')
        default_storage.save('photos/one.txt', ContentFile(b'a different photo'))
        default_storage.save('photos/new.txt', ContentFile(b'arrived later'))

    def dump(self):
        path = tempfile.mktemp(suffix='.json')
        try:
            service.dump_database(path)
            return json.load(open(path, encoding='utf-8'))
        finally:
            os.remove(path)

    def test_restore_puts_the_records_and_the_files_back(self):
        record = self.make(name='Good copy')
        self.change_things()
        r = self.restore(record)
        self.assertEqual(r.status_code, 202, r.content)
        self.assertEqual(Farmer.objects.get(rsbsa_number='01-033-02-019-990001').first_name, 'Back')
        self.assertFalse(Farmer.objects.filter(rsbsa_number='01-033-02-019-990002').exists())
        with default_storage.open('photos/one.txt', 'rb') as f:
            self.assertEqual(f.read(), b'hello photo')
        self.assertTrue(default_storage.exists('photos/new.txt'))          # a file that arrived later is left alone
        done = BackupRecord.objects.get(kind='restore')
        self.assertEqual(done.status, 'done', done.detail)
        self.assertIn('Good copy', done.name)
        self.assertEqual(done.made_by, 'bk-admin')
        self.assertTrue(BackupRecord.objects.filter(pk=record.pk, status='done').exists())      # the list of backups is not part of what is replaced

    def test_restore_first_makes_a_safety_backup_of_how_things_are_now(self):
        record = self.make()
        self.change_things()
        self.assertEqual(self.restore(record).status_code, 202)
        safety = BackupRecord.objects.get(kind='safety')
        self.assertEqual(safety.status, 'done', safety.detail)
        text = open_zip_text(self, safety, 'database.json')
        self.assertIn('01-033-02-019-990002', text)          # what the restore was about to remove
        self.assertEqual(self.open_zip(safety).read('media/photos/one.txt'), b'a different photo')
        # ... and that safety backup can be restored in its turn, which undoes the restore
        self.assertEqual(self.restore(safety).status_code, 202)
        self.assertTrue(Farmer.objects.filter(rsbsa_number='01-033-02-019-990002').exists())
        self.assertEqual(Farmer.objects.get(rsbsa_number='01-033-02-019-990001').first_name, 'Changed')

    def test_restore_gives_back_exactly_what_was_backed_up(self):
        # every record, its dates, its many-to-many links - and nothing more (no activity-log entry is written by the restore itself)
        self.admin.groups.add(Group.objects.create(name='bk-group'))
        before = self.dump()
        record = self.make()
        self.change_things()
        self.assertNotEqual(self.dump(), before)
        self.assertEqual(self.restore(record).status_code, 202)
        self.assertEqual(BackupRecord.objects.get(kind='restore').status, 'done')
        self.assertEqual(self.dump(), before)
        self.assertEqual(list(self.admin.groups.values_list('name', flat=True)), ['bk-group'])

    def test_new_records_can_be_added_after_a_restore(self):
        record = self.make()
        self.change_things()
        self.assertEqual(self.restore(record).status_code, 202)
        added = Farmer.objects.create(
            rsbsa_number='01-033-02-019-990003', first_name='After', last_name='Restore', gender='Male', birthdate=date(1991, 3, 3), barangay='Alaska', civil_status='Single')
        self.assertEqual(Farmer.objects.filter(pk=added.pk).count(), 1)

    def test_restore_wants_the_admins_own_password(self):
        record = self.make()
        self.change_things()
        for wrong in ('', 'not-it'):
            with mock.patch('backups.views.start_restore') as start:
                r = self.client.post(f'{URL}{record.id}/restore/', {'password': wrong}, format='multipart')
            self.assertEqual(r.status_code, 400, r.content)
            start.assert_not_called()
        self.assertEqual(Farmer.objects.get(rsbsa_number='01-033-02-019-990001').first_name, 'Changed')
        self.assertFalse(BackupRecord.objects.filter(kind__in=['restore', 'safety']).exists())

    def test_a_downloaded_backup_is_restored_from_its_own_file_only(self):
        record, other = self.make(), self.make()
        data, other_data = self.download(record), self.download(other)
        self.assertEqual(self.client.post(f'{URL}{record.id}/downloaded/').status_code, 200)
        self.change_things()
        r = self.restore(record)                              # the online copy is gone: the file has to be chosen
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('file', r.json()['detail'].lower())
        r = self.restore(record, data=other_data)             # another backup's file
        self.assertEqual(r.status_code, 400, r.content)
        r = self.restore(record, data=b'not a zip at all')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(Farmer.objects.get(rsbsa_number='01-033-02-019-990001').first_name, 'Changed')
        self.assertFalse(BackupRecord.objects.filter(kind__in=['restore', 'safety']).exists())
        r = self.restore(record, data=data)
        self.assertEqual(r.status_code, 202, r.content)
        self.assertEqual(Farmer.objects.get(rsbsa_number='01-033-02-019-990001').first_name, 'Back')

    def test_a_restore_that_fails_changes_no_record(self):
        record = self.make()
        self.change_things()
        with mock.patch('backups.service.insert_records', side_effect=RuntimeError('lost the connection')):
            self.assertEqual(self.restore(record).status_code, 202)
        failed = BackupRecord.objects.get(kind='restore')
        self.assertEqual(failed.status, 'failed')
        self.assertIn('lost the connection', failed.detail)
        self.assertEqual(Farmer.objects.get(rsbsa_number='01-033-02-019-990001').first_name, 'Changed')
        self.assertTrue(Farmer.objects.filter(rsbsa_number='01-033-02-019-990002').exists())
        self.assertFalse(self.client.get(URL).json()['busy'])

    def test_a_file_that_cannot_go_back_under_its_own_name_stops_the_restore(self):
        # the storage keeps a file it was asked to remove (and so saves the restored one under another name): no half restore
        record = self.make()
        self.change_things()
        real_delete = default_storage.delete
        with mock.patch.object(default_storage, 'delete', side_effect=lambda name: None if name == 'photos/one.txt' else real_delete(name)):
            self.assertEqual(self.restore(record).status_code, 202)
        failed = BackupRecord.objects.get(kind='restore')
        self.assertEqual(failed.status, 'failed')
        self.assertIn('photos/one.txt', failed.detail)
        self.assertEqual(Farmer.objects.get(rsbsa_number='01-033-02-019-990001').first_name, 'Changed')
        self.assertEqual(default_storage.listdir('photos')[1].count('one.txt'), 1)
        self.assertEqual(len([n for n in default_storage.listdir('photos')[1] if n.startswith('one')]), 1)      # no stray copy left behind

    def test_no_restore_when_the_safety_backup_cannot_be_made(self):
        record = self.make()
        self.change_things()
        with mock.patch('backups.service.dump_database', side_effect=RuntimeError('disk full')):
            self.assertEqual(self.restore(record).status_code, 202)
        self.assertEqual(BackupRecord.objects.get(kind='safety').status, 'failed')
        failed = BackupRecord.objects.get(kind='restore')
        self.assertEqual(failed.status, 'failed')
        self.assertIn('safety backup', failed.detail)
        self.assertEqual(Farmer.objects.get(rsbsa_number='01-033-02-019-990001').first_name, 'Changed')

    def test_a_restore_entry_or_a_failed_backup_cannot_be_restored(self):
        record = self.make()
        self.assertEqual(self.restore(record).status_code, 202)
        entry = BackupRecord.objects.get(kind='restore')
        failed = BackupRecord.objects.create(created_by=self.admin, status='failed')
        for bad in (entry, failed):
            self.assertEqual(self.restore(bad).status_code, 400)
        rows = {row['id']: row for row in self.client.get(URL).json()['results']}
        self.assertFalse(rows[entry.id]['can_restore'] or rows[failed.id]['can_restore'])
        self.assertEqual(rows[entry.id]['kind_label'], 'Restore')

    def test_a_backup_file_cannot_write_outside_the_uploaded_files(self):
        # a doctored zip: its file names try to leave the storage or to overwrite the backups themselves
        record = self.make()
        good = self.open_zip(record)
        out = io.BytesIO()
        with zipfile.ZipFile(out, 'w') as zf:
            zf.writestr('database.json', good.read('database.json'))
            zf.writestr('manifest.json', good.read('manifest.json'))
            zf.writestr('media/photos/one.txt', b'hello photo')
            zf.writestr('media/../escaped.txt', b'x')
            zf.writestr('media/backups/planted.zip', b'x')
            zf.writestr('media//abs.txt', b'x')
        data = out.getvalue()
        default_storage.delete(record.file_path)
        BackupRecord.objects.filter(pk=record.pk).update(file_path='', checksum=hashlib.sha256(data).hexdigest())
        self.assertEqual(self.restore(record, data=data).status_code, 202)
        self.assertEqual(BackupRecord.objects.get(kind='restore').status, 'done')
        self.assertFalse(default_storage.exists('backups/planted.zip'))
        self.assertFalse(os.path.exists(os.path.join(os.path.dirname(_MEDIA), 'escaped.txt')))
        self.assertFalse(default_storage.exists('escaped.txt') or default_storage.exists('abs.txt'))

    def test_there_is_no_automatic_backup_command(self):
        from django.core.management import get_commands
        self.assertNotIn('backup_system', get_commands())

    # --- Backup & Restore page: what a backup holds, the optional audit trail, and restoring by dropping the file
    def make_audit_things(self, user=None):
        from auditlog.models import AuditLogEntry
        from core.models import Notification
        user = user or self.admin
        AuditLogEntry.objects.create(user=user, action='UPDATE', model_name='Farmer', object_repr='Test entry')
        Notification.objects.create(recipient=user, verb='did something')

    def audit_counts(self):
        from auditlog.models import AuditLogEntry
        from core.models import Notification
        return AuditLogEntry.objects.count(), Notification.objects.count()

    def make_without_audit(self):
        record = BackupRecord.objects.create(created_by=self.admin)
        service.run_backup(record.id, include_audit=False)
        record.refresh_from_db()
        self.assertEqual(record.status, 'done', record.detail)
        return record

    def models_in(self, record):
        return {item['model'] for item in json.loads(self.open_zip(record).read('database.json'))}

    def preview(self, data):
        body = {} if data is None else {'file': SimpleUploadedFile('backup.zip', data, content_type='application/zip')}
        return self.client.post(f'{URL}restore/preview/', body, format='multipart')

    def restore_file(self, data, password='pw'):
        body = {'password': password}
        if data is not None:
            body['file'] = SimpleUploadedFile('backup.zip', data, content_type='application/zip')
        with mock.patch('backups.views.start_restore', side_effect=lambda *args: service.run_restore(*args)):
            return self.client.post(f'{URL}restore/', body, format='multipart')

    def downloaded(self, record):
        data = self.download(record)
        self.assertEqual(self.client.post(f'{URL}{record.id}/downloaded/').status_code, 200)
        return data

    def test_the_summary_lists_what_a_backup_holds_in_readable_groups(self):
        self.make_audit_things()
        record = self.make()
        r = self.client.get(f'{URL}summary/')
        self.assertEqual(r.status_code, 200, r.content)
        groups = {g['key']: g for g in r.json()['groups']}
        self.assertGreaterEqual(groups['farmers']['count'], 1)
        self.assertGreaterEqual(groups['audit']['count'], 2)
        self.assertTrue(groups['audit']['optional'])
        self.assertFalse(groups['farmers']['optional'])
        for group in groups.values():
            self.assertTrue(group['label'] and group['description'])
        self.assertEqual(sum(g['count'] for g in groups.values()), record.records_count)      # the groups add up to every record a backup writes

    def test_a_backup_can_leave_out_the_audit_trail_and_the_notifications(self):
        self.make_audit_things()
        full, small = self.make(), self.make_without_audit()
        optional = {'auditlog.auditlogentry', 'core.notification'}
        self.assertTrue(optional <= self.models_in(full))
        self.assertFalse(optional & self.models_in(small))
        self.assertIn('farmers.farmer', self.models_in(small))
        self.assertTrue(json.loads(self.open_zip(full).read('manifest.json'))['audit_included'])
        self.assertFalse(json.loads(self.open_zip(small).read('manifest.json'))['audit_included'])
        self.assertLess(small.records_count, full.records_count)

    def test_the_admin_asks_for_a_backup_with_or_without_the_audit_trail(self):
        self.make_audit_things()
        r = self.start(include_audit=False)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertNotIn('core.notification', self.models_in(BackupRecord.objects.get(pk=r.json()['id'])))
        r = self.start(include_audit='false')
        self.assertNotIn('core.notification', self.models_in(BackupRecord.objects.get(pk=r.json()['id'])))
        r = self.start()                                   # nothing said: everything (a request that does not know the choice still gets a full backup)
        self.assertIn('core.notification', self.models_in(BackupRecord.objects.get(pk=r.json()['id'])))

    def test_restoring_a_backup_without_the_audit_trail_keeps_the_log_and_notifications_that_are_there(self):
        from auditlog.models import AuditLogEntry
        from core.models import Notification
        record = self.make_without_audit()
        later = get_user_model().objects.create_user(username='bk-later', password='pw', role='CITIZEN', email='bl@x.test')
        self.make_audit_things(self.admin)
        self.make_audit_things(later)
        entries_before = AuditLogEntry.objects.count()
        self.assertEqual(self.restore(record).status_code, 202)
        done = BackupRecord.objects.get(kind='restore')
        self.assertEqual(done.status, 'done', done.detail)
        self.assertFalse(get_user_model().objects.filter(username='bk-later').exists())          # that account is not in the backup
        self.assertEqual(AuditLogEntry.objects.count(), entries_before)                         # the log is kept as it was
        self.assertTrue(AuditLogEntry.objects.filter(object_repr='Test entry', user__isnull=True).exists())   # ... the gone account's entry names nobody now
        self.assertTrue(Notification.objects.filter(recipient=self.admin, verb='did something').exists())
        self.assertFalse(Notification.objects.filter(verb='did something').exclude(recipient=self.admin).exists())   # a notification for a gone account goes

    def test_restoring_a_full_backup_still_replaces_the_log_and_the_notifications(self):
        self.make_audit_things()
        record = self.make()
        before = self.audit_counts()
        self.make_audit_things()
        self.assertNotEqual(self.audit_counts(), before)
        self.assertEqual(self.restore(record).status_code, 202)
        self.assertEqual(self.audit_counts(), before)

    # --- the Restore tab: drop the file, see what would change, then restore
    def test_the_preview_recognises_the_file_and_says_what_a_restore_would_change(self):
        record = self.make(name='October copy')
        data = self.downloaded(record)
        self.change_things()                                # one farmer edited, one added
        r = self.preview(data)
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual((body['backup']['id'], body['backup']['name']), (record.id, 'October copy'))
        farmers = {g['key']: g for g in body['groups']}['farmers']
        self.assertEqual((farmers['in_file'], farmers['now']), (1, 2))
        self.assertFalse(farmers['kept'])
        self.assertTrue(body['audit_included'])
        self.assertEqual(body['files']['in_file'], record.files_count)
        self.assertEqual(body['records']['in_file'], record.records_count)
        self.assertEqual(Farmer.objects.count(), 2)                         # nothing was changed ...
        self.assertFalse(BackupRecord.objects.filter(kind__in=['restore', 'safety']).exists())   # ... and no safety backup or restore was started

    def test_the_preview_says_when_the_audit_trail_is_not_in_the_file(self):
        record = self.make_without_audit()
        body = self.preview(self.downloaded(record)).json()
        self.assertFalse(body['audit_included'])
        audit = {g['key']: g for g in body['groups']}['audit']
        self.assertIsNone(audit['in_file'])
        self.assertTrue(audit['kept'])

    def test_a_file_that_is_not_a_backup_at_all_is_refused(self):
        for answer in (self.preview(b'not a zip at all'), self.preview(None), self.restore_file(None), self.restore_file(b'not a zip at all')):
            self.assertEqual(answer.status_code, 400, answer.content)
        self.assertFalse(BackupRecord.objects.filter(kind__in=['restore', 'safety']).exists())

    def test_dropping_the_file_restores_with_the_admins_password(self):
        record = self.make()
        data = self.downloaded(record)
        self.change_things()
        with mock.patch('backups.views.start_restore') as start:
            for wrong in ('', 'not-it'):
                r = self.client.post(f'{URL}restore/', {'password': wrong, 'file': SimpleUploadedFile('b.zip', data)}, format='multipart')
                self.assertEqual(r.status_code, 400, r.content)
            start.assert_not_called()
        self.assertEqual(Farmer.objects.get(rsbsa_number='01-033-02-019-990001').first_name, 'Changed')
        r = self.restore_file(data)
        self.assertEqual(r.status_code, 202, r.content)
        self.assertEqual(Farmer.objects.get(rsbsa_number='01-033-02-019-990001').first_name, 'Back')
        self.assertFalse(Farmer.objects.filter(rsbsa_number='01-033-02-019-990002').exists())
        self.assertEqual(BackupRecord.objects.get(kind='restore').status, 'done')
        self.assertEqual(BackupRecord.objects.get(kind='safety').status, 'done')      # a safety backup of how things were, made first

    def test_nothing_can_be_previewed_or_restored_while_one_is_running(self):
        record = self.make()
        data = self.download(record)
        BackupRecord.objects.create(created_by=self.admin, kind='manual', status='running')
        self.assertEqual(self.preview(data).status_code, 409)
        self.assertEqual(self.restore_file(data).status_code, 409)

    # --- Restore takes any genuine backup file of this system, one made elsewhere too (there is no separate Import backup file)
    def unknown_file(self):
        """A genuine backup of this system that the history does not know (made elsewhere): returns its bytes."""
        record = self.make(name='Made elsewhere')
        data = self.download(record)
        BackupRecord.objects.filter(pk=record.pk).delete()
        return data

    def zip_with(self, data, database=None, manifest=None, drop=()):
        """The same zip with another database.json / manifest.json, or without some of its files."""
        out = io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(data)) as src, zipfile.ZipFile(out, 'w') as dst:
            for info in src.infolist():
                if info.filename in drop:
                    continue
                content = src.read(info.filename)
                if info.filename == 'database.json' and database is not None:
                    content = database
                if info.filename == 'manifest.json' and manifest is not None:
                    content = manifest
                dst.writestr(info.filename, content)
        return out.getvalue()

    def test_a_backup_made_elsewhere_is_previewed_by_what_it_holds_and_changes_nothing(self):
        data = self.unknown_file()
        self.change_things()
        before = (BackupRecord.objects.count(), Farmer.objects.count())
        r = self.preview(data)
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertIsNone(body['backup']['id'])                                     # the history does not know it
        self.assertFalse(body['in_history'])
        self.assertTrue(body['backup']['name'].startswith('Backup of '), body['backup'])   # named by the day and time it was made
        self.assertTrue(body['backup']['made_by'])
        farmers = {g['key']: g for g in body['groups']}['farmers']
        self.assertEqual((farmers['in_file'], farmers['now']), (1, 2))
        self.assertGreater(body['records']['in_file'], 0)
        self.assertEqual((BackupRecord.objects.count(), Farmer.objects.count()), before)       # nothing added, nothing changed

    def test_a_backup_made_elsewhere_is_restored_with_the_admins_password(self):
        data = self.unknown_file()
        self.change_things()
        self.assertEqual(self.client.post(f'{URL}restore/', {'password': 'not-it', 'file': SimpleUploadedFile('b.zip', data)}, format='multipart').status_code, 400)
        self.assertEqual(Farmer.objects.get(rsbsa_number='01-033-02-019-990001').first_name, 'Changed')
        r = self.restore_file(data)
        self.assertEqual(r.status_code, 202, r.content)
        self.assertEqual(Farmer.objects.get(rsbsa_number='01-033-02-019-990001').first_name, 'Back')
        self.assertFalse(Farmer.objects.filter(rsbsa_number='01-033-02-019-990002').exists())
        self.assertEqual(BackupRecord.objects.get(kind='safety').status, 'done')            # a safety backup of how things were, made first
        self.assertEqual(BackupRecord.objects.get(kind='restore').status, 'done')
        self.assertTrue(BackupRecord.objects.get(kind='restore').name.startswith('Restore of "Backup of '))

    def test_a_file_that_is_not_a_backup_of_this_system_is_refused(self):
        data = self.unknown_file()
        cases = {
            'no database': self.zip_with(data, drop=('database.json',)),
            'no manifest': self.zip_with(data, drop=('manifest.json',)),
            'a manifest that is not one': self.zip_with(data, manifest=b'{"hello": 1}'),
            'a database that is not json': self.zip_with(data, database=b'this is not json'),
        }
        for label, bad in cases.items():
            for answer in (self.preview(bad), self.restore_file(bad)):
                self.assertEqual(answer.status_code, 400, (label, answer.content))
        self.assertFalse(BackupRecord.objects.filter(kind__in=['restore', 'safety']).exists())

    def test_tables_this_system_no_longer_has_are_skipped_by_a_restore(self):
        data = self.unknown_file()
        records = json.loads(zipfile.ZipFile(io.BytesIO(data)).read('database.json'))
        records.append({'model': 'oldapp.gone', 'pk': 1, 'fields': {}})
        manifest = zipfile.ZipFile(io.BytesIO(data)).read('manifest.json')
        odd = self.zip_with(data, database=json.dumps(records).encode('utf-8'), manifest=manifest)
        self.change_things()
        self.assertEqual(self.preview(odd).status_code, 200)
        self.assertEqual(self.restore_file(odd).status_code, 202)
        self.assertEqual(Farmer.objects.get(rsbsa_number='01-033-02-019-990001').first_name, 'Back')

    def test_there_is_no_import_backup_file_any_more(self):
        from django.urls import Resolver404, resolve
        with self.assertRaises(Resolver404):
            resolve('/api/backups/import/')
        self.assertNotIn('imported', [value for value, _ in BackupRecord.Kind.choices])
