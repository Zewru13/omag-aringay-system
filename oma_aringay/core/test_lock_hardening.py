"""Record locks: only real crop/stocking records, and a citizen may only lock - or even look at the lock on - their own."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from core.models import RecordLock
from farmers.models import Farmer
from fisheries.models import Fisherfolk, SpeciesCategory, SpeciesOption, StockingRecord
from production.models import CropMonitoringRecord, CropType

_N = itertools.count(1)
ACQUIRE, HEARTBEAT, STATUS, RELEASE = ('/api/locks/' + name + '/' for name in ('acquire', 'heartbeat', 'status', 'release'))


def user(username, role, linked=None):
    created = get_user_model().objects.create_user(username=username, password='pw', role=role, email=f'{username}@x.test')
    if linked:
        UserLinkedRecord.objects.create(user=created, record_type=linked[0], record_id=linked[1].id, is_active=True)
    return created


def farmer_with_crop():
    n = next(_N)
    farmer = Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % (970000 + n), first_name='Lock', last_name='Farmer', gender='Male',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
    crop = CropMonitoringRecord.objects.create(
        farmer=farmer, farm_location_barangay='Alaska', land_status='Owner', crop_type=CropType.objects.order_by('id').first(),
        season='Wet', year=2026, date_planted=date(2026, 5, 1), area_planted_ha='1.00')
    return farmer, crop


def fisherfolk_with_stock(species):
    n = next(_N)
    person = Fisherfolk.objects.create(
        rsbsa_number='01-033-02-019-%06d' % (971000 + n), first_name='Lock', last_name='Fisher', gender='Male',
        birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')
    stock = StockingRecord.objects.create(fisherfolk=person, species=species, date_stocked=date(2026, 8, 1),
                                          number_of_fingerlings=10, season='Wet', year=2026, area_hectares='1.00')
    return person, stock


class LockHardeningTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        category, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        species, _ = SpeciesOption.objects.get_or_create(species_name='Tilapia', defaults=dict(
            category=category, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct=80, default_avg_body_weight_kg='0.25'))
        cls.farmer, cls.crop = farmer_with_crop()
        cls.other_farmer, cls.other_crop = farmer_with_crop()
        cls.fisher, cls.stock = fisherfolk_with_stock(species)
        cls.admin = user('lk-admin', 'ADMIN')
        cls.evaluator = user('lk-eval', 'EVALUATOR')
        cls.farmer_user = user('lk-farmer', 'CITIZEN', ('FARMER', cls.farmer))
        cls.fisher_user = user('lk-fisher', 'CITIZEN', ('FISHERFOLK', cls.fisher))

    def call(self, who, url, **body):
        self.client.force_authenticate(who)
        return self.client.post(url, body, format='json')

    # ── what can be locked ───────────────────────────────────────────────
    def test_only_crop_and_stocking_records_can_be_locked(self):
        for kind in ('farmer', 'user', 'x' * 40, 'CROP'):
            for url in (ACQUIRE, HEARTBEAT):
                response = self.call(self.admin, url, record_type=kind, record_id=1)
                self.assertEqual(response.status_code, 400, (kind, url))
        self.assertFalse(RecordLock.objects.exists())

    def test_the_record_must_exist(self):
        for record_id in (99999999, 'abc', '1; DROP TABLE'):
            response = self.call(self.evaluator, ACQUIRE, record_type='crop', record_id=record_id)
            self.assertIn(response.status_code, (400, 404), record_id)
        self.assertFalse(RecordLock.objects.exists())

    def test_a_malformed_id_is_a_clean_error_everywhere(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(RELEASE, {'record_type': 'crop', 'record_id': 'abc'}, format='json').status_code, 400)
        self.assertEqual(self.client.get(STATUS, {'record_type': 'crop', 'record_id': 'abc'}).status_code, 400)

    # ── who can lock what ────────────────────────────────────────────────
    def test_staff_can_lock_any_existing_record(self):
        for who, kind, record in ((self.admin, 'crop', self.crop), (self.evaluator, 'stocking', self.stock)):
            self.assertEqual(self.call(who, ACQUIRE, record_type=kind, record_id=record.id).status_code, 200)

    def test_a_citizen_can_lock_their_own_record(self):
        self.assertEqual(self.call(self.farmer_user, ACQUIRE, record_type='crop', record_id=self.crop.id).status_code, 200)
        self.assertEqual(self.call(self.fisher_user, ACQUIRE, record_type='stocking', record_id=self.stock.id).status_code, 200)

    def test_a_citizen_cannot_lock_somebody_elses_record_to_block_staff(self):
        response = self.call(self.farmer_user, ACQUIRE, record_type='crop', record_id=self.other_crop.id)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.call(self.farmer_user, ACQUIRE, record_type='stocking', record_id=self.stock.id).status_code, 403)
        self.assertEqual(self.call(self.fisher_user, ACQUIRE, record_type='crop', record_id=self.crop.id).status_code, 403)
        self.assertEqual(self.call(self.farmer_user, HEARTBEAT, record_type='crop', record_id=self.other_crop.id).status_code, 403)
        self.assertFalse(RecordLock.objects.exists())

    # ── who can see a lock ───────────────────────────────────────────────
    def test_a_citizen_does_not_learn_who_is_working_on_a_record_that_is_not_theirs(self):
        RecordLock.objects.create(record_type='crop', record_id=self.other_crop.id, locked_by=self.admin)
        self.client.force_authenticate(self.farmer_user)
        body = self.client.get(STATUS, {'record_type': 'crop', 'record_id': self.other_crop.id}).json()
        self.assertEqual(body, {'locked': False})

    def test_staff_and_the_owner_still_see_the_lock(self):
        RecordLock.objects.create(record_type='crop', record_id=self.crop.id, locked_by=self.admin)
        for who in (self.evaluator, self.farmer_user):
            self.client.force_authenticate(who)
            body = self.client.get(STATUS, {'record_type': 'crop', 'record_id': self.crop.id}).json()
            self.assertTrue(body['locked'], who.username)
