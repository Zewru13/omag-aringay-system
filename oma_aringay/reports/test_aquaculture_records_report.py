"""Reports page: the Aquaculture Records report (the page's production cycles as a printable report, JSON / PDF / Excel), and the Fisheries
Production report without its "Final?" column."""
import io
import itertools
from datetime import date
from decimal import Decimal

import openpyxl
from django.contrib.auth import get_user_model
from pypdf import PdfReader
from rest_framework.test import APITestCase

from associations.models import FisherfolkOrganization
from fisheries.models import Fisherfolk, FisheriesHarvestRecord, SpeciesCategory, SpeciesOption, StockingRecord
from monitoring.models import AquacultureProductionCycle


URL = '/api/reports/aquaculture-records/'
PRODUCTION_URL = '/api/reports/fisheries/production/'
_RSBSA = itertools.count(940001)


def pdf_text_and_size(response):
    reader = PdfReader(io.BytesIO(response.content))
    page = reader.pages[0]
    return '\n'.join(p.extract_text() for p in reader.pages), (float(page.mediabox.width), float(page.mediabox.height))


HEADERS = ['Ownership', 'Cycle', 'Species', 'Fisherfolk', 'Barangay', 'Pond/Cage Location', 'Culture Type', 'Organization', 'Date Stocked', 'PCIC Insured']


def _fisherfolk(first, last, barangay):
    return Fisherfolk.objects.create(
        first_name=first, last_name=last, gender='Male', birthdate=date(1990, 1, 1), barangay=barangay, fisherfolk_type='Aquaculture',
        rsbsa_number='01-033-02-019-%06d' % next(_RSBSA))


class AquacultureRecordsReportTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='aq-adm', password='pw', role='ADMIN', email='aq@x.test')
        cls.citizen = User.objects.create_user(username='aq-cit', password='pw', role='CITIZEN', email='aqc@x.test')
        category, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        make = lambda name: SpeciesOption.objects.get_or_create(species_name=name, defaults=dict(
            category=category, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct=80, default_avg_body_weight_kg='0.25'))[0]
        cls.tilapia, cls.bangus = make('AQ Tilapia'), make('AQ Bangus')
        cls.org = FisherfolkOrganization.objects.create(
            name='Alaska Fishers', barangay='Alaska', contact_person='C', contact_number='0917', registration_number='AQ-1',
            date_organized=date(2020, 1, 1), date_registered=date(2021, 1, 1))
        cls.ana = _fisherfolk('Ana', 'Reef', 'Alaska')
        cls.ben = _fisherfolk('Ben', 'Dike', 'Basca')

        tenant = AquacultureProductionCycle.objects.create(
            fisherfolk=cls.ana, organization=cls.org, cycle_name='Dry 2026', species_farmed='AQ Tilapia', culture_system='Fishpond',
            stocking_date=date(2026, 3, 1), ownership='Tenant', owner_name='Mang Tomas', owner_registration_number='X-1')
        lease = AquacultureProductionCycle.objects.create(
            fisherfolk=cls.ben, cycle_name='Wet 2026', species_farmed='AQ Bangus', culture_system='Fishpond',
            stocking_date=date(2026, 6, 10), ownership='Lease')
        legacy = AquacultureProductionCycle.objects.create(
            fisherfolk=cls.ana, cycle_name='Legacy', species_farmed='AQ Bangus', culture_system='Fishpond', stocking_date=date(2026, 7, 20))   # no ownership saved
        stock = lambda **kw: StockingRecord.objects.create(number_of_fingerlings=100, season='Wet', year=2026, **kw)
        # oldest first: the report lists newest first, like the page
        cls.s1 = stock(fisherfolk=cls.ana, production_cycle=tenant, species=cls.tilapia, culture_type='Pond', date_stocked=date(2026, 3, 1),
                       pond_location_barangay='Alaska', has_pcic_insurance=True)
        cls.s2 = stock(fisherfolk=cls.ben, production_cycle=lease, species=cls.bangus, culture_type='Cage', date_stocked=date(2026, 6, 10),
                       pond_location_barangay='Samara', has_pcic_insurance=False)
        cls.s3 = stock(fisherfolk=cls.ana, production_cycle=legacy, species=cls.bangus, culture_type='Pen', date_stocked=date(2026, 7, 20), pond_location_barangay='')
        # every status is listed, like the page: a harvested one and a total loss
        StockingRecord.objects.filter(pk=cls.s2.pk).update(status='Harvested')
        StockingRecord.objects.filter(pk=cls.s3.pk).update(status='Total Loss')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def get(self, **params):
        r = self.client.get(URL, {'format': 'json', **params})
        self.assertEqual(r.status_code, 200, r.content[:300])
        return r.json()

    def rows(self, **params):
        return self.get(**params)['sections'][0]['rows']

    def names(self, **params):
        return [r[3] for r in self.rows(**params)]

    # ---- access and input ----------------------------------------------------------------------------------------------------------

    def test_citizens_are_refused_and_bad_input_is_a_400(self):
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.client.get(URL).status_code, 403)
        self.client.force_authenticate(self.admin)
        for params in ({'pcic': 'maybe'}, {'ownership': 'Squatter'}, {'species': 'abc'}, {'fisherfolk': 'abc'}, {'organization': 'abc'},
                       {'stocked_from': 'soon'}, {'stocked_from': '2026-09-02', 'stocked_to': '2026-09-01'}):
            self.assertEqual(self.client.get(URL, {'format': 'json', **params}).status_code, 400, params)

    # ---- the records and the ten columns -------------------------------------------------------------------------------------------

    def test_every_saved_production_cycle_is_listed_newest_first_with_the_ten_columns(self):
        doc = self.get()
        self.assertEqual(doc['title'], 'Aquaculture Records')
        self.assertEqual(doc['heading'], 'Aquaculture Records Report')
        section = doc['sections'][0]
        self.assertEqual(section['headers'], HEADERS)
        rows = section['rows']
        self.assertEqual([r[3] for r in rows], ['Ana Reef', 'Ben Dike', 'Ana Reef'])        # s3, s2, s1: the page's order
        s3, s2, s1 = rows
        self.assertEqual([s3[0], s3[2], s3[3], s3[4], s3[5], s3[6], s3[7], s3[8], s3[9]],
                         ['Not specified', 'AQ Bangus', 'Ana Reef', 'Alaska', '—', 'Pen', '—', 'Jul 20, 2026', 'No'])
        self.assertRegex(s3[1], r'^Legacy #\d+$')
        self.assertEqual([s2[0], s2[2], s2[3], s2[4], s2[5], s2[6], s2[7], s2[8], s2[9]],
                         ['Lease', 'AQ Bangus', 'Ben Dike', 'Basca', 'Samara', 'Cage', '—', 'Jun 10, 2026', 'No'])
        self.assertRegex(s2[1], r'^Wet 2026 #\d+$')
        self.assertEqual(s1[0], 'Tenant — Owner: Mang Tomas')
        self.assertRegex(s1[1], r'^Dry 2026 #\d+$')
        self.assertEqual([s1[2], s1[3], s1[4], s1[5], s1[6], s1[7], s1[8], s1[9]],
                         ['AQ Tilapia', 'Ana Reef', 'Alaska', 'Alaska', 'Pond', 'Alaska Fishers', 'Mar 01, 2026', 'Yes'])

    def test_the_count_and_the_pcic_summary_agree_with_the_rows(self):
        stats = dict(map(tuple, self.get()['stats']))
        self.assertEqual(stats, {'Production Cycles': 3, 'PCIC Insured': 1, 'Not Insured': 2})
        stats = dict(map(tuple, self.get(pcic='not_insured')['stats']))
        self.assertEqual(stats, {'Production Cycles': 2, 'PCIC Insured': 0, 'Not Insured': 2})

    # ---- filters and search --------------------------------------------------------------------------------------------------------

    def test_each_filter_narrows_the_records(self):
        self.assertEqual(self.names(ownership='Tenant'), ['Ana Reef'])
        self.assertEqual(self.names(ownership='Lease'), ['Ben Dike'])
        self.assertEqual(self.names(ownership='Owner'), [])
        self.assertEqual(self.names(ownership='none'), ['Ana Reef'])                 # the cycle with no ownership saved
        self.assertEqual(self.names(cycle='Dry 2026'), ['Ana Reef'])
        self.assertEqual(self.names(species=self.bangus.id), ['Ana Reef', 'Ben Dike'])
        self.assertEqual(self.names(fisherfolk=self.ben.id), ['Ben Dike'])
        self.assertEqual(self.names(fisherfolk=self.ana.id), ['Ana Reef', 'Ana Reef'])
        self.assertEqual(self.names(barangay='Basca'), ['Ben Dike'])                 # the fisherfolk's registered barangay
        self.assertEqual(self.names(barangay='alaska'), ['Ana Reef', 'Ana Reef'])
        self.assertEqual(self.names(pond_location='Samara'), ['Ben Dike'])           # where the pond/cage is
        self.assertEqual(self.names(culture_type='Cage'), ['Ben Dike'])
        self.assertEqual(self.names(organization=self.org.id), ['Ana Reef'])
        self.assertEqual(self.names(pcic='insured'), ['Ana Reef'])
        self.assertEqual(self.names(pcic='not_insured'), ['Ana Reef', 'Ben Dike'])
        self.assertEqual(self.names(stocked_from='2026-06-01'), ['Ana Reef', 'Ben Dike'])
        self.assertEqual(self.names(stocked_to='2026-06-10'), ['Ben Dike', 'Ana Reef'])
        self.assertEqual(self.names(stocked_from='2026-06-10', stocked_to='2026-06-10'), ['Ben Dike'])   # both ends included

    def test_the_registered_barangay_and_the_pond_location_are_different_filters(self):
        self.assertEqual(self.names(barangay='Samara'), [])
        self.assertEqual(self.names(pond_location='Basca'), [])

    def test_filters_combine_and_the_search_works_with_them(self):
        self.assertEqual(self.names(species=self.bangus.id, pcic='not_insured', barangay='Alaska'), ['Ana Reef'])
        self.assertEqual(self.names(search='reef'), ['Ana Reef', 'Ana Reef'])
        self.assertEqual(self.names(search='dike ben'), ['Ben Dike'])                # words in any order
        self.assertEqual(self.names(search='AQ Tilapia'), ['Ana Reef'])              # the species too
        self.assertEqual(self.names(search='reef', species=self.tilapia.id), ['Ana Reef'])
        self.assertEqual(self.names(search='zzzz'), [])
        empty = self.get(search='zzzz')
        self.assertEqual(empty['sections'][0]['rows'], [])
        self.assertEqual(dict(map(tuple, empty['stats']))['Production Cycles'], 0)
        self.assertTrue(empty['sections'][0]['empty'])

    def test_the_period_and_the_filters_are_told_in_words(self):
        doc = self.get(stocked_from='2026-06-01', stocked_to='2026-12-31', pcic='not_insured', species=self.bangus.id, fisherfolk=self.ben.id,
                       ownership='Lease', barangay='Basca', culture_type='Cage', organization=self.org.id)
        self.assertEqual(doc['period'], 'As of June 1 to December 31, 2026')
        for expected in ('Ownership: Lease', 'Species: AQ Bangus', 'Fisherfolk: Ben Dike', 'Barangay: Basca', 'Culture type: Cage',
                         'Organization: Alaska Fishers', 'PCIC: Not insured'):
            self.assertIn(expected, doc['subtitle'])
        self.assertEqual(self.get()['subtitle'], 'All production cycles')

    # ---- the three outputs ----------------------------------------------------------------------------------------------------------

    def test_the_pdf_has_the_same_records_and_columns_in_landscape(self):
        r = self.client.get(URL, {'format': 'pdf', 'prepared_by': 'Clerk', 'pcic': 'insured'})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.content.startswith(b'%PDF'))
        text, size = pdf_text_and_size(r)
        self.assertGreater(size[0], size[1])                                          # ten columns: landscape
        self.assertIn('AQUACULTURE RECORDS REPORT', text)
        self.assertIn('OFFICE OF THE MUNICIPAL AGRICULTURIST', text)
        for expected in ('Ana Reef', 'AQ Tilapia', 'Alaska Fishers', 'PCIC: Insured'):
            self.assertIn(expected, text)
        self.assertNotIn('Ben Dike', text)                                            # the filter applies to the printout too
        flat = ' '.join(text.split())
        for header in ('Ownership', 'Cycle', 'Species', 'Fisherfolk', 'Barangay', 'Pond/Cage Location', 'Culture Type', 'Organization', 'Date Stocked', 'PCIC Insured'):
            self.assertIn(header, flat)

    def test_the_excel_has_the_same_records_and_columns(self):
        r = self.client.get(URL, {'format': 'excel', 'search': 'dike'})
        self.assertEqual(r.status_code, 200)
        ws = openpyxl.load_workbook(io.BytesIO(r.content)).active
        cells = [str(c) for row in ws.iter_rows(values_only=True) for c in row if c is not None]
        for expected in HEADERS + ['Ben Dike', 'Lease', 'AQ Bangus', 'Samara', 'Jun 10, 2026']:
            self.assertIn(expected, cells)
        self.assertNotIn('Ana Reef', cells)


