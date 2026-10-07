"""Temporary passwords: the simple default format, the 7-day expiry, and every flow that issues or clears one."""
import itertools
import re
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core import mail
from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

from accounts.models import User, UserLinkedRecord
from accounts.utils import _WORDS, generate_default_password, issue_temporary_password, temp_password_expired
from accounts.validators import LOCAL_DENYLIST_TERMS
from associations.models import FarmersOrganization

FORMAT = re.compile(r'^[A-Z][a-z]{3,5}[#@!$%]\d{6}$')
EXPIRED_DETAIL = 'This temporary password has expired. Ask the Office of the Municipal Agriculturist for a new one.'
MAIL = dict(SMTP_CONFIGURED=True, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
_N = itertools.count(1)


def make_org_account(active=True, password='pw'):
    n = next(_N)
    org = FarmersOrganization.objects.create(
        name=f'Temp Org {n}', barangay='Alaska', registration_number=f'TMP-{n:04d}', date_organized=date(2020, 1, 1),
        date_registered=date(2020, 2, 1), registration_agency='SEC', contact_person='Pat Contact',
        contact_number='09171234567')
    user = get_user_model().objects.create_user(username=f'temp-org-{n}', password=password, role='CITIZEN', is_active=active)
    UserLinkedRecord.objects.create(user=user, record_type='FARMERS_ORG', record_id=org.id, is_active=True)
    return org, user


def make_admin():
    return get_user_model().objects.create_user(
        username=f'temp-admin-{next(_N)}', password='pw', role='ADMIN', email=f'temp-admin-{next(_N)}@x.test')


class GeneratorTests(SimpleTestCase):
    def test_generated_password_matches_format_and_policy(self):
        seen = set()
        for _ in range(200):
            password = generate_default_password()
            self.assertRegex(password, FORMAT)
            validate_password(password)
            seen.add(password)
        self.assertGreaterEqual(len(seen), 20)

    def test_wordlist_avoids_local_denylist(self):
        self.assertGreaterEqual(len(_WORDS), 30)
        for word in _WORDS:
            for term in LOCAL_DENYLIST_TERMS:
                self.assertNotIn(term, word.lower())


class ExpiryTests(APITestCase):
    def setUp(self):
        cache.clear()

    def login(self, user, password):
        return self.client.post('/api/accounts/login/', {'username': user.username, 'password': password})

    def test_issue_sets_flag_and_expiry(self):
        _, user = make_org_account()
        password = issue_temporary_password(user)
        user.refresh_from_db()
        self.assertTrue(user.check_password(password))
        self.assertTrue(user.must_change_password)
        expected = timezone.now() + timedelta(days=7)
        self.assertLess(abs((user.temp_password_expires_at - expected).total_seconds()), 60)

    def test_login_with_unexpired_temp_password_succeeds(self):
        _, user = make_org_account()
        password = issue_temporary_password(user)
        self.assertEqual(self.login(user, password).status_code, 200)

    def test_login_with_expired_temp_password_is_refused(self):
        _, user = make_org_account()
        password = issue_temporary_password(user)
        User.objects.filter(pk=user.pk).update(temp_password_expires_at=timezone.now() - timedelta(minutes=1))
        response = self.login(user, password)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data['code'], 'temp_password_expired')
        self.assertEqual(response.data['detail'], EXPIRED_DETAIL)
        user.refresh_from_db()
        self.assertTrue(user.is_active)
        self.assertTrue(temp_password_expired(user))

    def test_wrong_password_on_expired_account_says_incorrect(self):
        _, user = make_org_account()
        issue_temporary_password(user)
        User.objects.filter(pk=user.pk).update(temp_password_expires_at=timezone.now() - timedelta(days=1))
        response = self.login(user, 'Not#The1234')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data['detail'], 'Incorrect password.')

    def test_account_without_expiry_is_unaffected(self):
        _, user = make_org_account()
        User.objects.filter(pk=user.pk).update(must_change_password=True, temp_password_expires_at=None)
        self.assertEqual(self.login(user, 'pw').status_code, 200)

    def test_change_password_clears_expiry_and_flag(self):
        _, user = make_org_account()
        temp = issue_temporary_password(user)
        self.client.force_authenticate(user)
        response = self.client.post('/api/accounts/change-password/', {
            'current_password': temp, 'new_password': 'Maganda#2024x', 'confirm_new_password': 'Maganda#2024x'})
        self.assertEqual(response.status_code, 200, response.data)
        user.refresh_from_db()
        self.assertIsNone(user.temp_password_expires_at)
        self.assertFalse(user.must_change_password)

    def test_change_password_refuses_a_password_missing_the_composition_rules(self):
        _, user = make_org_account()
        temp = issue_temporary_password(user)
        self.client.force_authenticate(user)
        response = self.client.post('/api/accounts/change-password/', {
            'current_password': temp, 'new_password': 'maganda', 'confirm_new_password': 'maganda'})
        self.assertEqual(response.status_code, 400)
        messages = ' '.join(response.data['new_password'])
        for text in ('capital letter', 'special character', '3 numbers'):
            self.assertIn(text, messages)
        user.refresh_from_db()
        self.assertTrue(user.must_change_password)


