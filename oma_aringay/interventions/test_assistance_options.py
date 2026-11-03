"""The lists behind the assistance forms' dropdowns: equipment types, units (crop and fisheries) and fishing gear (fisheries), managed in
Crop Settings / Fisheries Settings, and one endpoint that hands a form every dropdown it needs (seed types from the crops, fertilizers
from the input types, feed types, species...)."""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from associations.models import FisherfolkOrganization, FisherfolkOrganizationMember
from fisheries.models import FeedType, SpeciesCategory, SpeciesOption
from interventions.models import AssistanceOption, FisherfolkBeneficiaryRecord
from interventions.test_distribution_history import make_org, make_person
from production.models import CropInputType, CropType

User = get_user_model()
OPTIONS = '/api/interventions/options/'
CHOICES = '/api/interventions/assistance-choices/'
TODAY = date.today().isoformat()


class AssistanceOptionTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = User.objects.create_user(username='ao-admin', password='pw', role='ADMIN', email='ao@x.test')
        cls.citizen = User.objects.create_user(username='ao-cit', password='pw', role='CITIZEN', email='aoc@x.test')

    def setUp(self):
        # The migrations start the Equipment Types lists with the organization forms' names (test_equipment_defaults.py); these tests are about
        # how a list is managed, so they begin from an empty one.
        AssistanceOption.objects.filter(kind='equipment').delete()
        self.client.force_authenticate(self.staff)

    def add(self, domain, kind, name):
        return self.client.post(OPTIONS, {'domain': domain, 'kind': kind, 'name': name}, format='json')

    # ── managing the lists ───────────────────────────────────────────────────

    def test_each_list_takes_its_own_names(self):
        for domain, kind in (('crop', 'equipment'), ('crop', 'unit'), ('fisheries', 'equipment'), ('fisheries', 'unit'), ('fisheries', 'gear')):
            r = self.add(domain, kind, '  Hand   Tractor ')
            self.assertEqual(r.status_code, 201, (domain, kind, r.content))
            self.assertEqual(r.json()['name'], 'Hand Tractor', 'extra spaces are tidied')

    def test_a_list_that_does_not_exist_is_refused(self):
        self.assertEqual(self.add('crop', 'gear', 'Net').status_code, 400)
        self.assertEqual(self.add('farming', 'equipment', 'Plow').status_code, 400)
        self.assertEqual(self.add('crop', 'equipment', '   ').status_code, 400)

    def test_a_name_is_not_repeated_in_one_list_but_may_be_in_another(self):
        self.assertEqual(self.add('crop', 'unit', 'Sack').status_code, 201)
        self.assertEqual(self.add('crop', 'unit', 'sack').status_code, 400)
        self.assertEqual(self.add('fisheries', 'unit', 'Sack').status_code, 201)
        self.assertEqual(self.add('crop', 'equipment', 'Sack').status_code, 201)

    def test_the_list_is_filtered_and_sorted_by_name(self):
        for name in ('Plow', 'Harrow', 'drill'):
            self.add('crop', 'equipment', name)
        self.add('fisheries', 'equipment', 'Aerator')
        names = [o['name'] for o in self.client.get(OPTIONS, {'domain': 'crop', 'kind': 'equipment'}).json()]
        self.assertEqual(names, ['drill', 'Harrow', 'Plow'])

    def test_a_name_is_renamed_and_deleted(self):
        option_id = self.add('crop', 'unit', 'Sak').json()['id']
        self.assertEqual(self.client.patch(f'{OPTIONS}{option_id}/', {'name': 'Sack'}, format='json').status_code, 200)
        self.assertEqual(AssistanceOption.objects.get(pk=option_id).name, 'Sack')
        self.assertEqual(self.client.delete(f'{OPTIONS}{option_id}/').status_code, 204)
        self.assertFalse(AssistanceOption.objects.exists())

    def test_anyone_signed_in_reads_but_only_staff_change(self):
        option_id = self.add('crop', 'unit', 'Bag').json()['id']
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.client.get(OPTIONS, {'domain': 'crop', 'kind': 'unit'}).status_code, 200)
        self.assertIn(self.add('crop', 'unit', 'Box').status_code, (401, 403))
        self.assertIn(self.client.delete(f'{OPTIONS}{option_id}/').status_code, (401, 403))
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(OPTIONS).status_code, (401, 403))

    # ── the dropdowns a form needs ───────────────────────────────────────────

    def test_the_crop_form_gets_seed_fertilizer_equipment_and_unit_lists(self):
        CropType.objects.all().delete()
        CropType.objects.create(name='Zebra Rice', days_to_harvest=100)
        CropType.objects.create(name='Alpha Corn', days_to_harvest=90)
        CropType.objects.create(name='Retired Crop', days_to_harvest=90, is_active=False)
        CropInputType.objects.all().delete()
        CropInputType.objects.create(name='Urea', input_type='Fertilizer')
        CropInputType.objects.create(name='Retired Mix', input_type='Fertilizer', is_active=False)
        CropInputType.objects.create(name='Glyphosate', input_type='Herbicide')
        self.add('crop', 'equipment', 'Hand Tractor')
        self.add('crop', 'unit', 'sack')
        self.add('fisheries', 'unit', 'drum')
        data = self.client.get(CHOICES, {'domain': 'crop'}).json()
        self.assertEqual(data, {'seed': ['Alpha Corn', 'Zebra Rice'], 'fertilizer': ['Urea'], 'equipment': ['Hand Tractor'], 'unit': ['sack']})

    def test_the_fisheries_form_gets_feed_gear_fingerling_equipment_and_unit_lists(self):
        FeedType.objects.all().delete()
        FeedType.objects.create(name='Starter Feed')
        category = SpeciesCategory.objects.get_or_create(name='Test Fish')[0]
        SpeciesOption.objects.all().delete()
        SpeciesOption.objects.create(species_name='Tilapia', category=category, culture_environment='Freshwater', culture_duration_days=120, default_survival_rate_pct=80, default_avg_body_weight_kg=0.25)
        self.add('fisheries', 'gear', 'Gill Net')
        self.add('fisheries', 'equipment', 'Aerator')
        self.add('fisheries', 'unit', 'kg')
        self.add('crop', 'equipment', 'Plow')
        data = self.client.get(CHOICES, {'domain': 'fisheries'}).json()
        self.assertEqual(data, {'feed': ['Starter Feed'], 'fingerling': ['Tilapia'], 'gear': ['Gill Net'], 'equipment': ['Aerator'], 'unit': ['kg']})

    def test_a_form_needs_a_domain_and_any_signed_in_account_may_ask(self):
        self.assertEqual(self.client.get(CHOICES).status_code, 400)
        self.assertEqual(self.client.get(CHOICES, {'domain': 'nonsense'}).status_code, 400)
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.client.get(CHOICES, {'domain': 'crop'}).status_code, 200)

    # ── the type of item on a fisheries record ───────────────────────────────

    def test_a_fisheries_distribution_keeps_the_type_of_item(self):
        org = make_org(FisherfolkOrganization, 'Item Org')
        member = make_person('fisherfolk', 'Ito')
        FisherfolkOrganizationMember.objects.create(organization=org, fisherfolk=member, date_joined=date(2022, 1, 1))
        body = {'assistance_type': 'Feed', 'date_given': TODAY, 'quantity': '5 sack', 'item_type': 'Starter Feed'}
        r = self.client.post(f'/api/organizations/fisherfolk/{org.id}/distribute-assistance/', body, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(FisherfolkBeneficiaryRecord.objects.get(fisherfolk=member).item_type, 'Starter Feed')

    def test_giving_to_selected_fisherfolk_keeps_the_type_of_item(self):
        person = make_person('fisherfolk', 'Gia')
        r = self.client.post('/api/interventions/fisherfolk-beneficiaries/adhoc/bulk/', {
            'fisherfolk_ids': [person.id], 'assistance_type': 'Fishing Gear', 'date_given': TODAY, 'quantity': '2 pcs', 'item_type': 'Gill Net'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        record = FisherfolkBeneficiaryRecord.objects.get(fisherfolk=person)
        self.assertEqual((record.item_type, record.quantity), ('Gill Net', '2 pcs'))
        self.assertEqual(self.client.get(f'/api/interventions/fisherfolk-beneficiaries/adhoc/{record.id}/').json()['item_type'], 'Gill Net')

    def test_the_organization_assistance_report_names_the_type_of_item(self):
        from reports.org_assistance import assistance_label
        record = FisherfolkBeneficiaryRecord(assistance_type='Fingerlings/Seeds', item_type='Tilapia')
        self.assertEqual(assistance_label(record), 'Fingerlings/Seeds — Tilapia')
        self.assertEqual(assistance_label(FisherfolkBeneficiaryRecord(assistance_type='Feed', item_type='Starter Feed')), 'Feed — Starter Feed')
        self.assertEqual(assistance_label(FisherfolkBeneficiaryRecord(assistance_type='Feed')), 'Feed')
        _ = timedelta
