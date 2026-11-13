"""Search bars: what a person types finds the record, whatever the order of the words, the spacing, the commas or the case.

A search is a list of words. Every word must be found somewhere in the record (in any of the fields the bar searches), in any order:
"Farmers Cecilia" finds "Santa Cecilia Progressive Farmers", "Cruz, Juan" finds Juan Dela Cruz. A word that is not there finds nothing.
"""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone
from rest_framework.test import APITestCase

from associations.models import (
    FarmersOrganization, FarmersOrganizationMember, FisherfolkOrganization, FisherfolkOrganizationMember,
)
from core.utils import build_text_search_q, search_tokens
from farmers.models import FarmParcel, Farmer
from fisheries.models import FisheriesDisasterReport, Fisherfolk, SpeciesCategory, SpeciesOption, StockingRecord
from interventions.models import BeneficiaryRecord
from production.models import CropDisasterReport, CropMonitoringRecord, CropType

_N = itertools.count(1)
ORG = dict(barangay='Alaska', registration_agency='SEC', contact_person='Pat', contact_number='09170000000',
           date_organized=date(2020, 1, 1), date_registered=date(2020, 2, 1))

# the ways a person types the same thing
def ways(*words):
    return [' '.join(words), ' '.join(w.upper() for w in words), '  '.join(words), ', '.join(words), ' ' + ' '.join(words) + ' ', ' '.join(reversed(words))]


class SearchHelperTests(APITestCase):
    def test_words_are_split_on_spaces_and_commas_and_blanks_are_dropped(self):
        self.assertEqual(search_tokens('  Cruz,  Juan ,dela '), ['Cruz', 'Juan', 'dela'])
        self.assertEqual(search_tokens(''), [])
        self.assertEqual(search_tokens(None), [])
        self.assertEqual(search_tokens(' , '), [])

    def test_a_blank_search_matches_everything(self):
        self.assertEqual(build_text_search_q('  ', ['name']), Q())


class OrganizationSearchTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='sw-admin', password='pw', role='ADMIN', email='sw@x.test')
        cls.farm = FarmersOrganization.objects.create(
            name='Santa Cecilia Progressive Farmers', registration_number='SEC-777', street_address='Purok 3 Riverside', **{**ORG, 'barangay': 'Baracbac'})
        cls.other_farm = FarmersOrganization.objects.create(name='Poblacion Farmers Alliance', registration_number='SEC-888', **ORG)
        cls.fish = FisherfolkOrganization.objects.create(
            name='Samara Coastal Fisherfolk Association', registration_number='FSH-555', street_address='Zone 2 Seaside', **{**ORG, 'barangay': 'Baracbac'})
        cls.other_fish = FisherfolkOrganization.objects.create(name='Dulao Fisherfolk Cooperative', registration_number='FSH-666', **ORG)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def found(self, kind, search):
        r = self.client.get(f'/api/organizations/{kind}/', {'search': search})
        self.assertEqual(r.status_code, 200, r.content[:200])
        data = r.json()
        return [o['name'] for o in (data['results'] if isinstance(data, dict) else data)]

    def test_farmers_organizations_are_found_by_their_words_in_any_order(self):
        for typed in ways('Cecilia', 'Farmers') + ways('Santa', 'Progressive') + ['santa cecilia progressive farmers', 'Farmers Santa']:
            self.assertEqual(self.found('farmers', typed), ['Santa Cecilia Progressive Farmers'], typed)

    def test_fisherfolk_organizations_are_found_by_their_words_in_any_order(self):
        for typed in ways('Samara', 'Association') + ways('Coastal', 'Fisherfolk') + ['Association Samara Fisherfolk']:
            self.assertEqual(self.found('fisherfolk', typed), ['Samara Coastal Fisherfolk Association'], typed)

    def test_the_search_also_reads_the_address_and_the_registration_number(self):
        self.assertEqual(self.found('farmers', 'Riverside'), ['Santa Cecilia Progressive Farmers'])
        self.assertEqual(self.found('farmers', 'Purok 3 Baracbac'), ['Santa Cecilia Progressive Farmers'])
        self.assertEqual(self.found('farmers', 'SEC-777'), ['Santa Cecilia Progressive Farmers'])
        self.assertEqual(self.found('fisherfolk', 'Seaside'), ['Samara Coastal Fisherfolk Association'])
        self.assertEqual(self.found('fisherfolk', 'fsh-555'), ['Samara Coastal Fisherfolk Association'])

    def test_every_word_must_be_found(self):
        self.assertEqual(self.found('farmers', 'Santa Zzzz'), [])
        self.assertEqual(self.found('fisherfolk', 'Samara Zzzz'), [])
        self.assertEqual(self.found('farmers', 'zzzz'), [])

    def test_a_blank_search_lists_everyone(self):
        self.assertEqual(len(self.found('farmers', '   ')), 2)
        self.assertEqual(len(self.found('fisherfolk', '')), 2)


class OrganizationMemberSearchTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='sm-admin', password='pw', role='ADMIN', email='sm@x.test')
        cls.farm = FarmersOrganization.objects.create(name='Member Search Farmers', registration_number='MS-1', **ORG)
        cls.fish = FisherfolkOrganization.objects.create(name='Member Search Fisherfolk', registration_number='MS-2', **ORG)
        cls.juan = Farmer.objects.create(rsbsa_number='01-033-02-019-880001', first_name='Juan', middle_name='Dela', last_name='Cruz', gender='Male',
                                         birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        cls.pedro = Farmer.objects.create(rsbsa_number='01-033-02-019-880002', first_name='Pedro', last_name='Reyes', gender='Male',
                                          birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        cls.ana = Fisherfolk.objects.create(rsbsa_number='01-033-02-019-880003', first_name='Ana', middle_name='Dela', last_name='Mar', gender='Female',
                                            birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')
        cls.ben = Fisherfolk.objects.create(rsbsa_number='01-033-02-019-880004', first_name='Ben', last_name='Tide', gender='Male',
                                            birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')
        for farmer in (cls.juan, cls.pedro):
            FarmersOrganizationMember.objects.create(organization=cls.farm, farmer=farmer, date_joined=date(2026, 1, 1))
        for person in (cls.ana, cls.ben):
            FisherfolkOrganizationMember.objects.create(organization=cls.fish, fisherfolk=person, date_joined=date(2026, 1, 1))

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def found(self, kind, org, search):
        r = self.client.get(f'/api/organizations/{kind}/{org.pk}/members/', {'search': search})
        self.assertEqual(r.status_code, 200, r.content[:200])
        data = r.json()
        rows = data['results'] if isinstance(data, dict) else data
        return sorted(row.get('farmer_name') or row.get('fisherfolk_name') or row.get('name') or row.get('full_name') or str(row) for row in rows)

    def test_a_farmer_member_is_found_by_the_full_name_in_any_order(self):
        for typed in ways('Juan', 'Cruz') + ways('Juan', 'Dela', 'Cruz') + ['cruz juan', 'Dela Cruz']:
            self.assertEqual(len(self.found('farmers', self.farm, typed)), 1, typed)

    def test_a_fisherfolk_member_is_found_by_the_full_name_in_any_order(self):
        for typed in ways('Ana', 'Mar') + ways('Ana', 'Dela', 'Mar') + ['mar ana']:
            self.assertEqual(len(self.found('fisherfolk', self.fish, typed)), 1, typed)

    def test_the_registration_number_finds_a_member_too(self):
        self.assertEqual(len(self.found('farmers', self.farm, '880001')), 1)
        self.assertEqual(len(self.found('fisherfolk', self.fish, '01-033-02-019-880004')), 1)

    def test_every_word_must_be_found_and_one_word_still_works(self):
        self.assertEqual(self.found('farmers', self.farm, 'Juan Reyes'), [])
        self.assertEqual(len(self.found('farmers', self.farm, 'cruz')), 1)
        self.assertEqual(len(self.found('farmers', self.farm, '  ')), 2)
        self.assertEqual(len(self.found('fisherfolk', self.fish, 'dela')), 1)


class UserSearchTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='su-admin', password='pw', role='ADMIN', email='su@x.test')
        cls.ana = User.objects.create_user(username='anacruz', password='pw', role='EVALUATOR', email='ana.cruz@office.test', full_name='Cruz, Ana')
        cls.ben = User.objects.create_user(username='benreyes', password='pw', role='EVALUATOR', email='ben@office.test', full_name='Reyes, Ben')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def found(self, search):
        r = self.client.get('/api/accounts/users/', {'search': search})
        self.assertEqual(r.status_code, 200, r.content[:200])
        data = r.json()
        return sorted(u['username'] for u in (data['results'] if isinstance(data, dict) else data) if u['username'] != 'su-admin')

    def test_a_staff_account_is_found_by_the_name_as_people_say_it(self):
        for typed in ways('Ana', 'Cruz') + ways('Cruz', 'Ana') + ['ana', 'CRUZ']:
            self.assertEqual(self.found(typed), ['anacruz'], typed)

    def test_the_email_and_the_username_find_it_too(self):
        self.assertEqual(self.found('ana.cruz@office.test'), ['anacruz'])
        self.assertEqual(self.found('benreyes'), ['benreyes'])
        self.assertEqual(self.found('Ben office'), ['benreyes'])

    def test_every_word_must_be_found(self):
        self.assertEqual(self.found('Ana Reyes'), [])
        self.assertEqual(self.found('zzzz'), [])


class OrganizationAssistanceAndRegisteredReportSearchTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='sr-admin', password='pw', role='ADMIN', email='sr@x.test')
        cls.org = FarmersOrganization.objects.create(name='Santa Cecilia Progressive Farmers', registration_number='SR-1', **ORG)
        cls.other = FarmersOrganization.objects.create(name='Poblacion Farmers Alliance', registration_number='SR-2', **ORG)
        farmer = Farmer.objects.create(rsbsa_number='01-033-02-019-870001', first_name='Ana', last_name='Test', gender='Female',
                                       birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        for org in (cls.org, cls.other):
            BeneficiaryRecord.objects.create(farmer=farmer, assistance_type='Seeds', date_given=date(2026, 8, 1), quantity='1 sack',
                                             distributed_by_organization=org)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def assistance_orgs(self, search):
        r = self.client.get('/api/reports/organization-assistance/', {'kind': 'farmers', 'search': search})
        self.assertEqual(r.status_code, 200, r.content[:200])
        return sorted({row[0] for row in r.json()['sections'][0]['rows']})

    def registered_orgs(self, search):
        r = self.client.get('/api/reports/registered/', {'kind': 'farmers_orgs', 'search': search})
        self.assertEqual(r.status_code, 200, r.content[:200])
        return sorted({row[0] for section in r.json()['sections'] for row in section['rows'] if isinstance(row, list) and row})

    def test_the_organization_assistance_report_finds_an_organization_by_its_words(self):
        for typed in ways('Cecilia', 'Farmers') + ['Farmers Santa', 'progressive']:
            self.assertEqual(self.assistance_orgs(typed), ['Santa Cecilia Progressive Farmers'], typed)
        self.assertEqual(self.assistance_orgs('Santa Zzzz'), [])

    def test_the_registered_report_finds_an_organization_by_its_words(self):
        for typed in ways('Cecilia', 'Farmers') + ['Farmers Santa']:
            self.assertIn('Santa Cecilia Progressive Farmers', self.registered_orgs(typed), typed)
            self.assertNotIn('Poblacion Farmers Alliance', self.registered_orgs(typed), typed)


class DisasterSearchTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='sd-admin', password='pw', role='ADMIN', email='sd@x.test')
        today = timezone.localdate()
        cat, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        cls.tilapia = SpeciesOption.objects.create(
            species_name='Search Tilapia', category=cat, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct='80', default_avg_body_weight_kg='0.25')
        cls.pedro = Fisherfolk.objects.create(rsbsa_number='01-033-02-019-860001', first_name='Pedro', last_name='Sea', gender='Male',
                                              birthdate=date(1980, 1, 1), barangay='Alaska', fisherfolk_type='Aquaculture')
        stock = StockingRecord.objects.create(fisherfolk=cls.pedro, species=cls.tilapia, culture_type='Pond', date_stocked=today - timedelta(days=20),
                                              number_of_fingerlings=500, season='Dry', year=today.year)
        FisheriesDisasterReport.objects.create(stocking_record=stock, disaster_type='Typhoon', date_of_occurrence=today - timedelta(days=5),
                                               volume_lost_kg='10', is_total_loss=True)
        cls.maria = Farmer.objects.create(rsbsa_number='01-033-02-019-860002', first_name='Maria', last_name='Santos', gender='Female',
                                          birthdate=date(1985, 3, 3), barangay='Alaska', civil_status='Single')
        parcel = FarmParcel.objects.create(farmer=cls.maria, parcel_number='P-7', area_hectares='2.00', barangay='Alaska')
        record = CropMonitoringRecord.objects.create(
            farmer=cls.maria, farm_parcel=parcel, farm_location_barangay='Alaska', land_status='Owner', crop_type=CropType.objects.order_by('id').first(),
            season='Wet', year=today.year, date_planted=today - timedelta(days=40), area_planted_ha='1.50', status='Planted')
        CropDisasterReport.objects.create(monitoring_record=record, disaster_type='Flood', date_of_occurrence=today - timedelta(days=3), area_affected_ha='0.75')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def count(self, url, search, report=False):
        r = self.client.get(url, {'search': search, **({} if report else {'page': 1})})
        self.assertEqual(r.status_code, 200, r.content[:200])
        data = r.json()
        if report:
            return len(data['sections'][0]['rows'])
        return len(data['results'] if isinstance(data, dict) else data)

    def test_the_fisheries_disaster_table_and_report_find_a_fisherfolk_by_the_full_name(self):
        for typed in ways('Pedro', 'Sea') + ways('Pedro', 'Search Tilapia') + ['Typhoon Pedro']:
            self.assertEqual(self.count('/api/fisheries/disaster-reports/', typed), 1, typed)
            self.assertEqual(self.count('/api/reports/disasters/fisheries/', typed, report=True), 1, typed)
        self.assertEqual(self.count('/api/fisheries/disaster-reports/', 'Pedro Zzzz'), 0)
        self.assertEqual(self.count('/api/reports/disasters/fisheries/', 'Pedro Zzzz', report=True), 0)

    def test_the_crop_disaster_table_and_report_find_a_farmer_by_the_full_name(self):
        for typed in ways('Maria', 'Santos') + ['Flood Maria']:
            self.assertEqual(self.count('/api/production/disaster-logs/', typed), 1, typed)
            self.assertEqual(self.count('/api/reports/disasters/crops/', typed, report=True), 1, typed)
        self.assertEqual(self.count('/api/production/disaster-logs/', 'Maria Zzzz'), 0)
        self.assertEqual(self.count('/api/reports/disasters/crops/', 'Maria Zzzz', report=True), 0)

    def test_the_report_number_still_finds_a_disaster(self):
        report = FisheriesDisasterReport.objects.get()
        self.assertEqual(self.count('/api/fisheries/disaster-reports/', report.report_number), 1)
        crop = CropDisasterReport.objects.get()
        self.assertEqual(self.count('/api/production/disaster-logs/', f'CDR-{crop.date_reported.year}-{crop.pk:05d}'), 1)
