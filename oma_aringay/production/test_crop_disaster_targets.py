"""GET /api/production/disasters/targets/: the parcels with crops still in the field, for staff's Log Disaster table."""
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import FarmParcel
from production.models import CropType

from .test_crop_disaster_multi import make_citizen, make_farmer, make_record

URL = '/api/production/disasters/targets/'


class CropDisasterTargetsTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='tg-admin', password='pw', role='ADMIN', email='tg-admin@x.test')
        cls.focal = User.objects.create_user(username='tg-focal', password='pw', role='EVALUATOR', email='tg-focal@x.test')
        cls.ana, cls.ben = make_farmer('Ana'), make_farmer('Ben')
        cls.p1 = FarmParcel.objects.create(farmer=cls.ana, parcel_number='01-33-02-005-001-02-003', area_hectares='5.00', land_ownership='Owner', barangay='Basca')
        cls.p2 = FarmParcel.objects.create(farmer=cls.ana, parcel_number='', area_hectares='2.00', land_ownership='Tenant', barangay='Alaska')
        cls.p3 = FarmParcel.objects.create(farmer=cls.ben, parcel_number='', area_hectares='1.00', land_ownership='Owner', barangay='Dulao')
        cls.a1 = make_record(cls.ana, '2.00', farm_parcel=cls.p1)
        cls.a2 = make_record(cls.ana, '1.00', farm_parcel=cls.p1, status='Near Harvest')
        cls.a3 = make_record(cls.ana, '1.50', farm_parcel=cls.p2)
        cls.b1 = make_record(cls.ben, '0.50', farm_parcel=cls.p3, status='Harvested')      # not in the field any more
        cls.b2 = make_record(cls.ben, '0.50', farm_parcel=cls.p3, status='Total Loss')     # lost already
        cls.old = make_record(cls.ben, '1.00', farm_location_barangay='Poblacion')         # an older crop with no parcel on file

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def parcels(self):
        r = self.client.get(URL)
        self.assertEqual(r.status_code, 200, r.content)
        return {p['key']: p for p in r.json()['parcels']}

    def test_staff_get_every_parcel_with_crops_still_growing(self):
        for user in (self.admin, self.focal):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(URL).status_code, 200)
        parcels = self.parcels()
        self.assertEqual(set(parcels), {f'p{self.p1.id}', f'p{self.p2.id}', f'f{self.ben.id}'})   # Ben's parcel has no growing crop left

    def test_a_parcel_lists_its_farmer_barangay_area_and_its_growing_crops_only(self):
        p = self.parcels()[f'p{self.p1.id}']
        self.assertEqual((p['farmer_name'], p['barangay'], p['parcel_number'], p['land_ownership']), ('Ana Multi', 'Basca', '01-33-02-005-001-02-003', 'Owner'))
        self.assertEqual(p['area_hectares'], '5.00')
        self.assertEqual({c['id'] for c in p['crops']}, {self.a1.id, self.a2.id})
        crop = next(c for c in p['crops'] if c['id'] == self.a2.id)
        self.assertEqual((crop['status'], crop['area_planted_ha'], crop['season'], crop['year']), ('Near Harvest', '1.00', 'Wet', 2026))
        self.assertEqual(self.parcels()[f'p{self.p2.id}']['land_ownership'], 'Tenant')

    def test_a_crop_with_no_parcel_is_listed_under_its_farmer(self):
        old = self.parcels()[f'f{self.ben.id}']
        self.assertEqual((old['parcel_id'], old['barangay'], old['farmer_name']), (None, 'Poblacion', 'Ben Multi'))
        self.assertEqual([c['id'] for c in old['crops']], [self.old.id])

    def test_a_purged_parcels_crops_are_left_out(self):
        from django.utils import timezone
        FarmParcel.all_objects.filter(pk=self.p2.pk).update(purged_at=timezone.now())
        self.assertNotIn(f'p{self.p2.id}', self.parcels())

    def test_only_staff_may_ask(self):
        self.client.force_authenticate(make_citizen('tg-ana', 'FARMER', self.ana.id))
        self.assertEqual(self.client.get(URL).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(URL).status_code, (401, 403))
