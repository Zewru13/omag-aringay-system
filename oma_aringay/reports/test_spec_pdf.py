"""POST /api/reports/spec-pdf/: the Download Report of the browser-built list reports (Crop Records, Crop Monitoring, Aquaculture and Capture
Monitoring). The page sends the document it prints; the server lays the same document out as a PDF. Staff only, read-only."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

URL = '/api/reports/spec-pdf/'


def spec(**over):
    base = {
        'title': 'CROP MONITORING REPORT', 'reference': 'LR-20261030-0915', 'pageSize': 'letter', 'landscape': True,
        'footerLabel': 'crop record',
        'header': [['Date printed', 'October 30, 2026'], ['Records', '2 crop records']],
        'sections': [{'title': 'Records', 'table': {
            'head': ['No.', 'Farmer', 'Crop', 'Area (ha)'],
            'rows': [['1', 'Maria <Santos> & Sons', 'Palay (Rice)', '1.20'], ['2', 'Jose Reyes', 'Corn', '—']],
            'bold_rows': []}}],
        'signatures': ['Prepared by', 'Noted by'],
    }
    base.update(over)
    return base


class SpecPdfTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='sp-admin', password='pw', role='ADMIN', email='sa@x.test')
        cls.citizen = User.objects.create_user(username='sp-cit', password='pw', role='CITIZEN', email='sc@x.test')

    def post(self, body, user=None):
        self.client.force_authenticate(user or self.admin)
        return self.client.post(URL, body, format='json')

    def test_a_list_report_becomes_a_pdf_with_a_safe_file_name(self):
        r = self.post(spec())
        self.assertEqual(r.status_code, 200, r.content[:200])
        self.assertTrue(r.content.startswith(b'%PDF'))
        self.assertEqual(r['Content-Type'], 'application/pdf')
        self.assertIn('attachment; filename="CROP_MONITORING_REPORT_LR-20261030-0915.pdf"', r['Content-Disposition'])

    def test_portrait_and_a_detail_section_work_too(self):
        body = spec(landscape=False, sections=[{'title': 'Details', 'rows': [['Parcel', 'P-7'], ['Area', '2.00 ha']]}] + spec()['sections'])
        self.assertTrue(self.post(body).content.startswith(b'%PDF'))

    def test_a_report_with_no_rows_is_still_a_pdf(self):
        body = spec(sections=[{'title': 'Records', 'table': {'head': ['No.', 'Farmer'], 'rows': []}}])
        self.assertTrue(self.post(body).content.startswith(b'%PDF'))

    def test_only_staff_can_ask_for_it(self):
        self.assertEqual(self.post(spec(), self.citizen).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.post(URL, spec(), format='json').status_code, (401, 403))

    def test_a_bad_document_is_a_400_not_a_crash(self):
        for body in ({}, spec(title=''), spec(sections='x'), spec(header=[['only one']]),
                     spec(sections=[{'title': 'T', 'table': {'head': ['a'], 'rows': 'x'}}]),
                     spec(sections=[{'title': 'T', 'table': {'head': ['a'], 'rows': [['1', '2', '3']]}}])):
            self.assertEqual(self.post(body).status_code, 400, body)

    def test_a_huge_document_is_refused(self):
        rows = [['x'] * 4 for _ in range(5001)]
        self.assertEqual(self.post(spec(sections=[{'title': 'R', 'table': {'head': list('abcd'), 'rows': rows}}])).status_code, 400)
