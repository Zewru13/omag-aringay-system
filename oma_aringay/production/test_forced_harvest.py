"""Forced Harvest of crops: a crop harvested more than 7 days early for a stated reason (an upcoming typhoon, a drought, ...).
POST /api/production/create/ with a force_harvest_reason, and POST /api/production/forced-harvest/ for several crops at once."""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from core.models import Notification
from farmers.models import FarmParcel, Farmer
from production.models import CropMonitoringRecord, CropType, HarvestRecord

CREATE_URL = '/api/production/create/'
MULTI_URL = '/api/production/forced-harvest/'
_RSBSA = itertools.count(960001)


class ForcedHarvestTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='fh-adm', password='pw', role='ADMIN', email='fha@x.test')
        cls.other_admin = User.objects.create_user(username='fh-adm2', password='pw', role='ADMIN', email='fha2@x.test')
        cls.focal = User.objects.create_user(username='fh-foc', password='pw', role='EVALUATOR', email='fhf@x.test')
        cls.citizen = User.objects.create_user(username='fh-cit', password='pw', role='CITIZEN', email='fhc@x.test')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name='Ana', last_name='Forced', gender='Female',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        cls.parcel = FarmParcel.objects.create(farmer=cls.farmer, parcel_number='01-33-02-005-001-02-003', area_hectares='5.00',
                                               land_ownership='Owner', barangay='Alaska')
        cls.rice, _ = CropType.objects.get_or_create(name='Forced Rice', defaults=dict(days_to_harvest=100))
        cls.rice.days_to_harvest = 100
        cls.rice.save()
        cls.corn, _ = CropType.objects.get_or_create(name='Forced Corn', defaults=dict(days_to_harvest=90))
        cls.corn.days_to_harvest = 90
        cls.corn.save()

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def crop(self, crop_type=None, planted_days_ago=20, **over):
        data = dict(farmer=self.farmer, farm_parcel=self.parcel, farm_location_barangay='Alaska', land_status='Owner',
                    crop_type=crop_type or self.rice, season='Wet', year=2026, date_planted=date.today() - timedelta(days=planted_days_ago),
                    area_planted_ha='1.00', status='Planted', variety_used='')
        data.update(over)
        return CropMonitoringRecord.objects.create(**data)

    def body(self, crop, **over):
        body = {'monitoring_record': crop.id, 'farm_parcel': self.parcel.id, 'harvest_start_date': str(date.today()), 'season': 'Wet',
                'year': 2026, 'crop_name': crop.crop_type.name, 'area_harvested_hectares': '1.00', 'volume_kg': '100', 'unit_of_measure': 'kg'}
        body.update(over)
        return body

    def multi(self, crops, **over):
        data = {'harvest_date': str(date.today()), 'force_harvest_reason': 'upcoming_typhoon', 'force_harvest_detail': '', 'remarks': '',
                'crops': [{'monitoring_record': c.id, 'area_harvested_hectares': '1.00', 'volume_kg': '100', 'unit_of_measure': 'kg'} for c in crops]}
        data.update(over)
        return self.client.post(MULTI_URL, data, format='json')

    # --- one crop, from Record Harvest
    def test_a_forced_harvest_saves_the_reason_and_the_readable_sentence(self):
        crop = self.crop()
        r = self.client.post(CREATE_URL, self.body(crop, force_harvest_reason='upcoming_typhoon', force_harvest_detail='signal no. 3 on Friday'), format='json')
        self.assertEqual(r.status_code, 201, r.content)
        harvest = HarvestRecord.objects.get(pk=r.json()['id'])
        self.assertEqual(harvest.force_harvest_reason, 'upcoming_typhoon')
        self.assertEqual(harvest.early_late_reason, 'Forced harvest due to early harvest: Upcoming Typhoon (signal no. 3 on Friday)')
        crop.refresh_from_db()
        self.assertEqual(crop.status, 'Harvested')

    def test_other_needs_a_description_and_it_is_the_reason(self):
        crop = self.crop()
        refused = self.client.post(CREATE_URL, self.body(crop, force_harvest_reason='other'), format='json')
        self.assertEqual(refused.status_code, 400)
        self.assertIn('force_harvest_detail', refused.json())
        ok = self.client.post(CREATE_URL, self.body(crop, force_harvest_reason='other', force_harvest_detail='Buyer pays double now'), format='json')
        self.assertEqual(ok.status_code, 201, ok.content)
        self.assertEqual(HarvestRecord.objects.get(pk=ok.json()['id']).early_late_reason, 'Forced harvest due to early harvest: Other: Buyer pays double now')

    def test_a_harvest_within_seven_days_is_not_a_forced_harvest(self):
        crop = self.crop(planted_days_ago=96)       # 4 days before the expected date
        r = self.client.post(CREATE_URL, self.body(crop, force_harvest_reason='drought'), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('more than 7 days', json_text(r))

    def test_an_unknown_reason_is_refused(self):
        r = self.client.post(CREATE_URL, self.body(self.crop(), force_harvest_reason='boredom'), format='json')
        self.assertEqual(r.status_code, 400)

    def test_an_ordinary_early_harvest_with_a_free_text_reason_still_works_and_is_not_forced(self):
        crop = self.crop()
        r = self.client.post(CREATE_URL, self.body(crop, early_late_reason='Drought'), format='json')
        self.assertEqual(r.status_code, 201, r.content)
        harvest = HarvestRecord.objects.get(pk=r.json()['id'])
        self.assertEqual((harvest.force_harvest_reason, harvest.early_late_reason), ('', 'Drought'))

    def test_the_crop_record_and_the_harvest_expose_the_forced_harvest(self):
        crop = self.crop()
        harvest_id = self.client.post(CREATE_URL, self.body(crop, force_harvest_reason='el_nino'), format='json').json()['id']
        record = self.client.get(f'/api/production/monitoring/{crop.id}/').json()
        self.assertEqual(record['forced_harvest']['label'], 'El Niño')
        self.assertEqual(record['forced_harvest']['text'], 'Forced harvest due to early harvest: El Niño')
        detail = self.client.get(f'/api/production/{harvest_id}/').json()
        self.assertEqual((detail['force_harvest_reason'], detail['force_harvest_label']), ('el_nino', 'El Niño'))
        normal = self.crop(planted_days_ago=96)
        self.client.post(CREATE_URL, self.body(normal), format='json')
        self.assertIsNone(self.client.get(f'/api/production/monitoring/{normal.id}/').json()['forced_harvest'])

    def test_only_admins_other_than_the_one_who_recorded_it_are_told(self):
        crop = self.crop()
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(CREATE_URL, self.body(crop, force_harvest_reason='drought'), format='json')
        rows = Notification.objects.filter(verb__startswith='recorded a Forced Harvest')
        self.assertEqual([n.recipient_id for n in rows], [self.other_admin.id])
        self.assertEqual(rows[0].record_type, 'crop')
        self.assertEqual(rows[0].record_id, crop.id)
        self.assertIn('Drought', rows[0].detail)

    # --- several crops of a parcel
    def test_several_crops_are_force_harvested_together_with_one_notice(self):
        a, b = self.crop(self.rice), self.crop(self.corn, planted_days_ago=10)
        with self.captureOnCommitCallbacks(execute=True):
            r = self.multi([a, b], force_harvest_reason='possible_flooding', force_harvest_detail='river rising', remarks='Whole parcel')
        self.assertEqual(r.status_code, 201, r.content)
        harvests = HarvestRecord.objects.order_by('id')
        self.assertEqual(harvests.count(), 2)
        self.assertEqual({h.force_harvest_reason for h in harvests}, {'possible_flooding'})
        self.assertEqual({h.early_late_reason for h in harvests}, {'Forced harvest due to early harvest: Possible Flooding (river rising)'})
        self.assertEqual({h.farm_parcel_id for h in harvests}, {self.parcel.id})
        self.assertEqual({h.remarks for h in harvests}, {'Whole parcel'})
        self.assertEqual({CropMonitoringRecord.objects.get(pk=c.id).status for c in (a, b)}, {'Harvested'})
        notes = Notification.objects.filter(verb__startswith='recorded a Forced Harvest')
        self.assertEqual(notes.count(), 1)
        self.assertEqual(notes[0].recipient_id, self.other_admin.id)
        self.assertIn('Forced Rice', notes[0].record_label)
        self.assertIn('200', notes[0].detail)

    def test_one_crop_that_is_not_early_saves_nothing(self):
        early, ready = self.crop(), self.crop(self.corn, planted_days_ago=88)   # 2 days before its expected date
        with self.captureOnCommitCallbacks(execute=True):
            r = self.multi([early, ready])
        self.assertEqual(r.status_code, 400)
        self.assertIn('more than 7 days', r.json()['detail'])
        self.assertEqual(HarvestRecord.objects.count(), 0)
        self.assertEqual(Notification.objects.filter(verb__startswith='recorded a Forced Harvest').count(), 0)

    def test_a_harvested_or_lost_crop_is_refused(self):
        for status in ('Harvested', 'Total Loss'):
            r = self.multi([self.crop(status=status)])
            self.assertEqual(r.status_code, 400)
            self.assertIn('cannot be force harvested', r.json()['detail'])
        self.assertEqual(HarvestRecord.objects.count(), 0)

    def test_a_bad_yield_on_one_crop_saves_nothing_for_the_others(self):
        a, b = self.crop(self.rice), self.crop(self.corn)
        data = {'harvest_date': str(date.today()), 'force_harvest_reason': 'drought',
                'crops': [{'monitoring_record': a.id, 'area_harvested_hectares': '1.00', 'volume_kg': '100', 'unit_of_measure': 'kg'},
                          {'monitoring_record': b.id, 'area_harvested_hectares': '1.00', 'volume_kg': '', 'unit_of_measure': 'kg'}]}
        self.assertEqual(self.client.post(MULTI_URL, data, format='json').status_code, 400)
        self.assertEqual(HarvestRecord.objects.count(), 0)
        self.assertEqual(CropMonitoringRecord.objects.get(pk=a.id).status, 'Planted')

    def test_the_request_itself_is_checked(self):
        crop = self.crop()
        self.assertEqual(self.multi([crop], force_harvest_reason='').status_code, 400)
        self.assertEqual(self.multi([crop], force_harvest_reason='other').status_code, 400)
        self.assertEqual(self.multi([crop], harvest_date=str(date.today() + timedelta(days=1))).status_code, 400)
        self.assertEqual(self.multi([crop], harvest_date='soon').status_code, 400)
        self.assertEqual(self.multi([]).status_code, 400)
        self.assertEqual(self.multi([crop, crop]).status_code, 400)
        self.assertEqual(self.client.post(MULTI_URL, {'harvest_date': str(date.today()), 'force_harvest_reason': 'drought',
                                                     'crops': [{'monitoring_record': 999999}]}, format='json').status_code, 400)
        self.assertEqual(HarvestRecord.objects.count(), 0)

    def test_more_than_a_hundred_crops_are_refused(self):
        crops = [{'monitoring_record': i, 'volume_kg': '1', 'area_harvested_hectares': '1'} for i in range(1, 103)]
        r = self.client.post(MULTI_URL, {'harvest_date': str(date.today()), 'force_harvest_reason': 'drought', 'crops': crops}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('100', json_text(r))

    def test_staff_only(self):
        crop = self.crop()
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.multi([crop]).status_code, 403)
        self.client.force_authenticate(self.focal)
        self.assertEqual(self.multi([crop]).status_code, 201)
        self.client.force_authenticate(None)
        self.assertIn(self.multi([self.crop(self.corn)]).status_code, (401, 403))


def json_text(response):
    import json
    return json.dumps(response.json())
