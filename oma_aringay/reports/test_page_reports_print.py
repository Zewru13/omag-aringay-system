"""The Reports page reports as printed: one formal title each, a reporting-period line from the applied date filters, the office name
and no system-name tagline, a landscape table for wide reports, and the same records as the filters selected. Print and Preview PDF
are the same PDF (the page prints the PDF), so these tests are what both show."""
import io
from datetime import date

from django.contrib.auth import get_user_model
from pypdf import PdfReader
from rest_framework.test import APITestCase

from core.constants import SYSTEM_TITLE
from farmers.models import Farmer
from reports.period import parse_day, period_text

TAGLINE_PART = 'INTEGRATED AGRICULTURAL MONITORING'


class PeriodTextTests(APITestCase):
    def test_both_dates_in_one_year_show_the_year_once(self):
        self.assertEqual(period_text('2026-10-01', '2026-11-01'), 'As of October 1 to November 1, 2026')
        self.assertEqual(period_text(date(2026, 1, 5), date(2026, 1, 31)), 'As of January 5 to January 31, 2026')

    def test_dates_in_two_years_show_both_years(self):
        self.assertEqual(period_text('2026-12-15', '2027-01-15'), 'As of December 15, 2026 to January 15, 2027')

    def test_the_same_day_is_one_date(self):
        self.assertEqual(period_text('2026-10-01', '2026-10-01'), 'As of October 1, 2026')

    def test_one_boundary_is_shown_without_inventing_the_other(self):
        self.assertEqual(period_text('2026-10-01', ''), 'From October 1, 2026 onward')
        self.assertEqual(period_text(None, '2026-11-01'), 'Up to November 1, 2026')

    def test_no_dates_means_no_period_and_never_todays_date(self):
        for blank in ((None, None), ('', ''), ('  ', None), ('not a date', None)):
            self.assertEqual(period_text(*blank), '')
        self.assertNotIn(str(date.today().year), period_text(None, None) or 'x')

    def test_parse_day(self):
        self.assertEqual(parse_day('2026-10-01'), date(2026, 10, 1))
        self.assertIsNone(parse_day('10/01/2026'))


def pdf_text_and_size(response):
    reader = PdfReader(io.BytesIO(response.content))
    page = reader.pages[0]
    return '\n'.join(p.extract_text() for p in reader.pages), (float(page.mediabox.width), float(page.mediabox.height))


class PageReportPdfTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='pr-admin', password='pw', role='ADMIN', email='pr@x.test')
        for i, (day, barangay) in enumerate(((date(2026, 10, 5), 'Alaska'), (date(2026, 12, 20), 'Alaska'), (date(2026, 10, 7), 'Basca'))):
            f = Farmer.objects.create(
                rsbsa_number='01-033-02-019-93%04d' % i, first_name=f'Pr{i}', last_name='Printtest', gender='Male',
                birthdate=date(1985, 1, 1), barangay=barangay, civil_status='Single')
            Farmer.objects.filter(pk=f.pk).update(date_registered=day)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def pdf(self, url, **params):
        r = self.client.get(url, {'format': 'pdf', **params})
        self.assertEqual(r.status_code, 200, r.content[:200])
        self.assertTrue(r.content.startswith(b'%PDF'))
        return pdf_text_and_size(r)

    @staticmethod
    def kind_for(url):
        # Registered Records and Organization Assistance both ask which kind of record (farmers / fisherfolk) to report on.
        return {'kind': 'farmers'} if ('registered' in url or 'organization-assistance' in url) else {}

    def json(self, url, **params):
        r = self.client.get(url, {'format': 'json', **params})
        self.assertEqual(r.status_code, 200, r.content[:200])
        return r.json()

    # --- titles
    def test_each_report_has_its_own_formal_title(self):
        wanted = {
            '/api/reports/registered/': 'REGISTRATION RECORDS REPORT',
            '/api/reports/production/harvested-crop/': 'CROP HARVEST REPORT',
            '/api/reports/fisheries/production/': 'FISHERIES PRODUCTION REPORT',
            '/api/reports/disasters/fisheries/': 'FISHERIES DISASTER REPORT',
            '/api/reports/disasters/crops/': 'CROP AND PARCEL DISASTER REPORT',
            '/api/reports/organization-assistance/': 'ORGANIZATION ASSISTANCE REPORT',
        }
        for url, title in wanted.items():
            text, _ = self.pdf(url, **self.kind_for(url))
            self.assertIn(title, text, url)

    def test_the_letterhead_names_the_office_and_has_no_tagline_anywhere(self):
        for url in ('/api/reports/registered/', '/api/reports/production/harvested-crop/', '/api/reports/fisheries/production/',
                    '/api/reports/disasters/fisheries/', '/api/reports/disasters/crops/', '/api/reports/organization-assistance/'):
            text, _ = self.pdf(url, **self.kind_for(url))
            self.assertIn('OFFICE OF THE MUNICIPAL AGRICULTURIST', text, url)
            self.assertNotIn(TAGLINE_PART, text, url)
            self.assertNotIn(SYSTEM_TITLE, text.replace('\n', ' '), url)
            self.assertIn('Page 1 of', text, url)

    # --- the reporting period
    def test_the_period_line_follows_the_applied_dates_and_changes_with_them(self):
        a, _ = self.pdf('/api/reports/registered/', kind='farmers', registered_from='2026-10-01', registered_to='2026-11-01')
        self.assertIn('As of October 1 to November 1, 2026', a)
        b, _ = self.pdf('/api/reports/registered/', kind='farmers', registered_from='2026-10-01', registered_to='2027-01-15')
        self.assertIn('As of October 1, 2026 to January 15, 2027', b)
        self.assertNotIn('As of October 1 to November 1, 2026', b)

    def test_no_date_filter_prints_no_period(self):
        text, _ = self.pdf('/api/reports/registered/', kind='farmers')
        self.assertNotIn('As of', text)
        self.assertEqual(self.json('/api/reports/registered/', kind='farmers')['period'], '')

    def test_every_report_with_a_date_filter_prints_it(self):
        cases = [
            ('/api/reports/disasters/fisheries/', {'date_from': '2026-10-01', 'date_to': '2026-11-01'}),
            ('/api/reports/disasters/crops/', {'date_from': '2026-10-01', 'date_to': '2026-11-01'}),
            ('/api/reports/organization-assistance/', {'date_from': '2026-10-01', 'date_to': '2026-11-01'}),
            ('/api/reports/production/harvested-crop/', {'start_date': '2026-10-01', 'end_date': '2026-11-01'}),
            ('/api/reports/fisheries/production/', {'start_date': '2026-10-01', 'end_date': '2026-11-01'}),
        ]
        for url, params in cases:
            text, _ = self.pdf(url, **self.kind_for(url), **params)
            self.assertIn('As of October 1 to November 1, 2026', text, url)

    def test_the_dates_are_said_once_in_the_period_line_not_again_under_it(self):
        text, _ = self.pdf('/api/reports/disasters/crops/', date_from='2026-10-01', date_to='2026-11-01', barangay='Alaska')
        self.assertIn('As of October 1 to November 1, 2026', text)
        self.assertNotIn('Occurred from', text)               # the filter line keeps the other filters only
        self.assertIn('Barangay: Alaska', text)
        text, _ = self.pdf('/api/reports/registered/', kind='farmers', registered_from='2026-10-01', registered_to='2026-11-01')
        self.assertNotIn('Registered from', text)
        self.assertIn('Registered Farmers', text)

    def test_one_boundary_only(self):
        text, _ = self.pdf('/api/reports/disasters/crops/', date_from='2026-10-01')
        self.assertIn('From October 1, 2026 onward', text)
        text, _ = self.pdf('/api/reports/production/harvested-crop/', end_date='2026-11-01')
        self.assertIn('Up to November 1, 2026', text)

    # --- the same records and summary as the filters
    def test_the_pdf_has_exactly_the_filtered_records_and_the_summary_agrees(self):
        doc = self.json('/api/reports/registered/', kind='farmers', registered_from='2026-10-01', registered_to='2026-11-01')
        self.assertEqual(doc['stats'], [['Total Farmers', 2]])
        self.assertEqual(doc['period'], 'As of October 1 to November 1, 2026')
        self.assertEqual(doc['heading'], 'Registration Records Report')
        text, _ = self.pdf('/api/reports/registered/', kind='farmers', registered_from='2026-10-01', registered_to='2026-11-01')
        self.assertIn('Pr0', text)
        self.assertIn('Pr2', text)
        self.assertNotIn('Pr1', text)            # registered on December 20: outside the range
        text, _ = self.pdf('/api/reports/registered/', kind='farmers', registered_from='2026-10-01', registered_to='2026-11-01', barangay='Basca')
        self.assertIn('Pr2', text)
        self.assertNotIn('Pr0', text)

    # --- layout
    def test_wide_reports_print_landscape_and_narrow_ones_portrait(self):
        _, wide = self.pdf('/api/reports/registered/', kind='farmers')            # nine columns
        self.assertGreater(wide[0], wide[1])
        _, harvest = self.pdf('/api/reports/production/harvested-crop/')          # ten columns
        self.assertGreater(harvest[0], harvest[1])
        _, fish = self.pdf('/api/reports/fisheries/production/')                  # nine columns
        self.assertGreater(fish[0], fish[1])

    def test_a_long_report_continues_on_the_next_page_and_keeps_every_record(self):
        for i in range(70):
            f = Farmer.objects.create(
                rsbsa_number='01-033-02-019-94%04d' % i, first_name=f'Long{i:02d}', last_name='Listing', gender='Male',
                birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        r = self.client.get('/api/reports/registered/', {'format': 'pdf', 'kind': 'farmers'})
        reader = PdfReader(io.BytesIO(r.content))
        self.assertGreater(len(reader.pages), 1)
        text = '\n'.join(p.extract_text() for p in reader.pages)
        for i in (0, 35, 69):
            self.assertIn(f'Long{i:02d}', text)
        self.assertIn(f'Page {len(reader.pages)} of {len(reader.pages)}', text)
        # the column headers are repeated on the continuation pages
        self.assertIn('RSBSA', reader.pages[1].extract_text())

    def test_the_signature_block_still_carries_the_names(self):
        text, _ = self.pdf('/api/reports/registered/', kind='farmers', prepared_by='Ana Reyes', prepared_role='Records Officer', noted_by='Mr. Cruz')
        lowered = text.lower()
        self.assertIn('ana reyes', lowered)       # the signature block prints names in capitals
        self.assertIn('records officer', lowered)
        self.assertIn('mr. cruz', lowered)
        self.assertIn('Page 1 of 1', text)         # a short report, with its signature block, fits on one landscape page

    def test_excel_is_unchanged(self):
        r = self.client.get('/api/reports/registered/', {'format': 'excel', 'kind': 'farmers'})
        self.assertEqual(r.status_code, 200)
        import openpyxl
        ws = openpyxl.load_workbook(io.BytesIO(r.content)).active
        cells = [c.value for row in ws.iter_rows(min_row=1, max_row=4) for c in row if c.value]
        self.assertIn('Registered Farmers', cells)           # the sheet keeps the report's own title, not the printed heading
        self.assertNotIn('REGISTRATION RECORDS REPORT', cells)
