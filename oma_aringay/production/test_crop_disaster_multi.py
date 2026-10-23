"""One disaster event on several of a farmer's crops, logged in one go: POST /api/production/disasters/multi/.
One CropDisasterReport per crop (each keeps its own recovery, Total Loss and photos); all or nothing."""
import itertools
import json
import os
import shutil
import tempfile
from datetime import date

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from core.test_photos import png
from farmers.models import Farmer
from production.models import CropDisasterReport, CropMonitoringRecord, CropType

URL = '/api/production/disasters/multi/'
_RSBSA = itertools.count(950001)


def make_farmer(first):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name=first, last_name='Multi', gender='Male',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')


def make_record(farmer, area='2.00', **over):
    data = dict(farmer=farmer, farm_location_barangay='Alaska', land_status='Owner', crop_type=CropType.objects.order_by('id').first(),
                season='Wet', year=2026, date_planted=date(2026, 5, 1), area_planted_ha=area, status='Planted')
    data.update(over)
    return CropMonitoringRecord.objects.create(**data)


def make_citizen(username, record_type, record_id):
    user = get_user_model().objects.create_user(username=username, password='pw', role='CITIZEN', email=f'{username}@x.test')
    UserLinkedRecord.objects.create(user=user, record_type=record_type, record_id=record_id, is_active=True)
    return user


class MultiCropDisasterTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='mc-admin', password='pw', role='ADMIN', email='mc-admin@x.test')
        cls.ana, cls.ben = make_farmer('Ana'), make_farmer('Ben')
        cls.a1 = make_record(cls.ana, '1.50')
        cls.a2 = make_record(cls.ana, '2.00')
        cls.a3 = make_record(cls.ana, '1.00')
        cls.b1 = make_record(cls.ben, '1.00')
        cls.ana_user = make_citizen('mc-ana', 'FARMER', cls.ana.id)
        cls.fisher_user = make_citizen('mc-fish', 'FISHERFOLK', cls.ana.id)   # a fisherfolk whose id happens to match

    def setUp(self):
        self.media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media, True)
        override = override_settings(MEDIA_ROOT=self.media)
        override.enable()
        self.addCleanup(override.disable)
        self.client.force_authenticate(self.admin)

    def body(self, crops, **over):
        data = {'disaster_type': 'Typhoon', 'date_of_occurrence': '2026-09-01', 'estimated_damage': 'Flattened by wind',
                'production_loss': 'About half', 'crops': crops}
        data.update(over)
        return data

    def post(self, crops, **over):
        return self.client.post(URL, self.body(crops, **over), format='json')

    # --- the happy path
    def test_one_report_per_crop_with_the_shared_fields_and_each_crops_own_area(self):
        r = self.post([{'monitoring_record': self.a1.id, 'area_affected_ha': '1.00'}, {'monitoring_record': self.a2.id, 'area_affected_ha': '2.00'}])
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(len(r.json()), 2)
        reports = {d.monitoring_record_id: d for d in CropDisasterReport.objects.all()}
        self.assertEqual(set(reports), {self.a1.id, self.a2.id})
        self.assertEqual(reports[self.a1.id].disaster_type, 'Typhoon')
        self.assertEqual(str(reports[self.a1.id].area_affected_ha), '1.0000')
        self.assertEqual(str(reports[self.a2.id].area_affected_ha), '2.0000')
        self.assertEqual({d.estimated_damage for d in reports.values()}, {'Flattened by wind'})
        self.assertEqual({d.reported_by_id for d in reports.values()}, {self.admin.id})

    def test_a_single_crop_works_the_same_way(self):
        self.assertEqual(self.post([{'monitoring_record': self.a1.id, 'area_affected_ha': '0.50'}]).status_code, 201)

    def test_total_loss_marks_only_that_crop(self):
        r = self.post([{'monitoring_record': self.a1.id, 'area_affected_ha': '1.50', 'is_total_loss': True},
                       {'monitoring_record': self.a2.id, 'area_affected_ha': '1.00'}])
        self.assertEqual(r.status_code, 201, r.content)
        self.a1.refresh_from_db(); self.a2.refresh_from_db()
        self.assertEqual(self.a1.status, 'Total Loss')
        self.assertNotEqual(self.a2.status, 'Total Loss')

    # --- all or nothing
    def test_one_bad_crop_saves_nothing(self):
        r = self.post([{'monitoring_record': self.a1.id, 'area_affected_ha': '1.00'}, {'monitoring_record': self.a2.id, 'area_affected_ha': '5.00'}])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(CropDisasterReport.objects.count(), 0)

    def test_the_error_names_the_crop_that_failed(self):
        r = self.post([{'monitoring_record': self.a1.id, 'area_affected_ha': '1.00'}, {'monitoring_record': self.a2.id, 'area_affected_ha': '5.00'}])
        self.assertEqual([e['monitoring_record'] for e in r.json()['errors']], [self.a2.id])
        self.assertIn('area_affected_ha', r.json()['errors'][0]['errors'])

    def test_total_loss_on_a_partial_area_is_refused(self):
        r = self.post([{'monitoring_record': self.a1.id, 'area_affected_ha': '1.00', 'is_total_loss': True}])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(CropDisasterReport.objects.count(), 0)

    def test_a_missing_disaster_type_is_refused(self):
        r = self.post([{'monitoring_record': self.a1.id, 'area_affected_ha': '1.00'}], disaster_type='')
        self.assertEqual(r.status_code, 400)

    def test_other_needs_a_description(self):
        r = self.post([{'monitoring_record': self.a1.id, 'area_affected_ha': '1.00'}], disaster_type='Other')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.post([{'monitoring_record': self.a1.id, 'area_affected_ha': '1.00'}], disaster_type='Other',
                                   disaster_type_other_specify='Locusts').status_code, 201)

    # --- which crops are allowed together
    def test_staff_can_log_one_event_on_the_crops_of_several_farmers(self):
        r = self.post([{'monitoring_record': self.a1.id, 'area_affected_ha': '1.00'}, {'monitoring_record': self.b1.id, 'area_affected_ha': '1.00', 'is_total_loss': True}])
        self.assertEqual(r.status_code, 201, r.content)
        reports = CropDisasterReport.objects.select_related('monitoring_record').order_by('id')
        self.assertEqual([x.monitoring_record.farmer_id for x in reports], [self.ana.id, self.ben.id])
        self.assertEqual([x.is_total_loss for x in reports], [False, True])
        self.assertEqual({x.disaster_type for x in reports}, {'Typhoon'})

    def test_one_bad_crop_of_another_farmer_saves_nothing_for_anyone(self):
        r = self.post([{'monitoring_record': self.a1.id, 'area_affected_ha': '1.00'}, {'monitoring_record': self.b1.id, 'area_affected_ha': '9.00'}])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(CropDisasterReport.objects.count(), 0)

    def test_a_farmer_account_still_cannot_mix_farmers(self):
        self.client.force_authenticate(self.ana_user)
        r = self.post([{'monitoring_record': self.a1.id, 'area_affected_ha': '1.00'}, {'monitoring_record': self.b1.id, 'area_affected_ha': '1.00'}])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(CropDisasterReport.objects.count(), 0)

    def test_a_crop_with_no_farmer_is_refused(self):
        orphan = make_record(None, '1.00')
        r = self.post([{'monitoring_record': orphan.id, 'area_affected_ha': '1.00'}])
        self.assertEqual(r.status_code, 400)

    def test_an_unknown_crop_the_same_crop_twice_and_an_empty_list_are_refused(self):
        self.assertEqual(self.post([{'monitoring_record': 999999, 'area_affected_ha': '1.00'}]).status_code, 400)
        self.assertEqual(self.post([{'monitoring_record': self.a1.id, 'area_affected_ha': '1.00'}, {'monitoring_record': self.a1.id, 'area_affected_ha': '0.50'}]).status_code, 400)
        self.assertEqual(self.post([]).status_code, 400)

    def test_more_than_two_hundred_crops_are_refused(self):
        crops = [{'monitoring_record': i, 'area_affected_ha': '1.00'} for i in range(1, 203)]
        r = self.post(crops)
        self.assertEqual(r.status_code, 400)
        self.assertIn('200', json.dumps(r.json()))

    # --- who may use it
    def test_a_farmer_can_log_on_their_own_crops(self):
        self.client.force_authenticate(self.ana_user)
        r = self.post([{'monitoring_record': self.a1.id, 'area_affected_ha': '1.00'}, {'monitoring_record': self.a3.id, 'area_affected_ha': '1.00'}])
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual({d.reported_by_id for d in CropDisasterReport.objects.all()}, {self.ana_user.id})

    def test_a_farmer_cannot_log_on_someone_elses_crop(self):
        self.client.force_authenticate(self.ana_user)
        r = self.post([{'monitoring_record': self.b1.id, 'area_affected_ha': '1.00'}])
        self.assertEqual(r.status_code, 403)
        self.assertEqual(CropDisasterReport.objects.count(), 0)

    def test_a_fisherfolk_account_with_a_matching_number_is_refused(self):
        self.client.force_authenticate(self.fisher_user)
        self.assertEqual(self.post([{'monitoring_record': self.a1.id, 'area_affected_ha': '1.00'}]).status_code, 403)

    def test_an_anonymous_request_is_refused(self):
        self.client.force_authenticate(None)
        self.assertIn(self.post([{'monitoring_record': self.a1.id, 'area_affected_ha': '1.00'}]).status_code, (401, 403))

    # --- photos
    def test_each_report_keeps_its_own_copy_of_the_photos(self):
        data = {'disaster_type': 'Flood', 'date_of_occurrence': '2026-09-01', 'estimated_damage': 'water',
                'crops': json.dumps([{'monitoring_record': self.a1.id, 'area_affected_ha': '1.00'}, {'monitoring_record': self.a2.id, 'area_affected_ha': '1.00'}]),
                'photos': [png('one.png'), png('two.png')]}
        r = self.client.post(URL, data, format='multipart')
        self.assertEqual(r.status_code, 201, r.content)
        reports = list(CropDisasterReport.objects.prefetch_related('photos'))
        self.assertEqual([p.photos.count() for p in reports], [2, 2])
        names = [ph.image.name for d in reports for ph in d.photos.all()]
        self.assertEqual(len(set(names)), 4)                       # four files, not two shared ones
        folder = os.path.join(self.media, 'disaster_reports', 'crop', 'photos')
        self.assertEqual(len(os.listdir(folder)), 4)

    def test_a_failed_batch_leaves_no_photo_files(self):
        data = {'disaster_type': 'Flood', 'date_of_occurrence': '2026-09-01', 'estimated_damage': 'water',
                'crops': json.dumps([{'monitoring_record': self.a1.id, 'area_affected_ha': '1.00'}, {'monitoring_record': self.a2.id, 'area_affected_ha': '9.00'}]),
                'photos': [png('one.png')]}
        r = self.client.post(URL, data, format='multipart')
        self.assertEqual(r.status_code, 400)
        folder = os.path.join(self.media, 'disaster_reports', 'crop', 'photos')
        self.assertEqual(os.listdir(folder) if os.path.isdir(folder) else [], [])