class ReuseAndOldEndpointTests(APITestCase):
    def setUp(self):
        cache.clear()

    def test_change_password_refuses_keeping_the_temporary_password(self):
        _, user = make_org_account()
        temp = issue_temporary_password(user)
        self.client.force_authenticate(user)
        response = self.client.post('/api/accounts/change-password/', {
            'current_password': temp, 'new_password': temp, 'confirm_new_password': temp})
        self.assertEqual(response.status_code, 400)
        self.assertIn('different', ' '.join(response.data['new_password']))
        user.refresh_from_db()
        self.assertTrue(user.must_change_password)
        self.assertIsNotNone(user.temp_password_expires_at)

    def test_unthrottled_token_endpoint_is_gone(self):
        _, user = make_org_account()
        temp = issue_temporary_password(user)
        response = self.client.post('/api/token/', {'username': user.username, 'password': temp})
        self.assertEqual(response.status_code, 404)


class IssueFlowTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = make_admin()
        self.client.force_authenticate(self.admin)

    def test_set_up_account_issues_expiring_password(self):
        _, user = make_org_account(active=False)
        response = self.client.post(f'/api/accounts/users/{user.id}/set-citizen-password/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertRegex(response.data['generated_password'], FORMAT)
        user.refresh_from_db()
        self.assertTrue(user.is_active)
        self.assertTrue(user.must_change_password)
        self.assertIsNotNone(user.temp_password_expires_at)
        self.assertTrue(user.check_password(response.data['generated_password']))

    def test_regenerate_sets_new_expiry_and_flag_and_revokes_tokens(self):
        _, user = make_org_account(active=True, password='Old#Pass123')
        self.client.force_authenticate(None)
        login = self.client.post('/api/accounts/login/', {'username': user.username, 'password': 'Old#Pass123'})
        self.assertEqual(login.status_code, 200)
        self.client.force_authenticate(self.admin)
        response = self.client.post(f'/api/accounts/users/{user.id}/regenerate-citizen-password/')
        self.assertEqual(response.status_code, 200, response.data)
        new_password = response.data['generated_password']
        self.assertRegex(new_password, FORMAT)
        user.refresh_from_db()
        self.assertFalse(user.check_password('Old#Pass123'))
        self.assertTrue(user.check_password(new_password))
        self.assertTrue(user.must_change_password)
        self.assertIsNotNone(user.temp_password_expires_at)
        self.assertTrue(BlacklistedToken.objects.filter(token__user=user).exists())

    @override_settings(**MAIL)
    def test_staff_creation_still_emails_link_and_password(self):
        response = self.client.post('/api/accounts/users/create/', {
            'email': 'new.focal@example.test', 'full_name': 'New Focal', 'role': 'EVALUATOR'})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(len(mail.outbox), 1)
        body = mail.outbox[0].body
        self.assertIn('verify-email?token=', body)
        match = re.search(r'Temporary password: (\S+)', body)
        self.assertIsNotNone(match)
        self.assertRegex(match.group(1), FORMAT)
        user = User.objects.get(email='new.focal@example.test')
        self.assertFalse(user.is_active)
        # staff accounts are gated by the verification link instead of a temporary-password expiry
        self.assertIsNone(user.temp_password_expires_at)
        self.assertTrue(user.must_change_password)


class RoleLabelTests(SimpleTestCase):
    def test_focal_person_label(self):
        self.assertEqual(User.Roles.EVALUATOR.label, 'Focal Person')
        self.assertEqual(User.Roles.EVALUATOR.value, 'EVALUATOR')
