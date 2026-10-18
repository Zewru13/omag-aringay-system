"""The system's full name, in the one place that defines it and everywhere the backend prints it."""
from django.test import RequestFactory, TestCase

from core.constants import SYSTEM_TITLE

FULL_TITLE = (
    'INTEGRATED AGRICULTURAL MONITORING MANAGEMENT SYSTEM FOR THE OFFICE OF MUNICIPAL AGRICULTURIST '
    'OF AGRINGAY, LA UNION')


class SystemTitleTests(TestCase):
    def test_the_title_is_the_agreed_wording(self):
        self.assertEqual(SYSTEM_TITLE, FULL_TITLE)

    def test_the_api_root_names_the_system_by_it(self):
        import json
        from oma_aringay.urls import api_root
        body = json.loads(api_root(RequestFactory().get('/api/')).content)
        self.assertEqual(body['system'], FULL_TITLE)

    def test_the_pdf_footer_names_the_system_by_it(self):
        from reports.pdf_utils import _DISCLAIMER
        self.assertIn(FULL_TITLE, _DISCLAIMER)

    def test_the_organization_account_email_names_the_system_by_it(self):
        from types import SimpleNamespace
        from unittest import mock

        from django.utils import timezone

        from accounts.utils import send_organization_credentials_email
        org = SimpleNamespace(name='Test Org', contact_person='', registration_number='REG-1', email_address='o@x.test')
        with mock.patch('accounts.utils._send', return_value=(True, None)) as sent:
            send_organization_credentials_email(org, 'Temp-pass-1', timezone.now())
        self.assertIn(FULL_TITLE, sent.call_args.args[1])
