"""A citizen account is either set up or not set up. A new setup must be verified within 3 days (the person signs in and
sets their own password), or it is cancelled and staff set it up again. Citizen accounts are never "deactivated"."""
import io
import re
from datetime import timedelta

from django.core import mail
from django.core.cache import cache
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from accounts.test_email_login_reset import MAIL, NEW, OLD, make_citizen, make_staff
from accounts.utils import accountless_or_unactivated_ids, issue_temporary_password

LOGIN = '/api/accounts/login/'
USERS = '/api/accounts/users/'


def overdue(user):
    User.objects.filter(pk=user.pk).update(temp_password_expires_at=timezone.now() - timedelta(minutes=1))


def pending(email='ana@x.test'):
    farmer, user = make_citizen(email=email)
    password = issue_temporary_password(user)
    return farmer, user, password


class SetupWindowTests(APITestCase):
    def setUp(self):
        cache.clear()

    def sign_in(self, password, email='ana@x.test'):
        return self.client.post(LOGIN, {'email': email, 'password': password}, format='json')

    def assert_not_set_up(self, user):
        user.refresh_from_db()
        self.assertFalse(user.is_active)
        self.assertFalse(user.has_usable_password())
        self.assertFalse(user.must_change_password)
        self.assertIsNone(user.temp_password_expires_at)

    def assert_days_left(self, user, days):
        user.refresh_from_db()
        self.assertLess(abs((user.temp_password_expires_at - timezone.now() - timedelta(days=days)).total_seconds()), 60)

    def test_a_citizen_has_three_days_and_staff_keep_seven(self):
        _, user, _ = pending()
        self.assert_days_left(user, 3)
        staff = make_staff('s@x.test')
        issue_temporary_password(staff)
        self.assert_days_left(staff, 7)

    def test_signing_in_late_cancels_the_setup_and_says_so(self):
        _, user, password = pending()
        overdue(user)
        response = self.sign_in(password)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data['code'], 'setup_expired')
        self.assertIn('set it up again', response.data['detail'])
        self.assert_not_set_up(user)

    def test_a_wrong_password_learns_nothing_and_cancels_nothing(self):
        _, user, _ = pending()
        overdue(user)
        self.assertEqual(self.sign_in('Wrong#Pass999').status_code, 401)
        user.refresh_from_db()
        self.assertTrue(user.is_active)

    def test_setting_your_own_password_in_time_keeps_the_account_for_good(self):
        _, user, password = pending()
        self.client.force_authenticate(user)
        response = self.client.post('/api/accounts/change-password/', {
            'current_password': password, 'new_password': NEW, 'confirm_new_password': NEW}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        user.refresh_from_db()
        self.assertTrue(user.is_active)
        self.assertIsNone(user.temp_password_expires_at)

    def test_setting_a_password_too_late_is_refused(self):
        _, user, password = pending()
        overdue(user)
        user.refresh_from_db()
        self.client.force_authenticate(user)
        response = self.client.post('/api/accounts/change-password/', {
            'current_password': password, 'new_password': NEW, 'confirm_new_password': NEW}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assert_not_set_up(user)

    def test_the_record_page_offers_set_up_again(self):
        farmer, user, _ = pending()
        overdue(user)
        self.client.force_authenticate(make_staff('admin@x.test'))
        response = self.client.get(f'/api/farmers/{farmer.id}/')
        self.assertFalse(response.data['citizen_account']['is_active'])
        self.assert_not_set_up(user)
        again = self.client.post(f'{USERS}{user.id}/set-citizen-password/', {}, format='json')
        self.assertEqual(again.status_code, 200, again.data)

    def test_user_management_no_longer_lists_a_cancelled_setup(self):
        _, user, _ = pending()
        overdue(user)
        self.client.force_authenticate(make_staff('admin@x.test'))
        rows = self.client.get(USERS, {'role': 'FARMER'}).data['results']
        self.assertEqual(rows, [])
        self.assert_not_set_up(user)

    def test_an_organization_cannot_confirm_for_nobody(self):
        farmer, user, _ = pending()
        self.assertEqual(accountless_or_unactivated_ids('FARMER', [farmer.id]), set())
        overdue(user)
        self.assertEqual(accountless_or_unactivated_ids('FARMER', [farmer.id]), {farmer.id})

    def test_a_verified_account_never_expires(self):
        farmer, user = make_citizen(email='ana@x.test')
        User.objects.filter(pk=user.pk).update(temp_password_expires_at=None, must_change_password=False)
        self.assertEqual(self.sign_in(OLD).status_code, 200)
        self.assertEqual(accountless_or_unactivated_ids('FARMER', [farmer.id]), set())

    @override_settings(**MAIL)
    def test_forgot_password_does_not_revive_a_cancelled_setup(self):
        _, user, _ = pending()
        overdue(user)
        self.client.post('/api/accounts/forgot-password/', {'email': 'ana@x.test'}, format='json')
        self.assertEqual(len(mail.outbox), 0)
        self.assert_not_set_up(user)

    @override_settings(**MAIL)
    def test_the_set_up_email_gives_the_deadline(self):
        _, user = make_citizen(active=False)
        self.client.force_authenticate(make_staff('admin@x.test'))
        self.client.post(f'{USERS}{user.id}/set-citizen-password/', {'email': 'ana@x.test'}, format='json')
        user.refresh_from_db()
        deadline = timezone.localtime(user.temp_password_expires_at).strftime('%B %d, %Y')
        self.assertIn(deadline, mail.outbox[0].body)
        self.assertRegex(mail.outbox[0].body, re.compile('set your own password', re.I))


class StartWindowCommandTests(APITestCase):
    def test_accounts_not_yet_verified_get_three_days_from_now(self):
        _, long_ago, _ = pending('a@x.test')
        overdue(long_ago)
        _, never_signed_in = make_citizen(email='b@x.test')
        _, verified = make_citizen(email='c@x.test')
        User.objects.filter(pk=verified.pk).update(last_login=timezone.now())
        _, not_set_up = make_citizen(email='d@x.test', active=False)

        out = io.StringIO()
        call_command('start_verification_window', stdout=out)
        self.assertIn('2 account(s)', out.getvalue())
        never_signed_in.refresh_from_db()
        self.assertFalse(never_signed_in.must_change_password)          # a preview changes nothing

        call_command('start_verification_window', '--confirm', stdout=io.StringIO())
        for user in (long_ago, never_signed_in):
            user.refresh_from_db()
            self.assertTrue(user.must_change_password)
            self.assertGreater(user.temp_password_expires_at, timezone.now() + timedelta(days=2, hours=23))
        for user in (verified, not_set_up):
            user.refresh_from_db()
            self.assertIsNone(user.temp_password_expires_at)


class NoDeactivationTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = make_staff('admin@x.test')
        self.client.force_authenticate(self.admin)
        _, self.user = make_citizen(email='ana@x.test')

    def test_a_citizen_account_cannot_be_deactivated(self):
        response = self.client.patch(f'{USERS}{self.user.id}/', {'is_active': False}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('is_active', response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)

    def test_its_other_details_can_still_be_edited(self):
        response = self.client.patch(f'{USERS}{self.user.id}/', {'contact_number': '09181112222'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

    def test_reactivate_is_not_for_citizens(self):
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        response = self.client.post(f'{USERS}{self.user.id}/reactivate/')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Set Up Account', response.data['detail'])

    def test_user_management_lists_only_set_up_citizen_accounts(self):
        make_citizen(email='off@x.test', active=False)
        rows = self.client.get(USERS, {'role': 'FARMER'}).data['results']
        self.assertEqual([r['email'] for r in rows], ['ana@x.test'])

    def test_staff_can_still_be_deactivated(self):
        other = make_staff('focal@x.test', role='EVALUATOR')
        response = self.client.patch(f'{USERS}{other.id}/', {'is_active': False}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
