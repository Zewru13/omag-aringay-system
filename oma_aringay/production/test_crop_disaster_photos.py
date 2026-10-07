"""A crop disaster report takes up to 10 photos (like the fisheries disaster report); the old single photo still works."""
import itertools
import os
import shutil
import tempfile
from datetime import date
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from core.test_photos import big_png, png
from farmers.models import Farmer
from production import crop_disaster_logs
from production.models import CropDisasterReport, CropDisasterReportPhoto, CropMonitoringRecord, CropType

_RSBSA = itertools.count(940001)
PHOTO_DIR = os.path.join('disaster_reports', 'crop', 'photos')


def make_farmer(first):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name=first, last_name='Photoer', gender='Male',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')


def make_record(farmer):
    return CropMonitoringRecord.objects.create(
        farmer=farmer, farm_location_barangay='Alaska', land_status='Owner', crop_type=CropType.objects.order_by('id').first(),
        season='Wet', year=2026, date_planted=date(2026, 5, 1), area_planted_ha='2.00')


def make_citizen(username, farmer):
    user = get_user_model().objects.create_user(username=username, password='pw', role='CITIZEN', email=f'{username}@x.test')
    UserLinkedRecord.objects.create(user=user, record_type='FARMER', record_id=farmer.id, is_active=True)
    return user


def body(**over):
    data = {'disaster_type': 'Flood', 'date_of_occurrence': '2026-09-01', 'area_affected_ha': '0.50', 'estimated_damage': 'water'}
    data.update(over)
    return data


class CropDisasterPhotoTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='cdp-admin', password='pw', role='ADMIN', email='cdp-admin@x.test')
        cls.farmer = make_farmer('Ana')
        cls.other_farmer = make_farmer('Ben')
        cls.record = make_record(cls.farmer)
        cls.other_record = make_record(cls.other_farmer)
        cls.farmer_user = make_citizen('cdp-farmer', cls.farmer)
        cls.other_user = make_citizen('cdp-other', cls.other_farmer)

    def setUp(self):
        self.media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media, True)
        override = override_settings(MEDIA_ROOT=self.media)
        override.enable()
        self.addCleanup(override.disable)
        self.client.force_authenticate(self.admin)

    def files_on_disk(self):
        folder = os.path.join(self.media, PHOTO_DIR)
        return sorted(os.listdir(folder)) if os.path.isdir(folder) else []

    def post(self, record=None, files=(), **over):
        data = body(**over)
        for field, f in files:
            data.setdefault(field, [])
            data[field] = list(data[field]) + [f] if isinstance(data[field], list) else [f]
        return self.client.post(f'/api/production/monitoring/{(record or self.record).id}/disasters/', data, format='multipart')

    def test_zero_three_and_ten_photos(self):
        for count in (0, 3, 10):
            response = self.post(files=[('photos', png(f'p{count}-{i}.png')) for i in range(count)])
            self.assertEqual(response.status_code, 201, response.content)
            self.assertEqual(len(response.json()['photos']), count)
            self.assertIsNone(response.json()['photo'])
            report = CropDisasterReport.objects.get(pk=response.json()['id'])
            self.assertEqual(report.photos.count(), count)
            self.assertFalse(report.photo)

    def test_eleven_photos_save_nothing(self):
        before = CropDisasterReport.objects.count()
        response = self.post(files=[('photos', png(f'p{i}.png')) for i in range(11)])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['photos'], ['Maximum of 10 photos allowed.'])
        self.assertEqual(CropDisasterReport.objects.count(), before)
        self.assertEqual(CropDisasterReportPhoto.objects.count(), 0)
        self.assertEqual(self.files_on_disk(), [])

    def test_one_bad_photo_among_good_ones_saves_nothing(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        before = CropDisasterReport.objects.count()
        files = [('photos', png('a.png')), ('photos', SimpleUploadedFile('b.png', b'not an image', content_type='image/png'))]
        response = self.post(files=files)
        self.assertEqual(response.status_code, 400)
        self.assertTrue(response.json()['photos'][0].startswith('Photo 2: '))
        self.assertEqual(CropDisasterReport.objects.count(), before)
        self.assertEqual(self.files_on_disk(), [])

    def test_an_oversized_photo_saves_nothing(self):
        response = self.post(files=[('photos', big_png())])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(CropDisasterReport.objects.filter(estimated_damage='water').count(), 0)

    def test_a_failure_after_files_were_written_leaves_no_report_and_no_files(self):
        real_create = CropDisasterReportPhoto.objects.create
        calls = {'n': 0}

        def second_fails(*args, **kwargs):
            calls['n'] += 1
            if calls['n'] == 2:
                raise RuntimeError('simulated')
            return real_create(*args, **kwargs)

        self.client.raise_request_exception = False
        before = CropDisasterReport.objects.count()
        with mock.patch('production.views.CropDisasterReportPhoto.objects.create', side_effect=second_fails):
            response = self.post(files=[('photos', png(f'p{i}.png')) for i in range(3)])
        self.assertEqual(response.status_code, 500)
        self.assertEqual(calls['n'], 2)
        self.assertEqual(CropDisasterReport.objects.count(), before)
        self.assertEqual(CropDisasterReportPhoto.objects.count(), 0)
        self.assertEqual(self.files_on_disk(), [])

    def test_the_legacy_single_photo_becomes_a_row_and_counts_toward_ten(self):
        response = self.post(files=[('photo', png('legacy.png'))])
        self.assertEqual(response.status_code, 201, response.content)
        report = CropDisasterReport.objects.get(pk=response.json()['id'])
        self.assertFalse(report.photo)
        self.assertEqual(report.photos.count(), 1)
        too_many = self.post(files=[('photos', png(f'p{i}.png')) for i in range(10)] + [('photo', png('legacy2.png'))])
        self.assertEqual(too_many.status_code, 400)

    def test_a_farmer_reports_on_their_own_record_and_not_on_anothers(self):
        self.client.force_authenticate(self.farmer_user)
        own = self.post(files=[('photos', png('a.png')), ('photos', png('b.png'))])
        self.assertEqual(own.status_code, 201, own.content)
        self.assertEqual(len(own.json()['photos']), 2)
        foreign = self.post(record=self.other_record, files=[('photos', png('c.png'))])
        self.assertEqual(foreign.status_code, 403)
        self.assertEqual(CropDisasterReportPhoto.objects.count(), 2)

    def test_photos_are_listed_for_staff_and_owner_but_not_for_another_farmer(self):
        created = self.post(files=[('photos', png('a.png')), ('photos', png('b.png'))]).json()['id']
        url = f'/api/production/monitoring/{self.record.id}/disasters/'
        self.assertEqual(len(self.client.get(url).json()[0]['photos']), 2)
        self.client.force_authenticate(self.farmer_user)
        self.assertEqual(len(self.client.get(url).json()[0]['photos']), 2)
        self.client.force_authenticate(self.other_user)
        self.assertIn(self.client.get(url).status_code, (403, 404))
        self.assertEqual(CropDisasterReport.objects.get(pk=created).photos.count(), 2)

    def test_document_lists_every_photo_and_the_legacy_one_stays_separate(self):
        report = CropDisasterReport.objects.create(
            monitoring_record=self.record, disaster_type='Flood', date_of_occurrence=date(2026, 9, 1), reported_by=self.admin,
            photo='disaster_reports/crop/old.png')
        for i in range(2):
            CropDisasterReportPhoto.objects.create(disaster_report=report, image=png(f'n{i}.png'), uploaded_by=self.admin)
        doc = self.client.get(f'/api/production/disaster-logs/{report.id}/').json()
        self.assertEqual(len(doc['photos']), 2)
        self.assertTrue(doc['photo'].endswith('old.png'))

    def test_pdf_gets_the_rows_first_then_the_legacy_file_and_skips_a_missing_file(self):
        report = CropDisasterReport.objects.create(
            monitoring_record=self.record, disaster_type='Flood', date_of_occurrence=date(2026, 9, 1), reported_by=self.admin)
        rows = [CropDisasterReportPhoto.objects.create(disaster_report=report, image=png(f'n{i}.png'), uploaded_by=self.admin)
                for i in range(3)]
        os.remove(rows[1].image.path)             # one file vanished from disk
        report = crop_disaster_logs.crop_queryset().get(pk=report.pk)
        doc = crop_disaster_logs.document(report)
        with mock.patch('production.crop_disaster_logs.build_disaster_log_pdf', return_value=b'%PDF') as builder:
            crop_disaster_logs.build_pdf(report, doc)
        paths = builder.call_args.kwargs['photo_paths']
        self.assertEqual(paths, [rows[0].image.path, rows[2].image.path])
        self.assertEqual(len(crop_disaster_logs.document(report)['photos']), 3)

    def test_listing_loads_all_photos_in_one_query(self):
        for _ in range(5):
            report = CropDisasterReport.objects.create(
                monitoring_record=self.record, disaster_type='Flood', date_of_occurrence=date(2026, 9, 1), reported_by=self.admin)
            for i in range(2):
                CropDisasterReportPhoto.objects.create(disaster_report=report, image=png(f'q{i}.png'), uploaded_by=self.admin)
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(f'/api/production/monitoring/{self.record.id}/disasters/')
        self.assertEqual(sum(len(r['photos']) for r in response.json()), 10)
        photo_queries = [q for q in ctx.captured_queries if 'cropdisasterreportphoto' in q['sql'].lower()]
        self.assertEqual(len(photo_queries), 1)

    def test_pdf_works_with_a_storage_that_has_no_local_paths(self):
        """Production keeps media in S3-style storage: files have no .path, so the PDF must read them through storage."""
        from django.core.files.storage import InMemoryStorage
        field = CropDisasterReportPhoto._meta.get_field('image')
        # in-memory storage plus a FieldFile with no local .path: what files in S3-style storage look like
        no_path = mock.patch('django.db.models.fields.files.FieldFile.path', new_callable=mock.PropertyMock, side_effect=NotImplementedError)
        with mock.patch.object(field, 'storage', InMemoryStorage()), no_path:
            report = CropDisasterReport.objects.create(
                monitoring_record=self.record, disaster_type='Flood', date_of_occurrence=date(2026, 9, 1), reported_by=self.admin)
            for i in range(2):
                CropDisasterReportPhoto.objects.create(disaster_report=report, image=png(f'm{i}.png'), uploaded_by=self.admin)
            with self.assertRaises(NotImplementedError):      # the test really runs without local paths
                report.photos.first().image.path
            real_builder = crop_disaster_logs.build_disaster_log_pdf
            with mock.patch('production.crop_disaster_logs.build_disaster_log_pdf', wraps=real_builder) as builder:
                response = self.client.get(f'/api/production/disaster-logs/{report.id}/pdf/')
            self.assertEqual(response.status_code, 200, response.content[:200])
            self.assertEqual(len(builder.call_args.kwargs['photo_paths']), 2)       # both photos reached the PDF
            body = b''.join(response.streaming_content) if response.streaming else response.content
            self.assertTrue(body.startswith(b'%PDF'))
