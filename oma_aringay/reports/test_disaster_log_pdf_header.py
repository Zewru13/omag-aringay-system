"""The PDF of an individual Farmer / Fisherfolk Disaster Report: the seal 25% wider (64 -> 80 points, height from its own proportions),
no system-name tagline under the title or in the footer. Every other PDF keeps its letterhead and footer exactly as before."""
import io

from django.test import SimpleTestCase
from pypdf import PdfReader

from core.constants import SYSTEM_TITLE
from reports import disaster_log_pdf, pdf_utils
from reports.disaster_log_pdf import LOGO_PATH, LOGO_WIDTH, build_disaster_log_pdf


def the_pdf():
    return build_disaster_log_pdf(
        title='FARMER DISASTER REPORT', header_rows=[('Reference No.', 'FDR-1'), ('Disaster Status', 'Logged')],
        sections=[{'title': 'Farmer', 'rows': [('Name', 'Ana Cruz')]}], photo_paths=[], reference='FDR-1', pdf_title='FDR-1')


def pdf_text(data):
    return '\n'.join(page.extract_text() for page in PdfReader(io.BytesIO(data)).pages)


def logo_of(story):
    return story[0]._cellvalues[0][0]


class DisasterLogPdfHeaderTests(SimpleTestCase):
    def test_the_seal_is_exactly_25_percent_wider_with_its_own_proportions(self):
        old = logo_of(pdf_utils.build_official_header(LOGO_PATH, 'T'))
        new = logo_of(pdf_utils.build_official_header(LOGO_PATH, 'T', logo_width=LOGO_WIDTH))
        self.assertEqual((old.drawWidth, old.drawHeight), (64, 64))                       # as it was, for every other PDF
        self.assertEqual(LOGO_WIDTH, 80)
        self.assertAlmostEqual(new.drawWidth / old.drawWidth, 1.25)
        self.assertAlmostEqual(new.drawHeight / new.drawWidth, 511 / 488, places=4)       # the seal is 488 x 511 pixels: not stretched

    def test_the_pdf_has_no_tagline_in_the_header_or_the_footer(self):
        text = pdf_text(the_pdf())
        self.assertNotIn('INTEGRATED AGRICULTURAL', text)
        self.assertNotIn('MONITORING MANAGEMENT SYSTEM', text)
        self.assertNotIn(SYSTEM_TITLE, text.replace('\n', ' '))
        self.assertIn('OFFICE OF THE MUNICIPAL AGRICULTURIST', text)       # the letterhead's own office line
        self.assertIn('FARMER DISASTER REPORT', text)                      # the title is unchanged
        self.assertIn('Ana Cruz', text)                                    # so is the body
        self.assertIn('Page 1 of 1', text)                                 # and the page numbers
        self.assertIn(disaster_log_pdf.FOOTER_TEXT, text)

    def test_every_other_pdf_keeps_its_letterhead_and_footer(self):
        self.assertIn(SYSTEM_TITLE, pdf_utils._DISCLAIMER)
        self.assertIsNone(pdf_utils.NumberedCanvas.disclaimer)
        flowables = pdf_utils.build_official_header(LOGO_PATH, 'Harvested Crop Report', SYSTEM_TITLE)
        self.assertEqual(logo_of(flowables).drawWidth, 64)
        texts = [getattr(f, 'text', '') for f in flowables]
        self.assertIn(SYSTEM_TITLE, texts)                                 # the subtitle is still drawn when a report asks for it
