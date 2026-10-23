"""Crop Records page: one row per farm parcel (across all farmers), with the number of crop records on it."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from farmers.models import FarmParcel, Farmer
from production.models import CropMonitoringRecord, CropType

URL = '/api/farmers/parcels/directory/'
_RSBSA = itertools.count(980001)


def make_farmer(first, last, barangay='Alaska'):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name=first, last_name=last, gender='Male',
        birthdate=date(1985, 1, 1), barangay=barangay, civil_status='Single')


def make_parcel(farmer, number='', barangay='Alaska', area='1.50'):
    return FarmParcel.objects.create(
        farmer=farmer, parcel_number=number, area_hectares=area, land_ownership='Owner', barangay=barangay)


def make_crop(farmer, parcel, status='Planted'):
    rec = CropMonitoringRecord.objects.create(
        farmer=farmer, farm_parcel=parcel, farm_location_barangay='Alaska', land_status='Owner',
        crop_type=CropType.objects.order_by('id').first(), season='Wet', year=2026,
        date_planted=date(2026, 5, 1), area_planted_ha='1.00', status='Planted')
    if status != 'Planted':
        CropMonitoringRecord.objects.filter(pk=rec.pk).update(status=status)
    return rec


class ParcelDirectoryTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='pd-admin', password='pw', role='ADMIN', email='pd-admin@x.test')
        cls.evaluator = User.objects.create_user(username='pd-eval', password='pw', role='EVALUATOR', email='pd-eval@x.test')
        cls.ana = make_farmer('Ana', 'Parcelo')
        cls.ben = make_farmer('Ben', 'Dizon', barangay='Poblacion')
        cls.p1 = make_parcel(cls.ana, '01-33-02-005-001-02-003')
        cls.p2 = make_parcel(cls.ana, '', barangay='Poblacion')
        cls.p3 = make_parcel(cls.ben, '01-33-02-006-001-02-004', barangay='Poblacion')
        make_crop(cls.ana, cls.p1); make_crop(cls.ana, cls.p1)
        make_crop(cls.ben, cls.p3)

    def get(self, user=None, **params):
        self.client.force_authenticate(user or self.admin)
        return self.client.get(URL, params)

    def test_staff_get_one_row_per_parcel_with_the_farmer_and_crop_count(self):
        for user in (self.admin, self.evaluator):
            data = self.get(user).json()
            self.assertEqual(data['count'], 3)
        rows = {r['id']: r for r in self.get().json()['results']}
        self.assertEqual(rows[self.p1.id]['farmer'], self.ana.id)
        self.assertEqual(rows[self.p1.id]['farmer_name'], 'Ana Parcelo')
        self.assertEqual(rows[self.p1.id]['rsbsa_number'], self.ana.rsbsa_number)
        self.assertEqual(rows[self.p1.id]['crop_count'], 2)
        self.assertEqual(rows[self.p2.id]['crop_count'], 0)
        self.assertEqual(rows[self.p3.id]['crop_count'], 1)
        for key in ('parcel_number', 'barangay', 'area_hectares', 'land_ownership'):
            self.assertIn(key, rows[self.p1.id])
        self.assertNotIn('farm_status', rows[self.p1.id])

    def test_total_loss_records_are_not_counted_in_the_list_but_the_count_matches_the_page(self):
        # The crop list under a parcel hides Total Loss records (same as Crop Monitoring), so the count must too.
        make_crop(self.ben, self.p3, status='Total Loss')
        rows = {r['id']: r for r in self.get().json()['results']}
        self.assertEqual(rows[self.p3.id]['crop_count'], 1)

    def test_search_by_farmer_name_rsbsa_or_parcel_number(self):
        self.assertEqual({r['id'] for r in self.get(search='Ana Parcelo').json()['results']}, {self.p1.id, self.p2.id})
        self.assertEqual({r['id'] for r in self.get(search=self.ben.rsbsa_number).json()['results']}, {self.p3.id})
        self.assertEqual({r['id'] for r in self.get(search='01-33-02-006').json()['results']}, {self.p3.id})
        self.assertEqual(self.get(search='nobody-here').json()['count'], 0)

    def test_filter_by_parcel_barangay(self):
        self.assertEqual({r['id'] for r in self.get(barangay='Poblacion').json()['results']}, {self.p2.id, self.p3.id})

    def test_filter_by_farmer(self):
        self.assertEqual({r['id'] for r in self.get(farmer=self.ben.id).json()['results']}, {self.p3.id})

    def test_rows_are_paged(self):
        for i in range(12):
            make_parcel(self.ben, f'01-33-02-007-001-02-{i:03d}')
        data = self.get().json()
        self.assertEqual((data['count'], len(data['results'])), (15, 10))
        self.assertEqual(len(self.get(page=2).json()['results']), 5)

    def test_a_farmer_account_cannot_use_it(self):
        citizen = get_user_model().objects.create_user(username='pd-farmer', password='pw', role='CITIZEN', email='pd-farmer@x.test')
        UserLinkedRecord.objects.create(user=citizen, record_type='FARMER', record_id=self.ana.id, is_active=True)
        self.assertEqual(self.get(citizen).status_code, 403)

    def test_anonymous_gets_401(self):
        self.assertEqual(self.client.get(URL).status_code, 401)
