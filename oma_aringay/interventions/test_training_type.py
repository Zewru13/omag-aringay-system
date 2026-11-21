"""Training assistance carries a Type of Training chosen from a managed list (Assistance Settings).

The list (AssistanceOption, kind "training", per domain) starts with real training courses (ATI, BFAR and TESDA) and the Admin or a Focal
Person adds to it. A NEW Training record must name its type of training; an older Training record can still be edited without one, and
no other assistance type keeps a type of training.

Run ONLY against an isolated test database (never the shared Supabase database)."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from farmers.models import Farmer
from fisheries.models import Fisherfolk
from interventions.models import AssistanceOption, BeneficiaryRecord, FisherfolkBeneficiaryRecord
from interventions.test_distribution_members import DOMAINS as ORG_DOMAINS, make_citizen, make_org, make_person

_N = itertools.count(1)
User = get_user_model()
CHOICES = '/api/interventions/assistance-choices/'
OPTIONS = '/api/interventions/options/'

DOMAINS = {
    'crop': dict(adhoc='/api/interventions/beneficiaries/adhoc/', bulk='/api/interventions/beneficiaries/adhoc/bulk/', ids='farmer_ids',
                 person='farmer', record=BeneficiaryRecord),
    'fisheries': dict(adhoc='/api/interventions/fisherfolk-beneficiaries/adhoc/', bulk='/api/interventions/fisherfolk-beneficiaries/adhoc/bulk/',
                      ids='fisherfolk_ids', person='fisherfolk', record=FisherfolkBeneficiaryRecord),
}


class TrainingTypeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='tt-admin', password='pw', role='ADMIN', email='tt-admin@x.test')
        cls.citizen = User.objects.create_user(username='tt-cit', password='pw', role='CITIZEN', email='tt-cit@x.test')
        n = next(_N)
        cls.people = {
            'crop': Farmer.objects.create(rsbsa_number='01-033-02-019-%06d' % (976000 + n), first_name='Tra', last_name='Ining', gender='Male',
                                          birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single'),
            'fisheries': Fisherfolk.objects.create(rsbsa_number='01-033-02-019-%06d' % (977000 + n), first_name='Tri', last_name='Ining',
                                                   gender='Male', birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland'),
        }

    def setUp(self):
        self.client.force_authenticate(self.admin)
        self.today = timezone.localdate().isoformat()

    def body(self, domain, **over):
        cfg = DOMAINS[domain]
        data = {cfg['person']: self.people[domain].id, 'assistance_type': 'Training', 'source_agencies': ['ATI'], 'quantity': '',
                'training_duration_days': 2, 'date_given': self.today}
        data.update(over)
        return data

    # --- the list
    def test_each_domain_starts_with_real_training_courses(self):
        for domain in DOMAINS:
            training = self.client.get(CHOICES, {'domain': domain}).json()['training']
            self.assertGreaterEqual(len(training), 8, domain)
            self.assertEqual(training, sorted(training, key=str.lower), 'the list is in alphabetical order')
        crop = self.client.get(CHOICES, {'domain': 'crop'}).json()['training']
        fisheries = self.client.get(CHOICES, {'domain': 'fisheries'}).json()['training']
        self.assertIn('Farmers\' Field School (FFS)', crop)
        self.assertIn('Organic Agriculture Production (TESDA NC II)', crop)
        self.assertIn('Fish Processing and Value-Adding', fisheries)
        self.assertIn('Aquaculture (Grow-Out Operation) (TESDA NC II)', fisheries)

    def test_staff_add_edit_and_delete_types_of_training(self):
        for domain in DOMAINS:
            r = self.client.post(OPTIONS, {'domain': domain, 'kind': 'training', 'name': '  Seaweed   Farming '}, format='json')
            self.assertEqual(r.status_code, 201, r.content)
            self.assertEqual(r.json()['name'], 'Seaweed Farming')
            self.assertIn('Seaweed Farming', self.client.get(CHOICES, {'domain': domain}).json()['training'])
            self.assertEqual(self.client.post(OPTIONS, {'domain': domain, 'kind': 'training', 'name': 'seaweed farming'}, format='json').status_code, 400)
            row_id = r.json()['id']
            self.assertEqual(self.client.patch(f'{OPTIONS}{row_id}/', {'name': 'Seaweed Culture'}, format='json').status_code, 200)
            self.assertEqual(self.client.delete(f'{OPTIONS}{row_id}/').status_code, 204)

    def test_a_citizen_can_read_the_list_but_not_change_it(self):
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.client.get(CHOICES, {'domain': 'crop'}).status_code, 200)
        self.assertEqual(self.client.post(OPTIONS, {'domain': 'crop', 'kind': 'training', 'name': 'Anything'}, format='json').status_code, 403)

    # --- a record
    def test_a_new_training_record_must_name_its_type_of_training(self):
        for domain, cfg in DOMAINS.items():
            r = self.client.post(cfg['adhoc'], self.body(domain), format='json')
            self.assertEqual(r.status_code, 400, (domain, r.content))
            self.assertIn('training_type', r.json())
            self.assertEqual(cfg['record'].objects.count(), 0)

    def test_the_type_of_training_is_saved_and_returned(self):
        for domain, cfg in DOMAINS.items():
            r = self.client.post(cfg['adhoc'], self.body(domain, training_type='Farmers\' Field School (FFS)'), format='json')
            self.assertEqual(r.status_code, 201, (domain, r.content))
            self.assertEqual(r.json()['training_type'], 'Farmers\' Field School (FFS)')
            self.assertEqual(cfg['record'].objects.get().training_type, 'Farmers\' Field School (FFS)')
            cfg['record'].objects.all().delete()

    def test_the_bulk_form_needs_it_too(self):
        for domain, cfg in DOMAINS.items():
            body = {cfg['ids']: [self.people[domain].id], 'assistance_type': 'Training', 'source_agencies': ['ATI'], 'training_duration_days': 1,
                    'date_given': self.today}
            r = self.client.post(cfg['bulk'], body, format='json')
            self.assertEqual(r.status_code, 400, (domain, r.content))
            self.assertIn('training_type', r.json())
            ok = self.client.post(cfg['bulk'], {**body, 'training_type': 'Good Agricultural Practices (GAP)'}, format='json')
            self.assertEqual(ok.status_code, 200, ok.content)
            self.assertEqual(ok.json()['results'][0]['status'], 'created')
            self.assertEqual(cfg['record'].objects.get().training_type, 'Good Agricultural Practices (GAP)')
            cfg['record'].objects.all().delete()

    def test_an_older_training_record_can_still_be_edited_without_one(self):
        for domain, cfg in DOMAINS.items():
            record = cfg['record'].objects.create(assistance_type='Training', source_agencies=['ATI'], training_duration_days=2,
                                                  date_given=timezone.localdate(), **{cfg['person']: self.people[domain]})
            r = self.client.patch(f"{cfg['adhoc']}{record.id}/", {'remarks': 'typo fixed'}, format='json')
            self.assertEqual(r.status_code, 200, (domain, r.content))

    def test_other_types_keep_no_type_of_training(self):
        r = self.client.post(DOMAINS['crop']['adhoc'], {'farmer': self.people['crop'].id, 'assistance_type': 'Seeds', 'source_agencies': ['DA'],
                                                        'quantity': '2 sack', 'date_given': self.today, 'training_type': 'left over'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(BeneficiaryRecord.objects.get().training_type, '')

    # --- an organization's distribution
    def test_an_organization_distribution_carries_it(self):
        for domain, cfg in ORG_DOMAINS.items():
            org = make_org(cfg['org'], f'Train {domain}')
            person = make_person(domain, 'Member')
            cfg['member'].objects.create(organization=org, date_joined=date(2025, 1, 1), is_main=True, **{cfg['person_field']: person})
            self.client.force_authenticate(make_citizen(f'tt-org-{domain}', cfg['link'], org.id))
            body = {'assistance_type': 'Training', 'source_agencies': ['ATI'], 'quantity': '', 'training_duration_days': 1,
                    'date_given': self.today}
            url = cfg['url'].format(org.id)
            self.assertEqual(self.client.post(url, body, format='json').status_code, 400, domain)
            res = self.client.post(url, {**body, 'training_type': 'Fish Cage Construction and Tilapia Farming'}, format='json')
            self.assertEqual(res.status_code, 200, res.content)
            self.assertEqual(cfg['record'].objects.get(distributed_by_organization=org).training_type, 'Fish Cage Construction and Tilapia Farming')

    def test_the_seeded_names_are_real_option_rows(self):
        self.assertTrue(AssistanceOption.objects.filter(domain='crop', kind='training').exists())
        self.assertTrue(AssistanceOption.objects.filter(domain='fisheries', kind='training').exists())
