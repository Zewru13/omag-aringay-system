"""When an e-mail cannot be sent the server log says why, so a problem on the live site can be found. The log never holds
what the e-mail said (reset links, temporary passwords), the full address, or the relay secret."""
import smtplib
from unittest import mock

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APITestCase

from accounts.test_email_login_reset import FORGOT, MAIL, make_citizen
from accounts.utils import _send

LOGGER = 'accounts.utils'
BODY = 'Open https://site.example.test/reset-password#uid=MQ&token=abc-123 Temporary password: Bangus#12345678'


def refuse(*args, **kwargs):
    raise RuntimeError('The email script refused the message: not allowed')


@override_settings(**MAIL)
class SendLogTests(SimpleTestCase):
    def logged(self, call):
        with self.assertLogs(LOGGER, 'WARNING') as captured:
            result = call()
        self.assertEqual(len(captured.output), 1, captured.output)
        return result, captured.output[0]

    def test_a_failed_send_is_logged_with_its_subject_and_reason(self):
        with mock.patch('accounts.utils.send_mail', side_effect=refuse):
            (sent, reason), line = self.logged(lambda: _send('Set a new password', BODY, 'ana.reyes@x.test'))
        self.assertFalse(sent)
        self.assertIn('Set a new password', line)
        self.assertIn('not allowed', line)
        self.assertIn('a***@x.test', line)

    def test_the_log_never_holds_the_message_or_the_full_address(self):
        with mock.patch('accounts.utils.send_mail', side_effect=smtplib.SMTPRecipientsRefused({})):
            (_, reason), line = self.logged(lambda: _send('Subject', BODY, 'ana.reyes@x.test'))
        for private in ('ana.reyes@x.test', 'token=abc-123', 'Bangus#12345678', 'reset-password'):
            self.assertNotIn(private, line)
        self.assertIn('ana.reyes@x.test', reason)          # the staff screen still names the address it tried

    def test_a_server_with_no_email_set_up_says_so_in_the_log(self):
        with override_settings(SMTP_CONFIGURED=False):
            (sent, _), line = self.logged(lambda: _send('Subject', BODY, 'ana@x.test'))
        self.assertFalse(sent)
        self.assertIn('not configured', line)
        self.assertNotIn('token=abc-123', line)

    def test_without_email_set_up_a_live_server_never_prints_the_message(self):
        # The console backend writes the whole message to the server output, which on a live host is the log.
        with override_settings(SMTP_CONFIGURED=False, DEBUG=False), mock.patch('accounts.utils.send_mail') as send:
            self.logged(lambda: _send('Subject', BODY, 'ana@x.test'))
        send.assert_not_called()

    def test_on_a_developer_machine_the_message_is_still_printed(self):
        with override_settings(SMTP_CONFIGURED=False, DEBUG=True), mock.patch('accounts.utils.send_mail') as send:
            self.logged(lambda: _send('Subject', BODY, 'ana@x.test'))
        send.assert_called_once()

    def test_a_successful_send_logs_nothing(self):
        with self.assertNoLogs(LOGGER, 'WARNING'):
            self.assertEqual(_send('Subject', BODY, 'ana@x.test'), (True, None))


@override_settings(**MAIL)
class ForgotPasswordFailureTests(APITestCase):
    def setUp(self):
        cache.clear()

    def test_a_reset_email_that_fails_is_logged_and_the_visitor_sees_the_same_answer(self):
        make_citizen(email='ana@x.test')
        usual = self.client.post(FORGOT, {'email': 'nobody@x.test'}, format='json')
        with mock.patch('accounts.utils.send_mail', side_effect=refuse), self.assertLogs(LOGGER, 'WARNING') as captured:
            response = self.client.post(FORGOT, {'email': 'ana@x.test'}, format='json')
        self.assertEqual((response.status_code, response.json()), (200, usual.json()))
        self.assertIn('not allowed', captured.output[0])
        self.assertNotIn('token=', captured.output[0])
