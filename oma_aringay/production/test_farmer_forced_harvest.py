"""A farmer account can force harvest its OWN crops: POST /api/production/forced-harvest/ (the same call the office uses).
The rules of the harvest do not change; only whose crops the caller may name does."""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from core.models import Notification
from farmers.models import FarmParcel, Farmer
from production.models import CropMonitoringRecord, CropType, HarvestRecord

URL = '/api/production/forced-harvest/'
_RSBSA = itertools.count(970001)


def make_farmer(first):
    farmer = Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name=first, last_name='Forced', gender='Female',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
    parcel = FarmParcel.objects.create(farmer=farmer, parcel_number='01-33-02-005-001-02-%03d' % farmer.id, area_hectares='5.00',
                                       land_ownership='Owner', barangay='Alaska')
    return farmer, parcel


def make_citizen(username, record_type, record_id):
    user = get_user_model().objects.create_user(username=username, password='pw', role='CITIZEN', email=f'{username}@x.test')
    UserLinkedRecord.objects.create(user=user, record_type=record_type, record_id=record_id, is_active=True)
    return user


class FarmerForcedHarvestTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='ffh-adm', password='pw', role='ADMIN', email='ffha@x.test')
        cls.admin2 = User.objects.create_user(username='ffh-adm2', password='pw', role='ADMIN', email='ffha2@x.test')
        cls.ana, cls.ana_parcel = make_farmer('Ana')
        cls.ben, cls.ben_parcel = make_farmer('Ben')
        cls.ana_user = make_citizen('ffh-ana', 'FARMER', cls.ana.id)
        cls.fisher_user = make_citizen('ffh-fish', 'FISHERFOLK', cls.ana.id)   # a fisherfolk whose id happens to match
        cls.rice, _ = CropType.objects.get_or_create(name='Farmer Forced Rice', defaults=dict(days_to_harvest=100))
        cls.rice.days_to_harvest = 100
        cls.rice.save()

    def setUp(self):
        self.client.force_authenticate(self.ana_user)

    def crop(self, farmer=None, parcel=None, planted_days_ago=20, **over):
        farmer = farmer or self.ana
        data = dict(farmer=farmer, farm_parcel=parcel or (self.ana_parcel if farmer == self.ana else self.ben_parcel),
                    farm_location_barangay='Alaska', land_status='Owner', crop_type=self.rice, season='Wet', year=2026,
                    date_planted=date.today() - timedelta(days=planted_days_ago), area_planted_ha='1.00', status='Planted', variety_used='')
        data.update(over)
        return CropMonitoringRecord.objects.create(**data)

    def post(self, crops, **over):
        data = {'harvest_date': str(date.today()), 'force_harvest_reason': 'upcoming_typhoon', 'force_harvest_detail': '', 'remarks': '',
                'crops': [{'monitoring_record': c.id, 'area_harvested_hectares': '1.00', 'volume_kg': '100', 'unit_of_measure': 'kg'} for c in crops]}
        data.update(over)
        return self.client.post(URL, data, format='json')

    def test_a_farmer_force_harvests_their_own_crops(self):
        a, b = self.crop(), self.crop(planted_days_ago=30)
        r = self.post([a, b])
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(HarvestRecord.objects.count(), 2)
        for crop in (a, b):
            crop.refresh_from_db()
            self.assertEqual(crop.status, 'Harvested')
        harvest = HarvestRecord.objects.first()
        self.assertEqual(harvest.recorded_by_id, self.ana_user.id)
        self.assertEqual(harvest.force_harvest_reason, 'upcoming_typhoon')

    def test_a_farmer_cannot_name_another_farmers_crop(self):
        theirs = self.crop(self.ben)
        r = self.post([theirs])
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('could not be found', str(r.json()))
        self.assertEqual(HarvestRecord.objects.count(), 0)
        theirs.refresh_from_db()
        self.assertEqual(theirs.status, 'Planted')

    def test_one_foreign_crop_among_their_own_saves_nothing(self):
        mine, theirs = self.crop(), self.crop(self.ben)
        r = self.post([mine, theirs])
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(HarvestRecord.objects.count(), 0)
        mine.refresh_from_db()
        self.assertEqual(mine.status, 'Planted')

    def test_a_fisherfolk_account_is_refused(self):
        self.client.force_authenticate(self.fisher_user)
        self.assertEqual(self.post([self.crop()]).status_code, 403)

    def test_every_admin_is_told_and_the_farmer_is_not(self):
        crop = self.crop()
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.post([crop]).status_code, 201)
        rows = Notification.objects.filter(verb__startswith='recorded a Forced Harvest')
        self.assertEqual({n.recipient_id for n in rows}, {self.admin.id, self.admin2.id})

    def test_the_rules_of_the_harvest_are_the_same_for_a_farmer(self):
        near = self.crop(planted_days_ago=96)             # 4 days before the expected date: not early enough
        r = self.post([near], force_harvest_reason='drought')
        self.assertEqual(r.status_code, 400)
        done = self.crop(status='Harvested')
        self.assertEqual(self.post([done]).status_code, 400)
        self.assertEqual(self.post([self.crop()], force_harvest_reason='boredom').status_code, 400)
        self.assertEqual(HarvestRecord.objects.count(), 0)
