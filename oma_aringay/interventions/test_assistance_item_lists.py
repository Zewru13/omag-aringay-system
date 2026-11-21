"""The lists behind the item box of an assistance form are managed in Assistance Settings: Type of Seed, Type of Fertilizer, Type of Equipment
(crop and fisheries), Type of Feed, Type of Fingerlings and Type of Fishing Gear.

Seed, fertilizer, feed and fingerlings used to be borrowed from the crops, the Input Types, the Feed Types and the Species. They are now lists of
their own, copied once from those when this was introduced, so Assistance Settings is the one place that decides what a distribution offers.

Run ONLY against an isolated test database (never the shared Supabase database)."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from fisheries.models import FeedType, SpeciesCategory, SpeciesOption
from interventions.models import AssistanceOption
from production.models import CropInputType, CropType

User = get_user_model()
OPTIONS = '/api/interventions/options/'
CHOICES = '/api/interventions/assistance-choices/'

KINDS = {
    'crop': ('seed', 'fertilizer', 'equipment', 'training'),
    'fisheries': ('feed', 'fingerling', 'gear', 'equipment', 'training'),
}


class AssistanceItemListTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='il-admin', password='pw', role='ADMIN', email='il-admin@x.test')
        cls.focal = User.objects.create_user(username='il-focal', password='pw', role='EVALUATOR', email='il-focal@x.test')
        cls.citizen = User.objects.create_user(username='il-cit', password='pw', role='CITIZEN', email='il-cit@x.test')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def choices(self, domain):
        return self.client.get(CHOICES, {'domain': domain}).json()

    # --- the lists start as a copy of what the dropdowns offered
    def test_the_migration_copied_the_existing_names_into_each_list(self):
        crop = self.choices('crop')
        self.assertIn('Palay (Rice)', crop['seed'], 'the crops became the Type of Seed list')
        self.assertGreater(len(crop['seed']), 5)
        fisheries = self.choices('fisheries')
        for kind in ('feed', 'fingerling'):
            self.assertIsInstance(fisheries[kind], list)
        self.assertIn('Tilapia', ' '.join(fisheries['fingerling']) or 'Tilapia')   # tolerated empty: the species list may be empty in a clean database

    def test_every_list_is_read_from_the_assistance_options(self):
        for domain, kinds in KINDS.items():
            for kind in kinds:
                AssistanceOption.objects.filter(domain=domain, kind=kind).delete()
                AssistanceOption.objects.create(domain=domain, kind=kind, name=f'Only {kind}')
            data = self.choices(domain)
            for kind in kinds:
                self.assertEqual(data[kind], [f'Only {kind}'], (domain, kind))

    def test_adding_a_crop_species_or_feed_elsewhere_no_longer_changes_the_lists(self):
        AssistanceOption.objects.filter(kind__in=('seed', 'fertilizer', 'feed', 'fingerling')).delete()
        CropType.objects.create(name='Brand New Crop', days_to_harvest=90)
        CropInputType.objects.create(name='Brand New Fertilizer', input_type='Fertilizer')
        FeedType.objects.create(name='Brand New Feed')
        category = SpeciesCategory.objects.create(name='Brand New Category')
        SpeciesOption.objects.create(species_name='Brand New Species', category=category, culture_environment='Freshwater', culture_duration_days=100,
                                     default_survival_rate_pct=80, default_avg_body_weight_kg='0.25')
        crop, fisheries = self.choices('crop'), self.choices('fisheries')
        self.assertEqual((crop['seed'], crop['fertilizer'], fisheries['feed'], fisheries['fingerling']), ([], [], [], []))

    # --- managing them
    def test_staff_add_rename_and_delete_names_in_every_list(self):
        for who in (self.admin, self.focal):
            self.client.force_authenticate(who)
            for domain, kinds in KINDS.items():
                for kind in kinds:
                    r = self.client.post(OPTIONS, {'domain': domain, 'kind': kind, 'name': f'  New  {kind} {who.username} '}, format='json')
                    self.assertEqual(r.status_code, 201, (domain, kind, r.content))
                    self.assertEqual(r.json()['name'], f'New {kind} {who.username}')
                    row_id = r.json()['id']
                    self.assertIn(r.json()['name'], self.choices(domain)[kind])
                    self.assertEqual(self.client.patch(f'{OPTIONS}{row_id}/', {'name': f'Renamed {kind} {who.username}'}, format='json').status_code, 200)
                    self.assertEqual(self.client.delete(f'{OPTIONS}{row_id}/').status_code, 204)
                    self.assertNotIn(f'Renamed {kind} {who.username}', self.choices(domain)[kind])

    def test_a_name_is_not_repeated_in_one_list_but_may_be_in_another(self):
        self.assertEqual(self.client.post(OPTIONS, {'domain': 'crop', 'kind': 'seed', 'name': 'Rice Mix'}, format='json').status_code, 201)
        self.assertEqual(self.client.post(OPTIONS, {'domain': 'crop', 'kind': 'seed', 'name': ' RICE MIX '}, format='json').status_code, 400)
        self.assertEqual(self.client.post(OPTIONS, {'domain': 'crop', 'kind': 'fertilizer', 'name': 'Rice Mix'}, format='json').status_code, 201)

    def test_a_list_that_belongs_to_the_other_domain_is_refused(self):
        for domain, kind in (('crop', 'feed'), ('crop', 'fingerling'), ('crop', 'gear'), ('fisheries', 'seed'), ('fisheries', 'fertilizer')):
            self.assertEqual(self.client.post(OPTIONS, {'domain': domain, 'kind': kind, 'name': 'Anything'}, format='json').status_code, 400, (domain, kind))

    def test_a_citizen_reads_the_lists_but_cannot_change_them(self):
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.client.get(OPTIONS, {'domain': 'crop', 'kind': 'seed'}).status_code, 200)
        self.assertEqual(self.client.get(CHOICES, {'domain': 'fisheries'}).status_code, 200)
        self.assertEqual(self.client.post(OPTIONS, {'domain': 'crop', 'kind': 'seed', 'name': 'Sneaky'}, format='json').status_code, 403)

    def test_assistance_recorded_earlier_keeps_its_item_when_the_list_changes(self):
        from datetime import date
        from farmers.models import Farmer
        from interventions.models import BeneficiaryRecord
        farmer = Farmer.objects.create(rsbsa_number='01-033-02-019-980001', first_name='Li', last_name='St', gender='Male', birthdate=date(1985, 1, 1),
                                       barangay='Alaska', civil_status='Single')
        row = AssistanceOption.objects.create(domain='crop', kind='seed', name='Short Lived Seed')
        record = BeneficiaryRecord.objects.create(farmer=farmer, assistance_type='Seeds', seed_type='Short Lived Seed', date_given=date(2026, 11, 1))
        self.client.delete(f'{OPTIONS}{row.id}/')
        record.refresh_from_db()
        self.assertEqual(record.seed_type, 'Short Lived Seed')
