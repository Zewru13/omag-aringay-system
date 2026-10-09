"""An organization added or imported with an email gets an active account and an emailed temporary password."""
import io
import itertools
import re
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from openpyxl import Workbook
from rest_framework.test import APITestCase

from accounts.models import User, UserLinkedRecord
from associations.models import FarmersOrganization, FisherfolkOrganization
from associations.views import ORG_TEMPLATE_HEADERS

MAIL = dict(SMTP_CONFIGURED=True, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
FORMAT = re.compile(r'[A-Z][a-z]{3,5}[#@!$%]\d{6}')
_N = itertools.count(1)
DOMAINS = {
    'farmers': ('FARMERS_ORG', FarmersOrganization),
    'fisherfolk': ('FISHERFOLK_ORG', FisherfolkOrganization),
}


def payload(**over):
    n = next(_N)
    data = {
        'name': f'Activation Org {n}', 'barangay': 'Alaska', 'street_address': '',
        'registration_number': f'ACT-{n:04d}', 'registration_agency': 'SEC', 'email_address': f'org{n}@example.test',
        'contact_person': 'Pat Contact', 'contact_number': '09171234567',
        'date_organized': '2020-01-10', 'date_registered': '2020-03-01',
    }
    data.update(over)
    return data


def linked_user(link_type, org):
    return User.objects.get(linked_records__record_type=link_type, linked_records__record_id=org.id,
                            linked_records__is_active=True)


def workbook(rows):
    book = Workbook()
    sheet = book.active
    sheet.append(ORG_TEMPLATE_HEADERS)
    for row in rows:
        sheet.append(row)
    stream = io.BytesIO()
    book.save(stream)
    return SimpleUploadedFile('orgs.xlsx', stream.getvalue(),
                              content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


def import_row(reg, email):
    return [f'Imported {reg}', 'Alaska', 'Purok 1', '2020-03-15', '2020-06-01', reg, 'SEC', email, 'Juan Dela Cruz',
            '09171234567']


class OrgActivationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user(
            username='act-staff', password='pw', role='ADMIN', email='act-staff@x.test')

    def setUp(self):
        cache.clear()
        self.client.force_authenticate(self.staff)

    @override_settings(**MAIL)
    def test_create_with_email_activates_and_emails(self):
        for domain, (link_type, model) in DOMAINS.items():
            mail.outbox.clear()
            body = payload()
            response = self.client.post(f'/api/organizations/{domain}/', body, format='json')
            self.assertEqual(response.status_code, 201, (domain, response.content))
            org = model.objects.get(pk=response.data['id'])
            user = linked_user(link_type, org)
            self.assertTrue(user.is_active)
            self.assertTrue(user.must_change_password)
            self.assertIsNotNone(user.temp_password_expires_at)
            self.assertFalse(user.email)
            self.assertEqual(len(mail.outbox), 1)
            message = mail.outbox[0]
            self.assertEqual(message.to, [body['email_address']])
            self.assertNotIn('http', message.body)
            password = re.search(r'Temporary password: (\S+)', message.body).group(1)
            self.assertRegex(password, FORMAT)
            self.assertIn(body['registration_number'], message.body)
            activation = response.data['activation']
            self.assertTrue(activation['activated'])
            self.assertTrue(activation['email_sent'])
            self.assertNotIn('default_password', activation)
            self.assertNotIn(password, response.content.decode())
            self.client.force_authenticate(None)
            login = self.client.post('/api/accounts/login/', {'username': body['registration_number'], 'password': password})
            self.assertEqual(login.status_code, 200, (domain, login.content))
            self.client.force_authenticate(self.staff)

    @override_settings(**MAIL)
    def test_create_without_email_keeps_inactive_shell(self):
        for domain, (link_type, model) in DOMAINS.items():
            mail.outbox.clear()
            response = self.client.post(f'/api/organizations/{domain}/', payload(email_address=''), format='json')
            self.assertEqual(response.status_code, 201, (domain, response.content))
            self.assertFalse(response.data['activation']['activated'])
            user = linked_user(link_type, model.objects.get(pk=response.data['id']))
            self.assertFalse(user.is_active)
            self.assertEqual(len(mail.outbox), 0)

    def test_email_failure_returns_password_once(self):
        with mock.patch('accounts.utils._send', return_value=(False, 'boom')):
            response = self.client.post('/api/organizations/farmers/', payload(), format='json')
        self.assertEqual(response.status_code, 201, response.content)
        activation = response.data['activation']
        self.assertTrue(activation['activated'])
        self.assertFalse(activation['email_sent'])
        self.assertEqual(activation['reason'], 'boom')
        self.assertRegex(activation['default_password'], FORMAT)
        user = linked_user('FARMERS_ORG', FarmersOrganization.objects.get(pk=response.data['id']))
        self.assertTrue(user.is_active)
        self.assertTrue(user.check_password(activation['default_password']))
        again = self.client.get(f"/api/organizations/farmers/{response.data['id']}/")
        self.assertNotIn(activation['default_password'], again.content.decode())

    @override_settings(**MAIL)
    def test_email_equal_to_existing_user_email_does_not_collide(self):
        get_user_model().objects.create_user(
            username='someone-else', password='pw', role='EVALUATOR', email='shared@example.test')
        mail.outbox.clear()
        response = self.client.post('/api/organizations/farmers/', payload(email_address='shared@example.test'),
                                    format='json')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual([m.to for m in mail.outbox], [['shared@example.test']])
        user = linked_user('FARMERS_ORG', FarmersOrganization.objects.get(pk=response.data['id']))
        self.assertFalse(user.email)
        self.assertTrue(user.is_active)

    @override_settings(**MAIL)
    def test_import_activates_rows_with_email(self):
        file = workbook([import_row('IMPA-0001', 'a@example.test'), import_row('IMPA-0002', 'b@example.test')])
        response = self.client.post('/api/organizations/farmers/import/', {'file': file}, format='multipart')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data['created'], 2)
        self.assertEqual(response.data['credentials_to_hand_over'], [])
        self.assertEqual(sorted(m.to[0] for m in mail.outbox), ['a@example.test', 'b@example.test'])
        for reg in ('IMPA-0001', 'IMPA-0002'):
            org = FarmersOrganization.objects.get(registration_number=reg)
            self.assertTrue(linked_user('FARMERS_ORG', org).is_active)
        self.assertTrue(all(r['activation']['email_sent'] for r in response.data['rows'] if r['status'] == 'ready'))

    @override_settings(**MAIL)
    def test_import_partial_email_failure(self):
        from accounts import utils as account_utils
        real_send = account_utils._send

        def flaky(subject, message, recipient):
            if recipient == 'bad@example.test':
                return False, 'rejected'
            return real_send(subject, message, recipient)

        file = workbook([import_row('IMPB-0001', 'bad@example.test'), import_row('IMPB-0002', 'good@example.test')])
        with mock.patch('accounts.utils._send', side_effect=flaky):
            response = self.client.post('/api/organizations/farmers/import/', {'file': file}, format='multipart')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual([m.to for m in mail.outbox], [['good@example.test']])
        good = linked_user('FARMERS_ORG', FarmersOrganization.objects.get(registration_number='IMPB-0002'))
        bad = linked_user('FARMERS_ORG', FarmersOrganization.objects.get(registration_number='IMPB-0001'))
        self.assertTrue(good.is_active)
        self.assertTrue(bad.is_active)
        handover = response.data['credentials_to_hand_over']
        self.assertEqual(len(handover), 1)
        self.assertEqual(handover[0]['login'], 'IMPB-0001')
        self.assertEqual(handover[0]['reason'], 'rejected')
        self.assertTrue(bad.check_password(handover[0]['default_password']))

    @override_settings(**MAIL)
    def test_import_dry_run_creates_nothing_and_sends_nothing(self):
        file = workbook([import_row('IMPC-0001', 'c@example.test')])
        response = self.client.post('/api/organizations/farmers/import/', {'file': file, 'dry_run': 'true'},
                                    format='multipart')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data['created'], 0)
        self.assertFalse(FarmersOrganization.objects.filter(registration_number='IMPC-0001').exists())
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(response.data['credentials_to_hand_over'], [])

    @override_settings(**MAIL)
    def test_import_row_without_email_stays_inactive(self):
        file = workbook([import_row('IMPD-0001', '')])
        response = self.client.post('/api/organizations/fisherfolk/import/', {'file': file}, format='multipart')
        self.assertEqual(response.status_code, 200, response.content)
        org = FisherfolkOrganization.objects.get(registration_number='IMPD-0001')
        self.assertFalse(linked_user('FISHERFOLK_ORG', org).is_active)
        self.assertEqual(len(mail.outbox), 0)

    @override_settings(**MAIL)
    def test_import_stops_trying_after_repeated_mail_failures(self):
        """A dead mail server must not hold the request open: after 3 failures in a row the rest are handed over."""
        rows = [import_row(f'IMPF-{i:04d}', f'f{i}@example.test') for i in range(1, 6)]
        with mock.patch('accounts.utils._send', return_value=(False, 'mail server down')) as sender:
            response = self.client.post('/api/organizations/farmers/import/', {'file': workbook(rows)}, format='multipart')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(sender.call_count, 3)
        handover = response.data['credentials_to_hand_over']
        self.assertEqual(len(handover), 5)
        for item in handover:
            org = FarmersOrganization.objects.get(registration_number=item['login'])
            self.assertTrue(linked_user('FARMERS_ORG', org).check_password(item['default_password']))
            self.assertTrue(item['reason'])

    @override_settings(**MAIL)
    def test_import_that_rolls_back_sends_no_email(self):
        """The second row fails after the first was already activated: nothing is kept and nothing is emailed."""
        from django.db import IntegrityError
        from associations.serializers import FarmersOrganizationDetailSerializer
        real_save = FarmersOrganizationDetailSerializer.save
        calls = {'n': 0}

        def second_save_fails(serializer, *args, **kwargs):
            calls['n'] += 1
            if calls['n'] == 2:
                raise IntegrityError('simulated')
            return real_save(serializer, *args, **kwargs)

        file = workbook([import_row('IMPE-0001', 'e1@example.test'), import_row('IMPE-0002', 'e2@example.test')])
        with mock.patch.object(FarmersOrganizationDetailSerializer, 'save', second_save_fails):
            response = self.client.post('/api/organizations/farmers/import/', {'file': file}, format='multipart')
        self.assertEqual(response.status_code, 409)
        self.assertEqual(calls['n'], 2)
        self.assertEqual(len(mail.outbox), 0)
