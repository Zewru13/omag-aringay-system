"""A crop's land status (Crop Ownership): a Tenant or Lessee crop needs the land owner's name; and how the crop was planted
(seed or trees) decides which quantity is kept."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import FarmParcel
from production.models import CropMonitoringRecord, CropType

from .test_crop_record_duplicates import make_farmer, make_record, payload

URL = '/api/production/monitoring/'
BULK_URL = '/api/production/monitoring/bulk/'


class CropLandOwnerTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='clo-admin', password='pw', role='ADMIN', email='clo@x.test')
        cls.rice = CropType.objects.create(name='Owner Rice', days_to_harvest=110)
        cls.mango = CropType.objects.create(name='Owner Mango', days_to_harvest=120)
        cls.farmer = make_farmer('Olga')
        cls.parcel = FarmParcel.objects.create(farmer=cls.farmer, area_hectares='20.00', land_ownership='Owner', barangay='Alaska')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def post(self, crop=None, **over):
        return self.client.post(URL, payload(self.farmer, crop or self.rice, self.parcel, **over), format='json')

    # --- the land owner's name
    def test_a_tenant_or_lessee_crop_needs_the_owners_name(self):
        for status in ('Tenant', 'Lessee'):
            for name in (None, '', '   '):
                over = {'land_status': status}
                if name is not None:
                    over['land_owner_name'] = name
                response = self.post(**over)
                self.assertEqual(response.status_code, 400, (status, name))
                self.assertIn('land_owner_name', response.json())
        self.assertEqual(CropMonitoringRecord.objects.count(), 0)

    def test_the_owners_name_is_saved_trimmed_and_returned(self):
        response = self.post(land_status='Tenant', land_owner_name='  Rosa Landlord ')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['land_owner_name'], 'Rosa Landlord')
        self.assertEqual(CropMonitoringRecord.objects.get().land_owner_name, 'Rosa Landlord')

    def test_an_owner_or_other_crop_needs_no_name_and_drops_one_sent_with_it(self):
        response = self.post(land_status='Owner', land_owner_name='Someone Else')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['land_owner_name'], '')
        response = self.post(self.mango, land_status='Other', land_status_other_specify='Shared', land_owner_name='x')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['land_owner_name'], '')

    def test_the_bulk_form_applies_the_same_rule_to_every_row(self):
        rows = [payload(self.farmer, self.rice, self.parcel, land_status='Lessee', land_owner_name='Pedro Reyes', area_planted_ha='2.00'),
                payload(self.farmer, self.mango, self.parcel, land_status='Tenant', land_owner_name='', area_planted_ha='2.00')]
        response = self.client.post(BULK_URL, rows, format='json')
        self.assertEqual(response.status_code, 400)
        errors = response.json()['errors']
        self.assertEqual(errors[0], {})
        self.assertIn('land_owner_name', errors[1])
        self.assertEqual(CropMonitoringRecord.objects.count(), 0)         # all or nothing
        rows[1]['land_owner_name'] = 'Rosa Landlord'
        self.assertEqual(self.client.post(BULK_URL, rows, format='json').status_code, 201)

    def test_editing_checks_the_name_only_when_the_status_or_name_is_sent(self):
        record = make_record(self.farmer, self.rice, self.parcel, land_status='Tenant', land_owner_name='')   # saved before the rule
        self.assertEqual(self.client.patch(f'{URL}{record.id}/', {'variety_used': 'Rc 160'}, format='json').status_code, 200)
        self.assertEqual(self.client.patch(f'{URL}{record.id}/', {'land_status': 'Tenant'}, format='json').status_code, 400)
        ok = self.client.patch(f'{URL}{record.id}/', {'land_status': 'Tenant', 'land_owner_name': 'Rosa'}, format='json')
        self.assertEqual(ok.status_code, 200, ok.content)
        back = self.client.patch(f'{URL}{record.id}/', {'land_status': 'Owner'}, format='json')
        self.assertEqual((back.status_code, back.json()['land_owner_name']), (200, ''))

    # --- seed or trees
    def test_a_crop_is_planted_as_seed_unless_it_says_trees(self):
        response = self.post(quantity_of_seeds='25.5')
        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()
        self.assertEqual((data['planting_material'], data['quantity_of_seeds'], data['quantity_of_trees']), ('Seed', '25.50', None))

    def test_trees_keep_the_tree_count_and_drop_a_seed_quantity(self):
        response = self.post(self.mango, planting_material='Tree', quantity_of_trees=120, quantity_of_seeds='5.00')
        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()
        self.assertEqual((data['planting_material'], data['quantity_of_trees'], data['quantity_of_seeds']), ('Tree', 120, None))

    def test_seeds_drop_a_tree_count(self):
        response = self.post(planting_material='Seed', quantity_of_seeds='10.00', quantity_of_trees=50)
        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()
        self.assertEqual((data['planting_material'], data['quantity_of_seeds'], data['quantity_of_trees']), ('Seed', '10.00', None))

    def test_the_tree_count_is_a_whole_number_and_never_negative(self):
        for bad in (-1, 2.5, 'many'):
            self.assertEqual(self.post(self.mango, planting_material='Tree', quantity_of_trees=bad).status_code, 400, bad)
        self.assertEqual(self.post(self.mango, planting_material='Pine').status_code, 400)

    # --- the parcel's growing area, for the Add Crop form
    def test_a_parcel_reports_the_area_already_growing_on_it(self):
        make_record(self.farmer, self.rice, self.parcel, area_planted_ha='3.00')
        make_record(self.farmer, self.mango, self.parcel, area_planted_ha='1.50', status='Near Harvest')
        make_record(self.farmer, self.rice, self.parcel, area_planted_ha='9.00', status='Harvested', variety_used='old')
        rows = self.client.get(f'/api/farmers/{self.farmer.id}/parcels/').json()
        rows = rows['results'] if isinstance(rows, dict) else rows
        mine = next(r for r in rows if r['id'] == self.parcel.id)
        self.assertEqual(float(mine['growing_area_ha']), 4.5)
