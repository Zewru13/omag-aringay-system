"""Harvest units and their weight in kg: a harvest is typed in the unit it was counted in and saved in kg (production/unit_weights.py),
with the weights managed in Settings > Harvest Units (/api/production/harvest-unit-weights/)."""
import itertools
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import Farmer
from production.models import CropMonitoringRecord, CropType, HarvestRecord, HarvestUnitWeight
from production.unit_weights import weight_for

CREATE_URL = '/api/production/create/'
FORCED_URL = '/api/production/forced-harvest/'
WEIGHTS_URL = '/api/production/harvest-unit-weights/'
_RSBSA = itertools.count(980001)


class HarvestUnitWeightTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='uw-adm', password='pw', role='ADMIN', email='uwa@x.test')
        cls.focal = User.objects.create_user(username='uw-foc', password='pw', role='EVALUATOR', email='uwf@x.test')
        cls.citizen = User.objects.create_user(username='uw-cit', password='pw', role='CITIZEN', email='uwc@x.test')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name='Ana', last_name='Weight', gender='Female',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        cls.corn = CropType.objects.create(name='Weight Corn', days_to_harvest=100, allowed_units=['kg', 'Sack', 'Bundle'])
        cls.garlic = CropType.objects.create(name='Weight Garlic', days_to_harvest=100, allowed_units=['kg', 'Sack', 'Bundle'])
        HarvestUnitWeight.objects.create(unit='Sack', crop_type=cls.corn, kg_per_unit='50', note='corn sack')
        HarvestUnitWeight.objects.create(unit='Sack', crop_type=None, kg_per_unit='30', note='any sack')
        HarvestUnitWeight.objects.create(unit='Bundle', crop_type=cls.garlic, kg_per_unit=None, note='no standard')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def crop(self, crop_type=None, planted='5.00', planted_days_ago=96):
        return CropMonitoringRecord.objects.create(
            farmer=self.farmer, farm_location_barangay='Alaska', land_status='Owner', crop_type=crop_type or self.corn, season='Wet', year=2026,
            date_planted=date.today() - timedelta(days=planted_days_ago), area_planted_ha=planted, status='Planted')

    def body(self, crop, **over):
        body = {'monitoring_record': crop.id, 'harvest_start_date': str(date.today()), 'season': 'Wet', 'year': 2026, 'crop_name': crop.crop_type.name,
                'area_harvested_hectares': '1.00', 'unit_of_measure': 'kg'}
        body.update(over)
        return body

    # --- finding the weight
    def test_kg_is_built_in_and_the_seeded_units_have_their_official_weights(self):
        self.assertEqual(weight_for('kg'), Decimal(1))
        self.assertEqual(weight_for('KG'), Decimal(1))
        self.assertEqual(weight_for(''), Decimal(1))
        self.assertEqual(weight_for('Metric Ton'), Decimal('1000'))
        self.assertEqual(weight_for('Cavan (50kg)'), Decimal('50'))
        self.assertEqual(weight_for('cavan'), Decimal('50'))
        self.assertEqual(weight_for('bags'), Decimal('50'))
        self.assertIsNone(weight_for('Crate'))

    def test_the_crops_own_row_wins_over_the_row_for_every_crop(self):
        self.assertEqual(weight_for('sack', self.corn.id), Decimal('50'))
        self.assertEqual(weight_for('Sack', self.garlic.id), Decimal('30'))
        self.assertEqual(weight_for('Sack'), Decimal('30'))
        self.assertIsNone(weight_for('Bundle', self.garlic.id))

    # --- a harvest typed in a unit
    def test_a_quantity_is_saved_as_kg_and_keeps_what_was_counted_and_the_weight_used(self):
        r = self.client.post(CREATE_URL, self.body(self.crop(self.corn), quantity_harvested='20', unit_of_measure='Sack'), format='json')
        self.assertEqual(r.status_code, 201, r.content)
        harvest = HarvestRecord.objects.get(pk=r.json()['id'])
        self.assertEqual((harvest.volume_kg, harvest.quantity_harvested, harvest.kg_per_unit, harvest.unit_of_measure),
                         (Decimal('1000.00'), Decimal('20.00'), Decimal('50.0000'), 'Sack'))
        self.assertEqual(r.json()['quantity_harvested'], '20.00')
        self.assertEqual(r.json()['kg_per_unit'], '50.0000')

    def test_another_crops_sack_uses_the_row_for_every_crop(self):
        r = self.client.post(CREATE_URL, self.body(self.crop(self.garlic), quantity_harvested='10', unit_of_measure='Sack'), format='json')
        self.assertEqual(HarvestRecord.objects.get(pk=r.json()['id']).volume_kg, Decimal('300.00'))

    def test_kg_needs_no_weight_and_a_sent_total_is_ignored(self):
        r = self.client.post(CREATE_URL, self.body(self.crop(), quantity_harvested='125.5', volume_kg='999'), format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(HarvestRecord.objects.get(pk=r.json()['id']).volume_kg, Decimal('125.50'))

    def test_a_unit_with_no_standard_weight_needs_the_total_kg(self):
        crop = self.crop(self.garlic)
        refused = self.client.post(CREATE_URL, self.body(crop, quantity_harvested='20', unit_of_measure='Bundle'), format='json')
        self.assertEqual(refused.status_code, 400)
        self.assertIn('no standard weight', refused.json()['volume_kg'][0])
        ok = self.client.post(CREATE_URL, self.body(crop, quantity_harvested='20', unit_of_measure='Bundle', volume_kg='40'), format='json')
        self.assertEqual(ok.status_code, 201, ok.content)
        harvest = HarvestRecord.objects.get(pk=ok.json()['id'])
        self.assertEqual((harvest.volume_kg, harvest.quantity_harvested, harvest.kg_per_unit), (Decimal('40.00'), Decimal('20.00'), None))

    def test_a_harvest_sent_the_old_way_is_saved_as_it_always_was(self):
        r = self.client.post(CREATE_URL, self.body(self.crop(), volume_kg='300'), format='json')
        self.assertEqual(r.status_code, 201, r.content)
        harvest = HarvestRecord.objects.get(pk=r.json()['id'])
        self.assertEqual((harvest.volume_kg, harvest.quantity_harvested, harvest.kg_per_unit), (Decimal('300.00'), None, None))
        self.assertEqual(self.client.post(CREATE_URL, self.body(self.crop()), format='json').status_code, 400)

    # --- editing
    def test_editing_the_quantity_or_the_unit_recomputes_the_kg(self):
        crop = self.crop(self.corn)
        harvest_id = self.client.post(CREATE_URL, self.body(crop, quantity_harvested='20', unit_of_measure='Sack', area_harvested_hectares='0.50'),
                                      format='json').json()['id']
        url = f'/api/production/{harvest_id}/'
        self.assertEqual(self.client.patch(url, {'quantity_harvested': '30', 'unit_of_measure': 'Sack'}, format='json').status_code, 200)
        self.assertEqual(HarvestRecord.objects.get(pk=harvest_id).volume_kg, Decimal('1500.00'))
        self.assertEqual(self.client.patch(url, {'unit_of_measure': 'kg'}, format='json').status_code, 200)
        saved = HarvestRecord.objects.get(pk=harvest_id)
        self.assertEqual((saved.volume_kg, saved.quantity_harvested, saved.kg_per_unit), (Decimal('30.00'), Decimal('30.00'), Decimal('1.0000')))

    def test_editing_something_else_leaves_the_kg_alone_and_an_old_harvest_stays_as_it_was(self):
        crop = self.crop(self.corn)
        old = HarvestRecord.objects.create(monitoring_record=crop, season='Wet', year=2026, crop_name='x', area_harvested_hectares='1.00',
                                           volume_kg='50.00', unit_of_measure='cavan', harvest_start_date=date.today())
        r = self.client.patch(f'/api/production/{old.id}/', {'remarks': 'checked'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        old.refresh_from_db()
        self.assertEqual((old.volume_kg, old.quantity_harvested, old.kg_per_unit), (Decimal('50.00'), None, None))

    def test_changing_a_setting_never_rewrites_a_saved_harvest(self):
        crop = self.crop(self.corn)
        harvest_id = self.client.post(CREATE_URL, self.body(crop, quantity_harvested='20', unit_of_measure='Sack'), format='json').json()['id']
        HarvestUnitWeight.objects.filter(unit='Sack', crop_type=self.corn).update(kg_per_unit='60')
        saved = HarvestRecord.objects.get(pk=harvest_id)
        self.assertEqual((saved.volume_kg, saved.kg_per_unit), (Decimal('1000.00'), Decimal('50.0000')))

    # --- several crops of a parcel
    def test_a_forced_harvest_of_several_crops_converts_each_crops_units(self):
        a, b = self.crop(self.corn, planted_days_ago=20), self.crop(self.garlic, planted_days_ago=20)
        data = {'harvest_date': str(date.today()), 'force_harvest_reason': 'drought', 'crops': [
            {'monitoring_record': a.id, 'area_harvested_hectares': '1', 'quantity_harvested': '10', 'unit_of_measure': 'Sack'},
            {'monitoring_record': b.id, 'area_harvested_hectares': '1', 'quantity_harvested': '10', 'unit_of_measure': 'Sack'}]}
        r = self.client.post(FORCED_URL, data, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(sorted(h.volume_kg for h in HarvestRecord.objects.all()), [Decimal('300.00'), Decimal('500.00')])

    def test_a_forced_harvest_with_a_unit_with_no_weight_and_no_total_saves_nothing(self):
        a, b = self.crop(self.corn, planted_days_ago=20), self.crop(self.garlic, planted_days_ago=20)
        data = {'harvest_date': str(date.today()), 'force_harvest_reason': 'drought', 'crops': [
            {'monitoring_record': a.id, 'area_harvested_hectares': '1', 'quantity_harvested': '10', 'unit_of_measure': 'Sack'},
            {'monitoring_record': b.id, 'area_harvested_hectares': '1', 'quantity_harvested': '10', 'unit_of_measure': 'Bundle'}]}
        r = self.client.post(FORCED_URL, data, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('no standard weight', r.json()['detail'])
        self.assertEqual(HarvestRecord.objects.count(), 0)

    # --- the settings
    def test_everyone_signed_in_reads_the_weights_but_only_an_admin_changes_them(self):
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.client.get(WEIGHTS_URL).status_code, 200)
        self.assertEqual(self.client.post(WEIGHTS_URL, {'unit': 'Crate', 'kg_per_unit': '25'}, format='json').status_code, 403)
        self.client.force_authenticate(self.focal)
        self.assertEqual(self.client.post(WEIGHTS_URL, {'unit': 'Crate', 'kg_per_unit': '25'}, format='json').status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(WEIGHTS_URL).status_code, (401, 403))

    def test_an_admin_adds_edits_and_deletes_a_weight(self):
        r = self.client.post(WEIGHTS_URL, {'unit': 'Crate', 'crop_type': self.garlic.id, 'kg_per_unit': '25', 'note': 'our crate'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.json()['unit'], r.json()['crop_type_name'], r.json()['kg_per_unit']), ('Crate', 'Weight Garlic', '25.0000'))
        url = f'{WEIGHTS_URL}{r.json()["id"]}/'
        self.assertEqual(self.client.patch(url, {'kg_per_unit': '27.5'}, format='json').status_code, 200)
        self.assertEqual(weight_for('crate', self.garlic.id), Decimal('27.5'))
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertIsNone(weight_for('crate', self.garlic.id))

    def test_the_weights_list_names_every_row(self):
        rows = self.client.get(WEIGHTS_URL).json()
        names = {(r['unit'], r['crop_type_name']) for r in rows}
        self.assertIn(('Sack', 'Weight Corn'), names)
        self.assertIn(('Metric Ton', ''), names)

    def test_a_unit_cannot_have_two_weights_for_the_same_crop_and_kg_cannot_be_added(self):
        dup = self.client.post(WEIGHTS_URL, {'unit': 'sack', 'crop_type': self.corn.id, 'kg_per_unit': '45'}, format='json')
        self.assertEqual(dup.status_code, 400)
        self.assertIn('already has a weight for this crop', dup.json()['unit'][0])
        self.assertEqual(self.client.post(WEIGHTS_URL, {'unit': 'SACK', 'kg_per_unit': '45'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(WEIGHTS_URL, {'unit': 'kg', 'kg_per_unit': '1'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(WEIGHTS_URL, {'unit': ' ', 'kg_per_unit': '1'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(WEIGHTS_URL, {'unit': 'Crate', 'kg_per_unit': '0'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(WEIGHTS_URL, {'unit': 'Crate', 'kg_per_unit': ''}, format='json').status_code, 201)
