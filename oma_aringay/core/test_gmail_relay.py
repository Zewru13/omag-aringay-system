"""E-mail over HTTPS through the office's Google Apps Script (scripts/email-relay), for hosts that block the mail ports."""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from django.core.mail import send_mail, send_mass_mail
from django.test import SimpleTestCase, override_settings

from accounts.utils import _send
from core.gmail_relay import RelayError

SECRET = 'test-secret-not-a-real-one'


class FakeAppsScript(BaseHTTPRequestHandler):
    """Like a deployed web app: the POST runs the script, then answers 302 to a page that is read with GET."""
    posts, gets, answer = [], [], {'ok': True}

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        self.posts.append(json.loads(self.rfile.read(length)))
        self.send_response(302)
        self.send_header('Location', '/result')
        self.end_headers()

    def do_GET(self):
        self.gets.append((self.path, self.headers.get('Content-Length')))
        body = self.answer if isinstance(self.answer, str) else json.dumps(self.answer)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(body.encode())

    def log_message(self, *args):
        pass


class GmailRelayTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), FakeAppsScript)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = f'http://127.0.0.1:{cls.server.server_address[1]}/exec'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        super().tearDownClass()

    def setUp(self):
        FakeAppsScript.posts, FakeAppsScript.gets, FakeAppsScript.answer = [], [], {'ok': True}
        self.settings_override = override_settings(
            EMAIL_BACKEND='core.gmail_relay.GmailRelayBackend', EMAIL_RELAY_URL=self.url, EMAIL_RELAY_SECRET=SECRET,
            SMTP_CONFIGURED=True)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)

    def test_an_email_is_handed_to_the_script_with_the_secret(self):
        sent = send_mail('Reset', 'Open this link', 'x@x.test', ['ana@x.test'])
        self.assertEqual(sent, 1)
        self.assertEqual(FakeAppsScript.posts, [{
            'secret': SECRET, 'to': 'ana@x.test', 'subject': 'Reset', 'text': 'Open this link',
            'name': 'OMAg Aringay System'}])
        self.assertEqual(FakeAppsScript.gets, [('/result', None)])          # the secret is not sent on the redirect

    def test_several_messages_are_each_sent(self):
        sent = send_mass_mail((('A', 'a', 'x@x.test', ['a@x.test']), ('B', 'b', 'x@x.test', ['b@x.test'])))
        self.assertEqual(sent, 2)
        self.assertEqual([p['to'] for p in FakeAppsScript.posts], ['a@x.test', 'b@x.test'])

    def test_a_refusal_from_the_script_is_an_error(self):
        FakeAppsScript.answer = {'ok': False, 'error': 'not allowed'}
        with self.assertRaises(RelayError) as caught:
            send_mail('S', 'B', 'x@x.test', ['ana@x.test'])
        self.assertIn('not allowed', str(caught.exception))
        self.assertNotIn(SECRET, str(caught.exception))

    def test_a_sign_in_page_instead_of_an_answer_is_an_error(self):
        # What Google returns when the web app is not shared with "Anyone".
        FakeAppsScript.answer = '<html>Sign in</html>'
        with self.assertRaises(RelayError):
            send_mail('S', 'B', 'x@x.test', ['ana@x.test'])
        self.assertEqual(send_mail('S', 'B', 'x@x.test', ['ana@x.test'], fail_silently=True), 0)

    def test_the_system_reports_a_failure_without_revealing_the_secret(self):
        FakeAppsScript.answer = {'ok': False, 'error': 'quota used up'}
        sent, reason = _send('S', 'B', 'ana@x.test')
        self.assertFalse(sent)
        self.assertIn('quota used up', reason)
        self.assertNotIn(SECRET, reason)

    def test_an_unreachable_script_is_reported_not_raised(self):
        with override_settings(EMAIL_RELAY_URL='http://127.0.0.1:9/exec'):
            sent, reason = _send('S', 'B', 'ana@x.test')
        self.assertFalse(sent)
        self.assertTrue(reason)


class RelaySettingTests(SimpleTestCase):
    def test_only_a_google_script_address_over_https_is_accepted(self):
        from core.gmail_relay import usable_relay
        good = 'https://script.google.com/macros/s/abc123/exec'
        self.assertTrue(usable_relay(good, 's'))
        for url, secret in ((good, ''), ('', 's'), ('http://script.google.com/macros/s/a/exec', 's'),
                            ('https://script.google.com.evil.test/x', 's'), ('https://evil.test/exec', 's')):
            self.assertFalse(usable_relay(url, secret), url)
