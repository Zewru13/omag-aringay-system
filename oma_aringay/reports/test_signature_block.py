"""The signature block at the foot of every printed report: Prepared | Checked | Noted | Approved by, empty slots left out,
and the old "Certified by: Municipal Agriculturist" column kept when nobody is noted or approving."""
import io
from datetime import date

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase
from pypdf import PdfReader
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate
from rest_framework.test import APITestCase

from farmers.models import Farmer
from reports.pdf_utils import build_signature_block
from reports.test_pdf_text_safety import texts


def labels(flowable):
    return [t for t in texts(flowable) if t.endswith(':') and not t.startswith('Printed')]


class SignatureBlockSlotTests(SimpleTestCase):
    def test_prepared_only_keeps_the_certified_by_column(self):
        block = build_signature_block(left_name='Ann Lee')
        self.assertEqual(labels(block), ['Prepared by:', 'Certified by:'])
        self.assertIn('MUNICIPAL AGRICULTURIST', texts(block))

    def test_checked_by_label_replaces_reviewed_by(self):
        block = build_signature_block(left_name='Ann Lee', reviewed_by='Ben Ruiz', reviewed_role='Section Head')
        self.assertIn('Checked by:', labels(block))
        self.assertNotIn('Reviewed by:', labels(block))
        self.assertIn('BEN RUIZ', texts(block))
        self.assertIn('Section Head', texts(block))

    def test_all_four_signers_print_in_order_prepared_checked_noted_approved(self):
        block = build_signature_block(
            left_name='Ann Lee', reviewed_by='Ben Ruiz', noted_by='Cy Diaz', noted_role='Dept Head', approved_by='Di Eng', approved_role='Mayor')
        self.assertEqual(labels(block), ['Prepared by:', 'Checked by:', 'Noted by:', 'Approved by:'])
        self.assertEqual([t for t in texts(block) if t in ('ANN LEE', 'BEN RUIZ', 'CY DIAZ', 'DI ENG')], ['ANN LEE', 'BEN RUIZ', 'CY DIAZ', 'DI ENG'])
        self.assertIn('Mayor', texts(block))
        self.assertNotIn('Certified by:', labels(block))

    def test_approved_only_drops_the_certified_by_fallback(self):
        block = build_signature_block(left_name='Ann Lee', approved_by='Di Eng')
        self.assertEqual(labels(block), ['Prepared by:', 'Approved by:'])

    def test_noted_only_still_drops_the_certified_by_fallback(self):
        block = build_signature_block(left_name='Ann Lee', noted_by='Cy Diaz')
        self.assertEqual(labels(block), ['Prepared by:', 'Noted by:'])
        self.assertIn('Municipal Agriculturist', texts(block))   # a noted signer with no position keeps the old default

    def test_old_link_with_only_reviewed_by_and_noted_by_still_renders(self):
        block = build_signature_block(left_name='Ann Lee', reviewed_by='Ben Ruiz', noted_by='Cy Diaz')
        self.assertEqual(labels(block), ['Prepared by:', 'Checked by:', 'Noted by:'])

    def test_four_long_names_and_positions_build_a_page_without_error(self):
        long_name, long_role = 'Maria Cristina Del Rosario-Villanueva ' * 2, 'Officer-in-Charge, Office of the Municipal Agriculturist ' * 2
        block = build_signature_block(
            left_name=long_name, left_role=long_role, reviewed_by=long_name, reviewed_role=long_role,
            noted_by=long_name, noted_role=long_role, approved_by=long_name, approved_role=long_role)
        buf = io.BytesIO()
        SimpleDocTemplate(buf, pagesize=letter).build([block])
        self.assertTrue(buf.getvalue().startswith(b'%PDF'))
        width, _height = block.wrap(468, 600)
        self.assertLessEqual(width, 468)

    def test_ampersand_and_angle_brackets_in_names_print_literally(self):
        tricky = 'R&D <Chief>'
        block = build_signature_block(left_name=tricky, left_role=tricky, reviewed_by=tricky, reviewed_role=tricky,
                                      noted_by=tricky, noted_role=tricky, approved_by=tricky, approved_role=tricky)
        found = texts(block)
        self.assertEqual(found.count('R&D <CHIEF>'), 4)
        self.assertEqual(found.count(tricky), 4)


def pdf_text(response):
    return '\n'.join(page.extract_text() for page in PdfReader(io.BytesIO(response.content)).pages)


class EveryReportCarriesTheFourSignersTests(APITestCase):
    URLS = [
        '/api/reports/registered/', '/api/reports/production/harvested-crop/', '/api/reports/fisheries/production/',
        '/api/reports/disasters/fisheries/', '/api/reports/disasters/crops/', '/api/reports/organization-assistance/',
    ]

    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='sb-admin', password='pw', role='ADMIN', email='sb@x.test')
        Farmer.objects.create(
            rsbsa_number='01-033-02-019-95001', first_name='Sig', last_name='Block', gender='Male',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')

    def test_each_report_pdf_prints_prepared_checked_noted_and_approved_by(self):
        self.client.force_authenticate(self.admin)
        for url in self.URLS:
            kind = {'kind': 'farmers'} if ('registered' in url or 'organization-assistance' in url) else {}
            res = self.client.get(url, {
                'format': 'pdf', **kind, 'prepared_by': 'Ann Lee', 'prepared_role': 'Clerk', 'reviewed_by': 'Ben Ruiz', 'reviewed_role': 'Head',
                'noted_by': 'Cy Diaz', 'noted_role': 'Director', 'approved_by': 'Di Eng', 'approved_role': 'Mayor'})
            self.assertEqual(res.status_code, 200, url)
            text = pdf_text(res)
            for want in ('Prepared by:', 'ANN LEE', 'Checked by:', 'BEN RUIZ', 'Noted by:', 'CY DIAZ', 'Approved by:', 'DI ENG', 'Mayor'):
                self.assertIn(want, text, f'{url}: {want}')
            self.assertNotIn('Reviewed by', text, url)
            self.assertNotIn('Certified by', text, url)
