"""An organization cannot be registered before it was organized (create, edit and file import, both domains)."""
import io
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook
from rest_framework.test import APITestCase

from associations.models import FarmersOrganization, FisherfolkOrganization
from associations.views import ORG_TEMPLATE_HEADERS

_REG = itertools.count(1)
DOMAINS = {'farmers': FarmersOrganization, 'fisherfolk': FisherfolkOrganization}
BAD_MESSAGE = 'Date registered cannot be before the date organized.'


def payload(**over):
    data = {
        'name': 'Dates Org %d' % next(_REG), 'barangay': 'Alaska', 'street_address': '',
        'registration_number': 'DATES-%04d' % next(_REG), 'registration_agency': 'SEC',
        'contact_person': 'Pat Contact', 'contact_number': '09171234567',
        'date_organized': '2020-01-10', 'date_registered': '2020-03-01',
    }
    data.update(over)
    return data


def make_org(model, **over):
    values = dict(
        name='Stored Org %d' % next(_REG), barangay='Alaska', registration_number='STORED-%04d' % next(_REG),
        registration_agency='SEC', contact_person='Pat Contact', contact_number='09171234567',
        date_organized=date(2020, 1, 10), date_registered=date(2020, 3, 1))
    values.update(over)
    return model.objects.create(**values)


def import_file(row_overrides):
    row = ['Imported Org', 'Alaska', 'Purok 1', '2020-03-15', '2020-06-01', 'IMP-%04d' % next(_REG), 'SEC',
           'org@example.com', 'Juan Dela Cruz', '09171234567']
    for index, value in row_overrides.items():
        row[index] = value
    book = Workbook()
    sheet = book.active
    sheet.append(ORG_TEMPLATE_HEADERS)
    sheet.append(row)
    stream = io.BytesIO()
    book.save(stream)
    return SimpleUploadedFile('orgs.xlsx', stream.getvalue(),
                              content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


class OrgDateRuleTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user(
            username='dates-staff', password='pw', role='ADMIN', email='dates-staff@x.test')

    def setUp(self):
        self.client.force_authenticate(self.staff)

    def test_create_rejects_registered_before_organized(self):
        for domain in DOMAINS:
            response = self.client.post(
                f'/api/organizations/{domain}/', payload(date_organized='2020-05-01', date_registered='2020-04-30'), format='json')
            self.assertEqual(response.status_code, 400, domain)
            self.assertEqual(response.json()['date_registered'], [BAD_MESSAGE], domain)

    def test_create_accepts_registered_equal_to_organized(self):
        for domain in DOMAINS:
            response = self.client.post(
                f'/api/organizations/{domain}/', payload(date_organized='2020-05-01', date_registered='2020-05-01'), format='json')
            self.assertEqual(response.status_code, 201, (domain, response.content))

    def test_patch_moving_only_date_organized_after_stored_registered_is_refused(self):
        for domain, model in DOMAINS.items():
            org = make_org(model)
            response = self.client.patch(f'/api/organizations/{domain}/{org.id}/', {'date_organized': '2020-06-01'}, format='json')
            self.assertEqual(response.status_code, 400, domain)
            self.assertEqual(response.json()['date_registered'], [BAD_MESSAGE], domain)

    def test_patch_moving_only_date_registered_before_stored_organized_is_refused(self):
        for domain, model in DOMAINS.items():
            org = make_org(model)
            response = self.client.patch(f'/api/organizations/{domain}/{org.id}/', {'date_registered': '2019-12-31'}, format='json')
            self.assertEqual(response.status_code, 400, domain)
            self.assertEqual(response.json()['date_registered'], [BAD_MESSAGE], domain)

    def test_patch_of_an_unrelated_field_on_an_already_bad_record_is_allowed(self):
        for domain, model in DOMAINS.items():
            org = make_org(model, date_organized=date(2020, 6, 1), date_registered=date(2020, 1, 1))
            response = self.client.patch(f'/api/organizations/{domain}/{org.id}/', {'contact_person': 'New Person'}, format='json')
            self.assertEqual(response.status_code, 200, (domain, response.content))

    def test_missing_date_is_not_compared(self):
        for domain, model in DOMAINS.items():
            org = make_org(model, date_organized=None)
            response = self.client.patch(f'/api/organizations/{domain}/{org.id}/', {'date_registered': '2019-01-01'}, format='json')
            self.assertEqual(response.status_code, 200, (domain, response.content))

    def test_import_row_with_registered_before_organized_is_invalid(self):
        for domain in DOMAINS:
            response = self.client.post(
                f'/api/organizations/{domain}/import/',
                {'file': import_file({3: '2020-06-01', 4: '2020-05-01'}), 'dry_run': '1'}, format='multipart')
            self.assertEqual(response.status_code, 200, (domain, response.content))
            body = response.json()
            self.assertEqual(body['summary']['invalid'], 1, (domain, body))
            self.assertIn('date_registered', body['rows'][0]['detail'], domain)

    def test_import_row_with_valid_dates_is_ready(self):
        for domain in DOMAINS:
            response = self.client.post(
                f'/api/organizations/{domain}/import/',
                {'file': import_file({3: '2020-05-01', 4: '2020-05-01'}), 'dry_run': '1'}, format='multipart')
            self.assertEqual(response.json()['summary']['ready'], 1, (domain, response.json()))
