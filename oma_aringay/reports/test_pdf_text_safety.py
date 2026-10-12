"""Text typed into records is shown in the PDFs exactly as typed. ReportLab reads <tags> and &entities; inside a
Paragraph, so anything not escaped could be hidden, restyled or turned into something else."""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase
from reportlab.platypus import Paragraph, Table
from rest_framework.test import APITestCase

from farmers.models import Farmer
from reports.pdf_utils import (
    build_keyvalue_grid, build_ledger_table, build_official_header, build_section_heading, build_signature_block, build_stats_row,
)

TRICKY = '<b>Bold</b> & <font color="red">red</font> &amp; <img src="logo.png"/>'


def paragraphs(flowable):
    """Every Paragraph inside a flowable (a Table's cells, or the flowable itself)."""
    if isinstance(flowable, Paragraph):
        return [flowable]
    found = []
    if isinstance(flowable, (list, tuple)):
        for item in flowable:
            found.extend(paragraphs(item))
    elif isinstance(flowable, Table):
        for row in flowable._cellvalues:
            for cell in row:
                found.extend(paragraphs(cell))
    return found


def texts(flowables):
    return [p.getPlainText() for p in paragraphs(flowables)]


class PdfBuildersShowTextAsTypedTests(SimpleTestCase):
    def test_key_value_grid_value_and_label(self):
        self.assertIn(TRICKY, texts(build_keyvalue_grid([(TRICKY, TRICKY)])))

    def test_ledger_table_cells_and_headers(self):
        found = texts(build_ledger_table([TRICKY], [[TRICKY]], col_widths=[468]))
        self.assertEqual(found.count(TRICKY), 2)

    def test_stat_row(self):
        self.assertTrue(any(TRICKY in t for t in texts(build_stats_row([(TRICKY, TRICKY)]))))

    def test_section_heading_and_document_title(self):
        self.assertTrue(any(TRICKY in t for t in texts(build_section_heading('I', TRICKY))))
        self.assertTrue(any(TRICKY in t for t in texts(build_official_header(None, TRICKY, TRICKY))))

    def test_signature_names(self):
        block = build_signature_block(left_name=TRICKY, printed_by_name=TRICKY, page_width=468)
        self.assertIn('Printed by: ' + TRICKY, texts(block))
        self.assertIn(TRICKY.upper(), texts(block))


class PdfEndToEndTests(APITestCase):
    def test_a_profile_whose_name_contains_markup_still_produces_a_pdf(self):
        admin = get_user_model().objects.create_user(username='pdf-admin', password='pw', role='ADMIN', email='pdf@x.test')
        farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-000888', first_name='<b>Bold</b> <img src="logo.png"/>', last_name='A & B', gender='Male',
            birthdate=date(1985, 3, 3), barangay='Alaska', civil_status='Single')
        self.client.force_authenticate(admin)
        response = self.client.get(f'/api/reports/farmers/{farmer.id}/profile/', {'format': 'pdf'})
        self.assertEqual((response.status_code, response.content[:5]), (200, b'%PDF-'), response.content[:200])
