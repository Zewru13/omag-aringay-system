"""Login and e-mail verification must not tell a stranger which accounts exist, and must not be usable to hammer them."""
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient, APITestCase
from rest_framework.throttling import SimpleRateThrottle

from accounts.models import User

MAIL = dict(SMTP_CONFIGURED=True, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
LOGIN = '/api/accounts/login/'
RESEND = '/api/accounts/resend-verification/'
SAME_FAILURE = 'Incorrect login details. Check your email, username, RSBSA number or registration number, and your password.'


def make_user(username='lh-member', password='Right#Pass1234', **extra):
    return get_user_model().objects.create_user(username=username, password=password, role='CITIZEN', **extra)


class LoginEnumerationTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = make_user()

    def attempt(self, identifier, password='wrong-Password#1'):
        return self.client.post(LOGIN, {'email': identifier, 'password': password}, format='json')

    def test_a_missing_account_and_a_wrong_password_look_identical(self):
        unknown = self.attempt('nobody-at-all@example.test')
        wrong = self.attempt('lh-member')
        self.assertEqual((unknown.status_code, unknown.json()), (wrong.status_code, wrong.json()))
        self.assertEqual(unknown.status_code, 401)
        self.assertEqual(unknown.json()['detail'], SAME_FAILURE)

    def test_a_missing_account_still_costs_a_password_check(self):
        # Otherwise "answers instantly" gives away that the account does not exist.
        with mock.patch('accounts.views.check_password', wraps=lambda *a, **k: False) as spy:
            self.attempt('nobody-at-all@example.test', 'x')
        spy.assert_called_once()

    def test_the_correct_password_still_logs_in(self):
        response = self.attempt('lh-member', 'Right#Pass1234')
        self.assertEqual(response.status_code, 200)
        self.assertIn('access', response.json())


class LoginThrottleTests(APITestCase):
    def setUp(self):
        cache.clear()

    def test_one_address_cannot_try_many_different_accounts(self):
        # The existing limit counts per account name, so rotating through names was never slowed down.
        with mock.patch.dict(SimpleRateThrottle.THROTTLE_RATES, {'login_ip': '4/min'}):
            codes = [self.client.post(LOGIN, {'email': f'guess{i}@example.test', 'password': 'x'}, format='json').status_code
                     for i in range(6)]
        self.assertEqual(codes[:4], [401] * 4)
        self.assertEqual(codes[4:], [429, 429])

    def test_a_forged_forwarded_for_header_does_not_reset_the_limit(self):
        with mock.patch.dict(SimpleRateThrottle.THROTTLE_RATES, {'login_ip': '3/min'}):
            codes = [self.client.post(LOGIN, {'email': f'guess{i}@example.test', 'password': 'x'}, format='json',
                                      HTTP_X_FORWARDED_FOR=f'10.9.8.{i}').status_code for i in range(5)]
        self.assertEqual(codes[3:], [429, 429])

    def test_another_address_is_not_affected(self):
        with mock.patch.dict(SimpleRateThrottle.THROTTLE_RATES, {'login_ip': '2/min'}):
            for i in range(3):
                self.client.post(LOGIN, {'email': f'guess{i}@example.test', 'password': 'x'}, format='json')
            other = APIClient(REMOTE_ADDR='203.0.113.7')
            self.assertEqual(other.post(LOGIN, {'email': 'someone@example.test', 'password': 'x'}, format='json').status_code, 401)


@override_settings(**MAIL)
class ResendVerificationTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.pending = get_user_model().objects.create_user(
            username='lh-pending', password='Right#Pass1234', role='EVALUATOR', email='pending@example.test', is_active=False)
        self.admin = get_user_model().objects.create_user(
            username='lh-admin', password='Right#Pass1234', role='ADMIN', email='admin@example.test', is_email_verified=True)

    def anonymous(self, email):
        return APIClient().post(RESEND, {'email': email}, format='json')

    def test_a_stranger_cannot_tell_whether_an_email_is_registered(self):
        known = self.anonymous('pending@example.test')
        unknown = self.anonymous('nobody@example.test')
        verified = self.anonymous('admin@example.test')
        self.assertEqual({r.status_code for r in (known, unknown, verified)}, {200})
        self.assertEqual(known.json(), unknown.json())
        self.assertEqual(known.json(), verified.json())

    def test_the_link_is_still_emailed_to_a_pending_account(self):
        self.anonymous('pending@example.test')
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['pending@example.test'])

    def test_a_failed_send_never_hands_the_token_to_a_stranger(self):
        with override_settings(SMTP_CONFIGURED=False):
            body = self.anonymous('pending@example.test').json()
        self.assertEqual(set(body), {'detail'})
        self.pending.refresh_from_db()
        self.assertNotIn(self.pending.email_verification_token or 'none', str(body))

    def test_a_signed_in_admin_still_gets_the_full_answer(self):
        client = APIClient()
        client.force_authenticate(self.admin)
        with override_settings(SMTP_CONFIGURED=False):
            body = client.post(RESEND, {'email': 'pending@example.test'}, format='json').json()
        self.assertIs(body['email_sent'], False)
        self.assertIn('verification_link', body)
        self.assertEqual(client.post(RESEND, {'email': 'nobody@example.test'}, format='json').status_code, 404)

    def test_it_cannot_be_used_to_flood_an_inbox(self):
        codes = [self.anonymous('pending@example.test').status_code for _ in range(8)]
        self.assertIn(429, codes)
        self.assertLess(len(mail.outbox), 8)
