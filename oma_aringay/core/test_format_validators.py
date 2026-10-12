"""Phone numbers are exactly 09 followed by 9 digits, everywhere they are validated."""
import io
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook
from rest_framework import serializers
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from associations.models import FarmersOrganization
from associations.views import ORG_TEMPLATE_HEADERS
from core.validators import normalize_contact_number, validate_contact_number

_N = itertools.count(1)
GOOD = ['09171234567', '09999999999']
BAD = ['0917-123-4567', '+639171234567', '0817123456', '0917123456', '091712345678', '0917 1234567', '09a71234567',
       '639171234567']


class ContactNumberValidatorTests(APITestCase):
    def test_accepts_exactly_09_plus_nine_digits_and_blank(self):
        for value in GOOD:
            self.assertEqual(validate_contact_number(value), value)
        self.assertEqual(validate_contact_number(''), '')
        self.assertEqual(validate_contact_number('  '), '')

    def test_refuses_everything_else(self):
        for value in BAD:
            with self.assertRaises(serializers.ValidationError, msg=value):
                validate_contact_number(value)

    def test_normalize_turns_common_pastes_into_the_plain_format(self):
        cases = {'0917-123-4567': '09171234567', '+63 917 123 4567': '09171234567', '639171234567': '09171234567',
                 '9171234567': '09171234567', '09171234567': '09171234567', '  0917 123 4567 ': '09171234567'}
        for raw, expected in cases.items():
            self.assertEqual(normalize_contact_number(raw), expected, raw)

    def test_normalize_leaves_what_it_cannot_fix_for_the_validator_to_refuse(self):
        self.assertEqual(normalize_contact_number('0917123'), '0917123')
        self.assertEqual(normalize_contact_number(''), '')


def org_payload(**over):
    data = {'name': 'Fmt Org %d' % next(_N), 'barangay': 'Alaska', 'street_address': '',
            'registration_number': 'FMT-%04d' % next(_N), 'registration_agency': 'SEC', 'contact_person': 'Pat',
            'contact_number': '09171234567', 'date_organized': '2020-01-10', 'date_registered': '2020-03-01'}
    data.update(over)
    return data


class ContactNumberApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user(username='fmt-staff', password='pw', role='ADMIN', email='fmt@x.test')
        org = FarmersOrganization.objects.create(
            name='Fmt Own Org', barangay='Alaska', registration_number='FMT-OWN', registration_agency='SEC',
            contact_person='Pat', contact_number='09171234567', date_organized=date(2020, 1, 1), date_registered=date(2020, 2, 1))
        cls.org_user = get_user_model().objects.create_user(username='fmt-org', password='pw', role='CITIZEN', email='fo@x.test')
        UserLinkedRecord.objects.create(user=cls.org_user, record_type='FARMERS_ORG', record_id=org.id, is_active=True)

    def test_organization_create_refuses_a_formatted_number(self):
        self.client.force_authenticate(self.staff)
        for domain in ('farmers', 'fisherfolk'):
            for bad in ('0917-123-4567', '0917 1234567', '+639171234567'):
                response = self.client.post(f'/api/organizations/{domain}/', org_payload(contact_number=bad), format='json')
                self.assertEqual(response.status_code, 400, (domain, bad))
                self.assertIn('contact_number', response.json())
            ok = self.client.post(f'/api/organizations/{domain}/', org_payload(), format='json')
            self.assertEqual(ok.status_code, 201, (domain, ok.content))

    def test_citizen_contact_number_update_refuses_a_formatted_number(self):
        self.client.force_authenticate(self.org_user)
        bad = self.client.patch('/api/profile/contact-number/', {'contact_number': '0917-123-4567'}, format='json')
        self.assertEqual(bad.status_code, 400, bad.content)
        good = self.client.patch('/api/profile/contact-number/', {'contact_number': '09181234567'}, format='json')
        self.assertEqual(good.status_code, 200, good.content)

    def test_an_organization_cannot_blank_its_contact_number(self):
        """The contact number is required for an organization; the farmer and fisherfolk profiles keep it optional."""
        self.client.force_authenticate(self.org_user)
        for blank in ('', '   '):
            res = self.client.patch('/api/profile/contact-number/', {'contact_number': blank}, format='json')
            self.assertEqual(res.status_code, 400, (blank, res.content))
            self.assertIn('contact_number', res.json())
        self.assertEqual(FarmersOrganization.objects.get(name='Fmt Own Org').contact_number, '09171234567')

    def test_organization_import_normalizes_a_formatted_number(self):
        self.client.force_authenticate(self.staff)
        row = ['Imported Fmt Org', 'Alaska', 'Purok 1', '2020-03-15', '2020-06-01', 'IMPFMT-%d' % next(_N), 'SEC',
               'org@example.com', 'Juan Dela Cruz', '0917-123-4567']
        book = Workbook()
        sheet = book.active
        sheet.append(ORG_TEMPLATE_HEADERS)
        sheet.append(row)
        stream = io.BytesIO()
        book.save(stream)
        upload = SimpleUploadedFile('o.xlsx', stream.getvalue(),
                                    content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response = self.client.post('/api/organizations/farmers/import/', {'file': upload}, format='multipart')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()['summary']['ready'], 1, response.json())
        self.assertEqual(FarmersOrganization.objects.get(name='Imported Fmt Org').contact_number, '09171234567')
