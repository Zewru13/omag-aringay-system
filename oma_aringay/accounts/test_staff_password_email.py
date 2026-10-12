"""Staff get their temporary password by e-mail: with the verification link when it is sent or re-sent, and again whenever an
admin regenerates it for someone who lost it. The old password stops working each time."""
import re
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()
MAIL = dict(SMTP_CONFIGURED=True, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
NO_MAIL = dict(SMTP_CONFIGURED=False)
PASSWORD_LINE = re.compile(r'Temporary password: (\S+)')
TOKEN_LINE = re.compile(r'verify-email\?token=(\S+)')


def staff(name, role='EVALUATOR', active=True, verified=True, password='Old#Pass1234'):
    return User.objects.create_user(username=f'{name}@x.test', email=f'{name}@x.test', password=password, role=role,
                                    is_active=active, is_email_verified=verified, full_name=name)


def login(email, password):
    return APIClient().post('/api/accounts/login/', {'email': email, 'password': password}, format='json')


@override_settings(**MAIL)
class ResendCarriesThePasswordTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = staff('boss', 'ADMIN')
        self.pending = staff('pending', active=False, verified=False)

    def resend(self, as_admin=True):
        client = APIClient()
        if as_admin:
            client.force_authenticate(self.admin)
        return client.post('/api/accounts/resend-verification/', {'email': self.pending.email}, format='json')

    def test_the_resent_email_has_the_link_and_a_new_temporary_password(self):
        self.resend()
        body = mail.outbox[0].body
        self.assertTrue(TOKEN_LINE.search(body))
        password = PASSWORD_LINE.search(body).group(1)
        self.assertRegex(password, r'^[A-Z][a-z]{3,5}[#@!$%]\d{8}$')

    def test_the_old_password_stops_working_and_the_new_one_signs_in_after_verifying(self):
        self.resend()
        body = mail.outbox[0].body
        password, token = PASSWORD_LINE.search(body).group(1), TOKEN_LINE.search(body).group(1)
        self.pending.refresh_from_db()
        self.assertFalse(self.pending.check_password('Old#Pass1234'))
        self.assertTrue(self.pending.must_change_password)
        self.assertGreater(self.pending.temp_password_expires_at, timezone.now() + timedelta(days=6))
        self.assertEqual(APIClient().post('/api/accounts/verify-email/', {'token': token}, format='json').status_code, 200)
        self.assertEqual(login(self.pending.email, password).status_code, 200)

    def test_a_visitor_resending_triggers_the_same_email_but_learns_nothing(self):
        response = self.resend(as_admin=False)
        self.assertEqual(set(response.json()), {'detail'})
        self.assertIn('Temporary password:', mail.outbox[0].body)

    def test_when_the_mail_cannot_be_sent_only_the_admin_is_given_the_password(self):
        with override_settings(**NO_MAIL):
            admin_body = self.resend().json()
            visitor_body = self.resend(as_admin=False).json()
        self.assertIs(admin_body['email_sent'], False)
        self.assertRegex(admin_body['temporary_password'], r'^[A-Z][a-z]{3,5}[#@!$%]\d{8}$')
        self.assertIn('verification_link', admin_body)
        self.assertEqual(set(visitor_body), {'detail'})

    def test_a_verified_account_keeps_its_password(self):
        verified = staff('verified')
        client = APIClient()
        client.force_authenticate(self.admin)
        response = client.post('/api/accounts/resend-verification/', {'email': verified.email}, format='json')
        self.assertTrue(response.json().get('already_verified'))
        verified.refresh_from_db()
        self.assertTrue(verified.check_password('Old#Pass1234'))
        self.assertEqual(len(mail.outbox), 0)


@override_settings(**MAIL)
class AdminRegeneratesPasswordTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = staff('boss', 'ADMIN')
        self.person = staff('lost-it')
        self.client.force_authenticate(self.admin)

    def url(self, user):
        return f'/api/accounts/users/{user.id}/regenerate-password/'

    def test_a_new_temporary_password_is_emailed_and_the_old_one_stops_working(self):
        response = self.client.post(self.url(self.person))
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIs(response.json()['email_sent'], True)
        self.assertNotIn('temporary_password', response.json())                  # it is in the e-mail, not on the screen
        self.assertEqual(mail.outbox[0].to, [self.person.email])
        self.assertIn('new temporary password', mail.outbox[0].subject.lower())
        body = mail.outbox[0].body
        self.assertIn(f'Login email: {self.person.email}', body)
        password = PASSWORD_LINE.search(body).group(1)
        self.assertEqual(login(self.person.email, 'Old#Pass1234').status_code, 401)
        signed_in = login(self.person.email, password)
        self.assertEqual(signed_in.status_code, 200)
        self.person.refresh_from_db()
        self.assertTrue(self.person.must_change_password)
        self.assertGreater(self.person.temp_password_expires_at, timezone.now() + timedelta(days=6))

    def test_the_old_sessions_are_cut_off(self):
        refresh = RefreshToken.for_user(self.person)
        self.client.post(self.url(self.person))
        self.assertEqual(APIClient().post('/api/accounts/token/refresh/', {'refresh': str(refresh)}, format='json').status_code, 401)

    def test_if_the_mail_cannot_be_sent_the_admin_is_given_the_password_to_pass_on(self):
        with override_settings(**NO_MAIL):
            body = self.client.post(self.url(self.person)).json()
        self.assertIs(body['email_sent'], False)
        self.assertTrue(body['temporary_password'])
        self.assertTrue(body['reason'])
        self.assertEqual(login(self.person.email, body['temporary_password']).status_code, 200)

    def test_for_someone_who_never_verified_it_also_sends_the_link(self):
        pending = staff('never-verified', active=False, verified=False)
        self.assertEqual(self.client.post(self.url(pending)).status_code, 200)
        body = mail.outbox[0].body
        self.assertTrue(TOKEN_LINE.search(body))
        self.assertTrue(PASSWORD_LINE.search(body))

    def test_it_works_for_an_admin_account_too(self):
        other_admin = staff('second', 'ADMIN')
        self.assertEqual(self.client.post(self.url(other_admin)).status_code, 200)

    # ── who can do it, and to whom ───────────────────────────────────────
    def test_only_an_admin_can(self):
        self.client.force_authenticate(staff('focal'))
        self.assertEqual(self.client.post(self.url(self.person)).status_code, 403)
        self.assertEqual(APIClient().post(self.url(self.person)).status_code, 401)
        self.assertEqual(len(mail.outbox), 0)

    def test_not_for_citizens_themselves_or_deactivated_accounts(self):
        citizen = User.objects.create_user(username='cit', password='pw', role='CITIZEN')
        self.assertEqual(self.client.post(self.url(citizen)).status_code, 400)
        self.assertEqual(self.client.post(self.url(self.admin)).status_code, 400)           # use Change Password for your own
        gone = staff('gone', active=False, verified=True)
        response = self.client.post(self.url(gone))
        self.assertEqual(response.status_code, 400)
        self.assertIn('reactivate', response.json()['detail'].lower())
        self.assertEqual(len(mail.outbox), 0)

    def test_an_unknown_user_is_a_404(self):
        self.assertEqual(self.client.post('/api/accounts/users/99999999/regenerate-password/').status_code, 404)
