"""The expiry date in an organization's credentials email is the Philippine local date, not the UTC date."""
from datetime import datetime, timezone as dt_timezone
from types import SimpleNamespace

from django.core import mail
from django.test import TestCase, override_settings

from accounts.utils import send_organization_credentials_email


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class CredentialsEmailDateTests(TestCase):
    def send(self, expires_at):
        org = SimpleNamespace(contact_person='Pat', name='Test Org', registration_number='REG-1', email_address='org@x.test')
        send_organization_credentials_email(org, 'Temp-Pass-123', expires_at)
        return mail.outbox[-1].body

    def test_a_late_utc_time_shows_the_next_manila_day(self):
        # 20:00 UTC on Oct 15 is 04:00 on Oct 16 in Manila
        body = self.send(datetime(2026, 10, 15, 20, 0, tzinfo=dt_timezone.utc))
        self.assertIn('October 16, 2026', body)
        self.assertNotIn('October 15, 2026', body)

    def test_an_early_utc_time_keeps_the_same_day(self):
        body = self.send(datetime(2026, 10, 15, 2, 0, tzinfo=dt_timezone.utc))
        self.assertIn('October 15, 2026', body)
