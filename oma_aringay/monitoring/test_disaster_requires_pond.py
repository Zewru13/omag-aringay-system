"""A fisherfolk can only log a disaster when they have a pond or cage on record (a registered Pond, a production
cycle or a stocking record): the create endpoint refuses otherwise, and the eligibility endpoint tells the screens
up front."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from fisheries.models import Fisherfolk, Pond, SpeciesCategory, SpeciesOption, StockingRecord
from fisheries.eligibility import NO_PONDS_MESSAGE

URL = '/api/monitoring/fisherfolk-disasters/'
ELIGIBILITY = '/api/monitoring/fisherfolk-disasters/eligibility/'
_RSBSA = itertools.count(910001)


def _fisherfolk(name):
    return Fisherfolk.objects.create(
        first_name=name, last_name='Pondtest', gender='Male', birthdate=date(1990, 1, 1), barangay='Poblacion',
        fisherfolk_type='Aquaculture', rsbsa_number='01-033-02-019-%06d' % next(_RSBSA))


def _citizen(username, fisherfolk):
    user = get_user_model().objects.create_user(username=username, password='pw', role='CITIZEN', email=f'{username}@x.test')
    UserLinkedRecord.objects.create(user=user, record_type='FISHERFOLK', record_id=fisherfolk.id, is_active=True)
    return user


def _report(fisherfolk_id):
    return {'fisherfolk': fisherfolk_id, 'disaster_type': 'Flooding', 'date_of_occurrence': str(date.today()),
            'estimated_damage': 'Dike breached', 'equipment_damaged': 'Water Pump'}


class DisasterRequiresPondTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='admin1', password='pw', role='ADMIN', email='admin1@x.test')
        cls.bare = _fisherfolk('Bare')            # nothing on record
        cls.with_pond = _fisherfolk('Pond')       # a registered pond only
        cls.with_stock = _fisherfolk('Stock')     # a stocking record only
        cls.bare_user = _citizen('bare', cls.bare)
        cls.pond_user = _citizen('pond', cls.with_pond)
        cls.stock_user = _citizen('stock', cls.with_stock)
        Pond.objects.create(fisherfolk=cls.with_pond, name='Pond 1')
        category, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        species, _ = SpeciesOption.objects.get_or_create(species_name='Tilapia', defaults=dict(
            category=category, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct=80, default_avg_body_weight_kg='0.25'))
        StockingRecord.objects.create(fisherfolk=cls.with_stock, species=species, date_stocked=date.today(),
                                      number_of_fingerlings=10, season='Wet', year=date.today().year)

    def post_as(self, user, fisherfolk_id=None):
        self.client.force_authenticate(user)
        return self.client.post(URL, _report(fisherfolk_id or 0), format='json')

    # --- the rule
    def test_fisherfolk_without_any_pond_cannot_log_a_disaster(self):
        r = self.post_as(self.bare_user)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['detail'], NO_PONDS_MESSAGE)
        self.assertEqual(self.client.get(URL).data, [])      # nothing was saved

    def test_a_registered_pond_is_enough(self):
        self.assertEqual(self.post_as(self.pond_user).status_code, 201)

    def test_a_stocking_record_is_enough(self):
        self.assertEqual(self.post_as(self.stock_user).status_code, 201)

    def test_staff_cannot_log_one_on_behalf_of_a_fisherfolk_without_ponds(self):
        self.client.force_authenticate(self.admin)
        r = self.client.post(URL, _report(self.bare.id), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.client.post(URL, _report(self.with_pond.id), format='json').status_code, 201)

    def test_the_citizen_cannot_dodge_the_rule_by_naming_someone_else_who_has_ponds(self):
        r = self.post_as(self.bare_user, self.with_pond.id)   # `fisherfolk` is forced to their own record
        self.assertEqual(r.status_code, 400)

    # --- eligibility endpoint
    def test_eligibility_for_a_fisherfolk_account_is_about_itself(self):
        self.client.force_authenticate(self.bare_user)
        r = self.client.get(ELIGIBILITY, {'fisherfolk': self.with_pond.id})   # ignored: always their own
        self.assertEqual((r.status_code, r.data['fisherfolk'], r.data['has_ponds'], r.data['can_log_disaster']),
                         (200, self.bare.id, False, False))
        self.assertEqual(r.data['message'], NO_PONDS_MESSAGE)
        self.client.force_authenticate(self.pond_user)
        r = self.client.get(ELIGIBILITY)
        self.assertEqual((r.data['has_ponds'], r.data['message']), (True, None))

    def test_eligibility_for_staff_takes_a_fisherfolk_id(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(ELIGIBILITY, {'fisherfolk': self.bare.id}).data['has_ponds'], False)
        self.assertEqual(self.client.get(ELIGIBILITY, {'fisherfolk': self.with_stock.id}).data['has_ponds'], True)
        self.assertEqual(self.client.get(ELIGIBILITY).status_code, 400)       # which fisherfolk?
