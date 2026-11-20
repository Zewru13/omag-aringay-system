"""Deleting a farmer is for a registration made by mistake: Admin only, and only when nothing has been recorded for the farmer.

Before, any Focal Person could delete any farmer with one call; the parcels and assistance records were deleted with the farmer and the
crop records were left with no farmer (audit 2026-11-20). Nothing on the screens calls this, so only the rules change.

Run ONLY against an isolated test database (never the shared Supabase database)."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from farmers.models import FarmParcel, Farmer
from interventions.models import BeneficiaryRecord
from production.models import CropMonitoringRecord, CropType

_RSBSA = itertools.count(984001)


def make_farmer(first='Del'):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name=first, last_name='Etable', gender='Male', birthdate=date(1985, 1, 1),
        barangay='Alaska', civil_status='Single')


class FarmerDeleteTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='fd-admin', password='pw', role='ADMIN', email='fd-admin@x.test')
        cls.focal = User.objects.create_user(username='fd-focal', password='pw', role='EVALUATOR', email='fd-focal@x.test')
        cls.citizen = User.objects.create_user(username='fd-cit', password='pw', role='CITIZEN', email='fd-cit@x.test')

    def url(self, farmer):
        return f'/api/farmers/{farmer.id}/delete/'

    def shell_for(self, farmer, active=False):
        user = get_user_model().objects.create_user(username=f'fd-shell-{farmer.id}', password=None, role='CITIZEN', email=f'fd-shell-{farmer.id}@x.test',
                                                    is_active=active)
        UserLinkedRecord.objects.create(user=user, record_type='FARMER', record_id=farmer.id, is_active=True)
        return user

    def test_a_focal_person_cannot_delete_a_farmer(self):
        farmer = make_farmer()
        self.client.force_authenticate(self.focal)
        self.assertEqual(self.client.delete(self.url(farmer)).status_code, 403)
        self.assertTrue(Farmer.objects.filter(pk=farmer.pk).exists())

    def test_a_citizen_and_an_anonymous_visitor_cannot(self):
        farmer = make_farmer()
        self.assertEqual(self.client.delete(self.url(farmer)).status_code, 401)
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.client.delete(self.url(farmer)).status_code, 403)
        self.assertTrue(Farmer.objects.filter(pk=farmer.pk).exists())

    def test_the_admin_deletes_a_farmer_with_nothing_recorded(self):
        farmer = make_farmer()
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete(self.url(farmer)).status_code, 204)
        self.assertFalse(Farmer.objects.filter(pk=farmer.pk).exists())

    def test_the_waiting_account_of_a_deleted_farmer_goes_with_it(self):
        farmer = make_farmer()
        shell = self.shell_for(farmer)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete(self.url(farmer)).status_code, 204)
        self.assertFalse(get_user_model().objects.filter(pk=shell.pk).exists(), 'a login nobody can use was left behind')
        self.assertFalse(UserLinkedRecord.objects.filter(record_type='FARMER', record_id=farmer.id).exists())

    def test_a_farmer_who_already_has_a_working_login_is_kept(self):
        farmer = make_farmer()
        shell = self.shell_for(farmer, active=True)
        self.client.force_authenticate(self.admin)
        r = self.client.delete(self.url(farmer))
        self.assertEqual(r.status_code, 409, r.content)
        self.assertIn('login', r.json()['detail'].lower())
        self.assertTrue(Farmer.objects.filter(pk=farmer.pk).exists())
        self.assertTrue(get_user_model().objects.filter(pk=shell.pk).exists())

    def test_a_farmer_with_records_is_refused_and_nothing_is_lost(self):
        farmer = make_farmer()
        parcel = FarmParcel.objects.create(farmer=farmer, parcel_number='01-33-02-005-001-02-%03d' % farmer.id, area_hectares='3.00',
                                           land_ownership='Owner', barangay='Alaska')
        crop = CropMonitoringRecord.objects.create(
            farmer=farmer, farm_parcel=parcel, farm_location_barangay='Alaska', land_status='Owner', crop_type=CropType.objects.order_by('id').first(),
            season='Wet', year=2026, date_planted=date(2026, 5, 1), area_planted_ha='1.00', status='Planted')
        BeneficiaryRecord.objects.create(farmer=farmer, date_given=date(2026, 6, 1), assistance_type='Seeds', quantity='2 sack', year=2026, season='Wet')
        self.client.force_authenticate(self.admin)
        r = self.client.delete(self.url(farmer))
        self.assertEqual(r.status_code, 409, r.content)
        detail = r.json()['detail']
        for what in ('farm parcel', 'crop record', 'assistance record'):
            self.assertIn(what, detail)
        self.assertTrue(Farmer.objects.filter(pk=farmer.pk).exists())
        crop.refresh_from_db()
        self.assertEqual(crop.farmer_id, farmer.id, 'the crop was detached from its farmer')
        self.assertTrue(FarmParcel.objects.filter(pk=parcel.pk).exists())
        self.assertEqual(BeneficiaryRecord.objects.filter(farmer=farmer).count(), 1)