class FisheriesProductionNoFinalColumnTests(APITestCase):
    """The Fisheries Production report no longer prints the Final? column (the harvest records and the final-harvest logic are unchanged)."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='fp-adm', password='pw', role='ADMIN', email='fp@x.test')
        category, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        species = SpeciesOption.objects.get_or_create(species_name='FP Tilapia', defaults=dict(
            category=category, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct=80, default_avg_body_weight_kg='0.25'))[0]
        person = _fisherfolk('Fina', 'Harvest', 'Alaska')
        stock = StockingRecord.objects.create(
            fisherfolk=person, species=species, culture_type='Pond', date_stocked=date(2026, 3, 1), number_of_fingerlings=100, season='Dry',
            year=2026, pond_location_barangay='Alaska')
        cls.final = FisheriesHarvestRecord.objects.create(stocking_record=stock, harvest_date=date(2026, 9, 1), quantity_kg=Decimal('12.50'), is_final=True)
        cls.partial = FisheriesHarvestRecord.objects.create(stocking_record=stock, harvest_date=date(2026, 8, 1), quantity_kg=Decimal('3.00'), is_final=False)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_the_preview_rows_have_no_final_value(self):
        data = self.client.get(PRODUCTION_URL, {'format': 'json'}).json()
        self.assertEqual(data['count'], 2)
        for record in data['records']:
            self.assertNotIn('is_final', record)
            self.assertEqual(sorted(record), ['barangay', 'culture_type', 'date_stocked', 'fisherfolk', 'harvest_date', 'organization', 'quantity_kg', 'species'])

    def test_the_pdf_has_no_final_column_and_keeps_the_rest(self):
        r = self.client.get(PRODUCTION_URL, {'format': 'pdf'})
        text, size = pdf_text_and_size(r)
        self.assertNotIn('Final', text)
        flat = text.replace('\n', ' ')
        for expected in ('Barangay', 'Fisherfolk', 'Organization', 'Species', 'Culture Type', 'Date Stocked', 'Harvest Date', 'Quantity (kg)', 'Fina Harvest', '12.5'):
            self.assertIn(expected, flat)
        self.assertGreater(size[0], size[1])                                          # eight columns are still landscape
        self.assertIn('Total Harvest Records', text)

    def test_the_excel_has_no_final_column_and_keeps_the_rest(self):
        r = self.client.get(PRODUCTION_URL, {'format': 'excel'})
        ws = openpyxl.load_workbook(io.BytesIO(r.content)).active
        self.assertEqual([c.value for c in ws[6]], ['BARANGAY', 'FISHERFOLK', 'ORGANIZATION', 'SPECIES', 'CULTURE TYPE', 'DATE STOCKED', 'HARVEST DATE', 'QUANTITY (KG)'])
        for row in ws.iter_rows(min_row=7, values_only=True):
            self.assertEqual(len(row), 8)
            self.assertNotIn('Yes', row)
            self.assertNotIn('No', row)

    def test_the_final_harvest_record_itself_is_untouched(self):
        self.final.refresh_from_db()
        self.assertTrue(self.final.is_final)
        self.assertFalse(self.partial.is_final)
