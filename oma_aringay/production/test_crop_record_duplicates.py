"""A farmer cannot have two active crop records for the same crop and variety on the same parcel."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import FarmParcel, Farmer
from production.models import CropMonitoringRecord, CropType

_RSBSA = itertools.count(930001)


def make_farmer(first):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name=first, last_name='Dupetest', gender='Male',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')


def make_parcel(farmer, barangay='Alaska'):
    return FarmParcel.objects.create(farmer=farmer, area_hectares='2.00', land_ownership='Owner', barangay=barangay)


def make_record(farmer, crop, parcel=None, **over):
    data = dict(farmer=farmer, crop_type=crop, farm_parcel=parcel, farm_location_barangay='Alaska', land_status='Owner',
                season='Wet', year=2026, date_planted=date(2026, 5, 1), area_planted_ha='1.00', status='Planted',
                variety_used='Rc 222')
    data.update(over)
    status = data.pop('status')
    record = CropMonitoringRecord.objects.create(**data)
    # the model recomputes status on save, so the wanted status is written directly
    CropMonitoringRecord.objects.filter(pk=record.pk).update(status=status)
    record.refresh_from_db()
    return record


def payload(farmer, crop, parcel=None, **over):
    data = {
        'farmer': farmer.id, 'crop_type': crop.id, 'farm_parcel': parcel.id if parcel else None,
        'farm_location_barangay': 'Alaska', 'land_status': 'Owner', 'season': 'Wet', 'year': 2026,
        'date_planted': '2026-05-02', 'area_planted_ha': '1.00', 'variety_used': 'Rc 222',
    }
    data.update(over)
    return data


class CropRecordDuplicateTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(
            username='dupe-admin', password='pw', role='ADMIN', email='dupe-admin@x.test')
        cls.crop = CropType.objects.create(name='Dupetest Rice', days_to_harvest=110)
        cls.other_crop = CropType.objects.create(name='Dupetest Corn', days_to_harvest=90)
        cls.farmer = make_farmer('Ana')
        cls.parcel_a = make_parcel(cls.farmer)
        cls.parcel_b = make_parcel(cls.farmer)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def post(self, **over):
        return self.client.post('/api/production/monitoring/', payload(self.farmer, self.crop, **over), format='json')

    def refused(self, response):
        self.assertEqual(response.status_code, 400, response.content)
        message = response.json()['crop_type'][0]
        self.assertIn('already has an active', message)
        return message

    def test_same_crop_variety_and_parcel_is_refused_with_the_record_and_date(self):
        existing = make_record(self.farmer, self.crop, self.parcel_a)
        message = self.refused(self.post(farm_parcel=self.parcel_a.id, variety_used='RC222'))
        self.assertEqual(
            message,
            f'This farmer already has an active Dupetest Rice (Rc 222) record on this parcel '
            f'(record #{existing.id}, planted 2026-05-01). Harvest or close it first, or choose a different parcel.')

    def test_a_different_parcel_is_allowed(self):
        make_record(self.farmer, self.crop, self.parcel_a)
        self.assertEqual(self.post(farm_parcel=self.parcel_b.id).status_code, 201)

    def test_a_different_crop_or_variety_or_farmer_is_allowed(self):
        make_record(self.farmer, self.crop, self.parcel_a)
        self.assertEqual(self.client.post('/api/production/monitoring/', payload(
            self.farmer, self.other_crop, self.parcel_a), format='json').status_code, 201)
        self.assertEqual(self.post(farm_parcel=self.parcel_a.id, variety_used='NSIC Rc 160').status_code, 201)
        stranger = make_farmer('Ben')
        parcel = make_parcel(stranger)
        self.assertEqual(self.client.post('/api/production/monitoring/', payload(
            stranger, self.crop, parcel), format='json').status_code, 201)

    def test_a_new_record_needs_a_parcel_so_the_barangay_no_longer_decides(self):
        # A new farmer crop record must name its parcel (see test_parcel_required); the barangay-only rule now
        # only matters for records made before that, which this farmer's list can still hold.
        make_record(self.farmer, self.crop, None, farm_location_barangay='Alaska')
        for barangay in ('alaska', 'Basca'):
            response = self.post(farm_parcel=None, farm_location_barangay=barangay)
            self.assertEqual(response.status_code, 400)
            self.assertIn('farm_parcel', response.json())

    def test_a_new_parcel_record_is_not_blocked_by_a_barangay_only_record_but_the_same_parcel_is(self):
        make_record(self.farmer, self.crop, None, farm_location_barangay='Alaska', variety_used='Mix')
        make_record(self.farmer, self.crop, self.parcel_a, variety_used='Tag')
        self.assertEqual(self.post(farm_parcel=self.parcel_b.id, variety_used='Mix').status_code, 201)
        self.refused(self.post(farm_parcel=self.parcel_a.id, variety_used='Tag'))

    def test_finished_records_never_block_but_near_harvest_does(self):
        for status in ('Harvested', 'Total Loss'):
            make_record(self.farmer, self.crop, self.parcel_a, status=status, variety_used=f'Old {status}')
            self.assertEqual(self.post(farm_parcel=self.parcel_a.id, variety_used=f'Old {status}').status_code, 201)
        make_record(self.farmer, self.crop, self.parcel_b, variety_used='Late', status='Near Harvest')
        self.refused(self.post(farm_parcel=self.parcel_b.id, variety_used='Late'))

    def test_blank_varieties_are_the_same_variety(self):
        make_record(self.farmer, self.crop, self.parcel_a, variety_used='')
        message = self.refused(self.post(farm_parcel=self.parcel_a.id, variety_used=''))
        self.assertIn('Dupetest Rice record on this parcel', message)

    def test_unrelated_edit_of_an_existing_duplicate_is_allowed(self):
        first = make_record(self.farmer, self.crop, self.parcel_a)
        make_record(self.farmer, self.crop, self.parcel_a)
        response = self.client.patch(f'/api/production/monitoring/{first.id}/', {'area_planted_ha': '1.50'}, format='json')
        self.assertEqual(response.status_code, 200, response.content)

    def form_edit(self, record, **over):
        """What the Edit Crop Record form sends: the deciding fields are always present, whether changed or not."""
        body = {
            'farmer': record.farmer_id, 'farm_location_barangay': record.farm_location_barangay,
            'variety_used': record.variety_used, 'area_planted_ha': '1.50', 'season': 'Wet', 'land_status': 'Owner',
            'date_planted': str(record.date_planted),
        }
        body.update(over)
        return self.client.patch(f'/api/production/monitoring/{record.id}/', body, format='json')

    def test_the_edit_form_can_save_a_record_that_is_already_part_of_a_duplicate_pair(self):
        first = make_record(self.farmer, self.crop, self.parcel_a)
        make_record(self.farmer, self.crop, self.parcel_a)
        response = self.form_edit(first)
        self.assertEqual(response.status_code, 200, response.content)

    def test_a_total_loss_record_can_be_edited_after_the_crop_was_replanted(self):
        lost = make_record(self.farmer, self.crop, self.parcel_a, status='Total Loss')
        make_record(self.farmer, self.crop, self.parcel_a)
        response = self.form_edit(lost)
        self.assertEqual(response.status_code, 200, response.content)

    def test_a_barangay_only_record_can_be_edited_after_a_parcel_record_was_added(self):
        barangay_only = make_record(self.farmer, self.crop, None, farm_location_barangay='Alaska')
        self.assertEqual(self.post(farm_parcel=self.parcel_a.id).status_code, 201)
        response = self.form_edit(barangay_only)
        self.assertEqual(response.status_code, 200, response.content)

    def test_moving_a_record_onto_a_parcel_that_already_has_the_crop_is_refused(self):
        make_record(self.farmer, self.crop, self.parcel_a)
        second = make_record(self.farmer, self.crop, self.parcel_b)
        self.refused(self.form_edit(second, farm_parcel=self.parcel_a.id))

    def test_changing_the_variety_into_a_duplicate_is_refused_but_keeping_it_is_fine(self):
        make_record(self.farmer, self.crop, self.parcel_a, variety_used='Rc 222')
        second = make_record(self.farmer, self.crop, self.parcel_a, variety_used='Other Variety')
        url = f'/api/production/monitoring/{second.id}/'
        self.refused(self.client.patch(url, {'variety_used': 'rc-222'}, format='json'))
        self.assertEqual(self.client.patch(url, {'variety_used': 'Other Variety'}, format='json').status_code, 200)

    def test_check_endpoint_matches_the_refusal(self):
        existing = make_record(self.farmer, self.crop, self.parcel_a)
        params = {'farmer': self.farmer.id, 'crop_type': self.crop.id, 'variety': 'RC222', 'parcel': self.parcel_a.id}
        found = self.client.get('/api/production/monitoring/check-duplicate/', params).json()['duplicates']
        self.assertEqual([d['id'] for d in found], [existing.id])
        self.assertEqual(found[0]['variety_used'], 'Rc 222')
        self.assertEqual(self.client.get('/api/production/monitoring/check-duplicate/', {**params, 'exclude': existing.id}).json()['duplicates'], [])
        self.assertEqual(self.client.get('/api/production/monitoring/check-duplicate/', {**params, 'parcel': self.parcel_b.id}).json()['duplicates'], [])

    def test_bulk_refuses_a_row_that_repeats_an_earlier_row_and_saves_nothing(self):
        before = CropMonitoringRecord.objects.count()
        rows = [payload(self.farmer, self.crop, self.parcel_a), payload(self.farmer, self.crop, self.parcel_a, variety_used='RC-222')]
        response = self.client.post('/api/production/monitoring/bulk/', rows, format='json')
        self.assertEqual(response.status_code, 400)
        errors = response.json()['errors']
        self.assertEqual(errors[0], {})
        self.assertEqual(errors[1]['crop_type'], ['This record duplicates row 1 of this form.'])
        self.assertEqual(CropMonitoringRecord.objects.count(), before)

    def test_bulk_refuses_a_row_that_duplicates_an_existing_record_and_saves_nothing(self):
        make_record(self.farmer, self.crop, self.parcel_a)
        before = CropMonitoringRecord.objects.count()
        rows = [payload(self.farmer, self.crop, self.parcel_b), payload(self.farmer, self.crop, self.parcel_a)]
        response = self.client.post('/api/production/monitoring/bulk/', rows, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['errors'][0], {})
        self.assertIn('already has an active', response.json()['errors'][1]['crop_type'][0])
        self.assertEqual(CropMonitoringRecord.objects.count(), before)

    def test_bulk_accepts_distinct_rows(self):
        rows = [payload(self.farmer, self.crop, self.parcel_a), payload(self.farmer, self.crop, self.parcel_b)]
        response = self.client.post('/api/production/monitoring/bulk/', rows, format='json')
        self.assertEqual(response.status_code, 201, response.content)
