"""Add Assistance (Assistance Settings): an Admin or Focal Person adds a new assistance type, for crop assistance, fisheries assistance or both.

A custom type is offered in every assistance form next to the built-in ones, takes a quantity with units like "Other" does, and is valid
wherever assistance is recorded (one person, selected people, an organization, an import). Renaming or deleting one never changes assistance
already recorded: a record keeps the name it was saved with.

Run ONLY against an isolated test database (never the shared Supabase database)."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from farmers.models import Farmer
from fisheries.models import Fisherfolk
from interventions.models import AssistanceCustomType, AssistanceTypeUnits, BeneficiaryRecord, FisherfolkBeneficiaryRecord
from interventions.test_distribution_members import DOMAINS as ORG_DOMAINS, make_citizen, make_org, make_person
from interventions.test_helpers import SCHEDULE

_N = itertools.count(1)
User = get_user_model()
TYPES = '/api/interventions/assistance-types/'
CHOICES = '/api/interventions/assistance-choices/'
UNITS = '/api/interventions/assistance-type-units/'

DOMAINS = {
    'crop': dict(adhoc='/api/interventions/beneficiaries/adhoc/', bulk='/api/interventions/beneficiaries/adhoc/bulk/', ids='farmer_ids',
                 person='farmer', record=BeneficiaryRecord),
    'fisheries': dict(adhoc='/api/interventions/fisherfolk-beneficiaries/adhoc/', bulk='/api/interventions/fisherfolk-beneficiaries/adhoc/bulk/',
                      ids='fisherfolk_ids', person='fisherfolk', record=FisherfolkBeneficiaryRecord),
}


class CustomAssistanceTypeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='cat-admin', password='pw', role='ADMIN', email='cat-admin@x.test')
        cls.focal = User.objects.create_user(username='cat-focal', password='pw', role='EVALUATOR', email='cat-focal@x.test')
        cls.citizen = User.objects.create_user(username='cat-cit', password='pw', role='CITIZEN', email='cat-cit@x.test')
        n = next(_N)
        cls.people = {
            'crop': Farmer.objects.create(rsbsa_number='01-033-02-019-%06d' % (978000 + n), first_name='Cus', last_name='Tom', gender='Male',
                                          birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single'),
            'fisheries': Fisherfolk.objects.create(rsbsa_number='01-033-02-019-%06d' % (979000 + n), first_name='Cas', last_name='Tom',
                                                   gender='Male', birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland'),
        }

    def setUp(self):
        self.client.force_authenticate(self.admin)
        self.today = timezone.localdate().isoformat()

    def add(self, name='Pesticide', domains=('crop', 'fisheries'), **extra):
        return self.client.post(TYPES, {'name': name, 'domains': list(domains), **extra}, format='json')

    def custom(self, domain):
        return self.client.get(CHOICES, {'domain': domain}).json()['types']

    def record_body(self, domain, kind, **over):
        cfg = DOMAINS[domain]
        data = {cfg['person']: self.people[domain].id, 'assistance_type': kind, 'source_agencies': ['DA'], 'quantity': '3 box', **SCHEDULE, 'date_given': self.today}
        data.update(over)
        return data

    # --- adding
    def test_a_type_is_added_for_the_chosen_domains_in_one_step(self):
        r = self.add('Pesticide', ['crop', 'fisheries'])
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(sorted((row['domain'], row['name']) for row in r.json()), [('crop', 'Pesticide'), ('fisheries', 'Pesticide')])
        self.assertEqual((self.custom('crop'), self.custom('fisheries')), (['Pesticide'], ['Pesticide']))
        only = self.add('Net Repair Kit', ['fisheries'])
        self.assertEqual(only.status_code, 201)
        self.assertEqual((self.custom('crop'), self.custom('fisheries')), (['Pesticide'], ['Net Repair Kit', 'Pesticide']))

    def test_a_focal_person_may_add_one_but_a_citizen_may_not(self):
        self.client.force_authenticate(self.focal)
        self.assertEqual(self.add().status_code, 201)
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.client.get(TYPES).status_code, 200)
        self.assertEqual(self.add('Another').status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.add('Another').status_code, 401)

    def test_a_bad_name_or_domain_is_refused_and_nothing_is_saved(self):
        for body in (
            {'name': '   ', 'domains': ['crop']},                       # no name
            {'name': 'x' * 31, 'domains': ['crop']},                    # longer than a record can hold
            {'name': 'Pesticide', 'domains': []},                       # applies to nothing
            {'name': 'Pesticide', 'domains': ['sky']},                  # no such domain
            {'name': 'seeds', 'domains': ['crop']},                     # a built-in type, any capitals
            {'name': 'Training', 'domains': ['fisheries']},
            {'name': 'Other', 'domains': ['crop']},
            {'name': 'Feed', 'domains': ['crop']},                      # built in for the other domain: still confusing
        ):
            self.assertEqual(self.client.post(TYPES, body, format='json').status_code, 400, body)
        self.assertFalse(AssistanceCustomType.objects.exists())

    def test_the_same_name_is_not_added_twice_for_a_domain_but_may_join_the_other(self):
        self.assertEqual(self.add('Pesticide', ['crop']).status_code, 201)
        self.assertEqual(self.add('  pesticide ', ['crop', 'fisheries']).status_code, 400, 'it is already there for crop')
        self.assertEqual(AssistanceCustomType.objects.count(), 1, 'a refusal saves none of the domains')
        self.assertEqual(self.add('Pesticide', ['fisheries']).status_code, 201)

    def test_extra_spaces_are_tidied(self):
        self.assertEqual(self.add('  Soil   Test  Kit ', ['crop']).json()[0]['name'], 'Soil Test Kit')

    # --- units
    def test_a_new_type_takes_a_quantity_with_units(self):
        self.add('Pesticide', ['crop'])
        rows = {r['assistance_type']: r for r in self.client.get(UNITS, {'domain': 'crop'}).json()}
        self.assertEqual((rows['Pesticide']['units'], rows['Pesticide']['is_default']), (['kg', 'sack', 'bag', 'piece', 'bundle', 'box', 'liter', 'set'], True))
        ok = self.client.put(UNITS, {'domain': 'crop', 'assistance_type': 'Pesticide', 'units': ['liter', 'box']}, format='json')
        self.assertEqual(ok.status_code, 200, ok.content)
        self.assertEqual(ok.json()['units'], ['box', 'liter'])

    def test_units_chosen_while_adding_are_kept(self):
        self.add('Pesticide', ['crop', 'fisheries'], units=['liter', 'bottle'.replace('bottle', 'box')])
        for domain in DOMAINS:
            rows = {r['assistance_type']: r for r in self.client.get(UNITS, {'domain': domain}).json()}
            self.assertEqual(rows['Pesticide']['units'], ['box', 'liter'], domain)
        self.assertEqual(self.add('Bad Unit', ['crop'], units=['furlong']).status_code, 400)

    # --- using one
    def test_a_custom_type_can_be_recorded_for_one_person_and_for_selected_people(self):
        self.add('Pesticide', ['crop', 'fisheries'])
        for domain, cfg in DOMAINS.items():
            one = self.client.post(cfg['adhoc'], self.record_body(domain, 'Pesticide'), format='json')
            self.assertEqual(one.status_code, 201, (domain, one.content))
            self.assertEqual(one.json()['assistance_type'], 'Pesticide')
            body = {cfg['ids']: [self.people[domain].id], 'assistance_type': 'Pesticide', 'source_agencies': ['DA'], 'quantity': '1 box', **SCHEDULE, 'date_given': self.today,
                    'confirm_duplicate': True}
            many = self.client.post(cfg['bulk'], body, format='json')
            self.assertEqual(many.status_code, 200, (domain, many.content))
            self.assertEqual(many.json()['results'][0]['status'], 'created')

    def test_a_type_that_was_never_added_or_belongs_to_the_other_domain_is_refused(self):
        self.add('Net Repair Kit', ['fisheries'])
        r = self.client.post(DOMAINS['crop']['adhoc'], self.record_body('crop', 'Net Repair Kit'), format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('assistance_type', r.json())
        self.assertEqual(self.client.post(DOMAINS['fisheries']['adhoc'], self.record_body('fisheries', 'Never Added'), format='json').status_code, 400)
        self.assertEqual(self.client.post(DOMAINS['fisheries']['adhoc'], self.record_body('fisheries', 'Net Repair Kit'), format='json').status_code, 201)

    def test_an_organization_can_distribute_a_custom_type(self):
        self.add('Pesticide', ['crop', 'fisheries'])
        for domain, cfg in ORG_DOMAINS.items():
            org = make_org(cfg['org'], f'Custom {domain}')
            person = make_person(domain, 'Member')
            cfg['member'].objects.create(organization=org, date_joined=date(2025, 1, 1), is_main=True, **{cfg['person_field']: person})
            self.client.force_authenticate(make_citizen(f'cat-org-{domain}', cfg['link'], org.id))
            body = {'assistance_type': 'Pesticide', 'source_agencies': ['DA'], 'quantity': '1 box', **SCHEDULE, 'date_given': self.today}
            self.assertEqual(self.client.post(cfg['url'].format(org.id), body, format='json').status_code, 200, domain)
            self.assertEqual(self.client.post(cfg['url'].format(org.id), {**body, 'assistance_type': 'Made Up'}, format='json').status_code, 400, domain)
            self.client.force_authenticate(self.admin)

    # --- renaming and deleting
    def test_renaming_changes_the_list_but_not_assistance_already_recorded(self):
        row_id = self.add('Pesticide', ['crop']).json()[0]['id']
        self.client.post(DOMAINS['crop']['adhoc'], self.record_body('crop', 'Pesticide'), format='json')
        r = self.client.patch(f'{TYPES}{row_id}/', {'name': 'Crop Protection'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.custom('crop'), ['Crop Protection'])
        self.assertEqual(BeneficiaryRecord.objects.get().assistance_type, 'Pesticide', 'the record keeps the name it was saved with')
        self.assertEqual(self.add('Seeds', ['crop']).status_code, 400)
        self.assertEqual(self.client.patch(f'{TYPES}{row_id}/', {'name': 'Fertilizer'}, format='json').status_code, 400, 'not a built-in name')

    def test_deleting_removes_it_from_the_lists_and_its_units_but_not_old_assistance(self):
        row_id = self.add('Pesticide', ['crop'], units=['box']).json()[0]['id']
        self.client.post(DOMAINS['crop']['adhoc'], self.record_body('crop', 'Pesticide'), format='json')
        self.assertEqual(self.client.delete(f'{TYPES}{row_id}/').status_code, 204)
        self.assertEqual(self.custom('crop'), [])
        self.assertFalse(AssistanceTypeUnits.objects.filter(assistance_type='Pesticide').exists())
        self.assertEqual(BeneficiaryRecord.objects.get().assistance_type, 'Pesticide')
        self.assertEqual(self.client.post(DOMAINS['crop']['adhoc'], self.record_body('crop', 'Pesticide', date_given=self.today), format='json').status_code, 400,
                         'a deleted type cannot be given again')

    def test_an_old_record_of_a_deleted_type_can_still_be_edited(self):
        row_id = self.add('Pesticide', ['crop']).json()[0]['id']
        record = self.client.post(DOMAINS['crop']['adhoc'], self.record_body('crop', 'Pesticide'), format='json').json()
        self.client.delete(f'{TYPES}{row_id}/')
        url = f"{DOMAINS['crop']['adhoc']}{record['id']}/"
        self.assertEqual(self.client.patch(url, {'assistance_type': 'Pesticide', 'remarks': 'fixed a typo'}, format='json').status_code, 200)
        self.assertEqual(self.client.patch(url, {'assistance_type': 'Something Else'}, format='json').status_code, 400)

    def test_the_built_in_types_still_work(self):
        for domain, kind in (('crop', 'Seeds'), ('fisheries', 'Feed')):
            r = self.client.post(DOMAINS[domain]['adhoc'], self.record_body(domain, kind), format='json')
            self.assertEqual(r.status_code, 201, (domain, r.content))
