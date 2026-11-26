"""Farmers, fisherfolk and organizations sign in with their e-mail; the same address gets their password reset link and
their notifications."""
import csv
import io
import itertools
import json
import os
import re
import tempfile
from datetime import date, timedelta
from unittest import mock

from django.core import mail
from django.core.cache import cache
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase
from rest_framework.throttling import SimpleRateThrottle
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

from accounts.models import User, UserLinkedRecord
from accounts.utils import create_inactive_citizen_shell, issue_temporary_password
from associations.models import FarmersOrganization
from core.notifications import notify_staff, notify_user
from farmers.models import Farmer

LOGIN = '/api/accounts/login/'
FORGOT = '/api/accounts/forgot-password/'
RESET = '/api/accounts/reset-password/'
SITE = 'https://site.example.test'
MAIL = dict(SMTP_CONFIGURED=True, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
            EMAIL_IN_BACKGROUND=False, FRONTEND_BASE_URL=SITE)
OLD = 'Old#Pass1234'
NEW = 'Maganda#2024x'
LINK = re.compile(r'https://\S+/reset-password#uid=([^&\s]+)&token=(\S+)')
_N = itertools.count(1)


def make_farmer(**over):
    n = next(_N)
    data = dict(rsbsa_number=f'01-33-02-014-{n:06d}', first_name='Ana', last_name=f'Reyes{n}', barangay='Alaska',
                birthdate=date(1990, 1, 1), contact_number='09171234567')
    data.update(over)
    return Farmer.objects.create(**data)


def make_citizen(email=None, active=True, password=OLD, farmer=None):
    farmer = farmer or make_farmer(email=email or '')
    user = User(username=f'farmer-{farmer.id}', email=email, role='CITIZEN', full_name=farmer.full_name,
                is_active=active)
    user.set_password(password)
    user.save()
    UserLinkedRecord.objects.create(user=user, record_type='FARMER', record_id=farmer.id, is_active=True)
    return farmer, user


def make_staff(email='staff@x.test', verified=True, role='ADMIN'):
    return User.objects.create_user(username=f'staff-{next(_N)}', password=OLD, role=role, email=email,
                                    is_email_verified=verified)


class SignInTests(APITestCase):
    def setUp(self):
        cache.clear()

    def sign_in(self, identifier, password=OLD):
        return self.client.post(LOGIN, {'email': identifier, 'password': password}, format='json')

    def test_a_citizen_signs_in_with_the_email_in_any_letter_case(self):
        make_citizen(email='ana@x.test')
        self.assertEqual(self.sign_in('ANA@x.test').status_code, 200)

    def test_the_rsbsa_number_and_the_username_no_longer_sign_a_citizen_in(self):
        farmer, user = make_citizen(email='ana@x.test')
        self.assertEqual(self.sign_in(farmer.rsbsa_number).status_code, 401)
        self.assertEqual(self.sign_in(user.username).status_code, 401)

    def test_an_organization_registration_number_no_longer_signs_in(self):
        org = FarmersOrganization.objects.create(
            name='Org', barangay='Alaska', registration_number='REG-77', date_organized=date(2020, 1, 1),
            date_registered=date(2020, 2, 1), registration_agency='SEC', contact_person='Pat',
            contact_number='09171234567')
        user = User.objects.create_user(username='farmers_org-x', password=OLD, role='CITIZEN', email='org@x.test')
        UserLinkedRecord.objects.create(user=user, record_type='FARMERS_ORG', record_id=org.id, is_active=True)
        self.assertEqual(self.sign_in('REG-77').status_code, 401)
        self.assertEqual(self.sign_in('org@x.test').status_code, 200)

    def test_staff_may_still_use_a_username(self):
        staff = make_staff()
        self.assertEqual(self.sign_in(staff.username).status_code, 200)


@override_settings(**MAIL)
class ActivationTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = make_staff('admin@x.test')
        self.client.force_authenticate(self.admin)

    def set_up(self, user, data=None, action='set-citizen-password'):
        return self.client.post(f'/api/accounts/users/{user.id}/{action}/', data or {}, format='json')

    def test_an_account_cannot_be_set_up_without_an_email(self):
        _, user = make_citizen(active=False)
        response = self.set_up(user)
        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.data)
        user.refresh_from_db()
        self.assertFalse(user.is_active)

    def test_set_up_saves_the_email_on_the_account_and_the_record_and_sends_no_password(self):
        farmer, user = make_citizen(active=False)
        response = self.set_up(user, {'email': ' Ana.New@X.test '})
        self.assertEqual(response.status_code, 200, response.data)
        user.refresh_from_db()
        farmer.refresh_from_db()
        self.assertEqual((user.email, farmer.email), ('ana.new@x.test', 'ana.new@x.test'))
        self.assertEqual(response.data['email'], 'ana.new@x.test')
        self.assertTrue(response.data['email_sent'])
        self.assertEqual([m.to for m in mail.outbox], [['ana.new@x.test']])
        self.assertNotIn(response.data['generated_password'], mail.outbox[0].body)

    def test_an_email_used_by_another_account_is_refused(self):
        make_citizen(email='taken@x.test')
        _, user = make_citizen(active=False)
        response = self.set_up(user, {'email': 'TAKEN@x.test'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('another account', str(response.data['email']))

    def test_a_badly_typed_email_is_refused(self):
        _, user = make_citizen(active=False)
        self.assertEqual(self.set_up(user, {'email': 'not-an-email'}).status_code, 400)

    def test_regenerating_keeps_the_email_or_corrects_it(self):
        farmer, user = make_citizen(email='typo@x.test')
        self.assertEqual(self.set_up(user, action='regenerate-citizen-password').status_code, 200)
        response = self.set_up(user, {'email': 'right@x.test'}, action='regenerate-citizen-password')
        self.assertEqual(response.status_code, 200, response.data)
        user.refresh_from_db()
        farmer.refresh_from_db()
        self.assertEqual((user.email, farmer.email), ('right@x.test', 'right@x.test'))

    def test_the_record_page_is_told_which_email_the_account_uses(self):
        farmer, user = make_citizen(email='ana@x.test')
        response = self.client.get(f'/api/farmers/{farmer.id}/')
        self.assertEqual(response.data['citizen_account']['email'], 'ana@x.test')


class RecordEmailTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.admin = make_staff('admin@x.test')
        self.client.force_authenticate(self.admin)

    def test_editing_the_record_email_changes_the_sign_in_email(self):
        farmer, user = make_citizen(email='old@x.test')
        farmer.email = 'Changed@x.test'
        farmer.save()
        user.refresh_from_db()
        self.assertEqual(user.email, 'changed@x.test')

    def test_an_unrelated_record_edit_leaves_the_sign_in_email_alone(self):
        farmer, user = make_citizen(email='old@x.test')
        User.objects.filter(pk=user.pk).update(email='newer@x.test')      # the account is ahead of the record
        farmer.refresh_from_db()
        farmer.contact_number = '09180000000'
        farmer.save()
        user.refresh_from_db()
        self.assertEqual(user.email, 'newer@x.test')

    def test_a_citizen_cannot_change_the_sign_in_email_or_username_themselves(self):
        _, user = make_citizen(email='ana@x.test')
        self.client.force_authenticate(user)
        for field, value in (('email', 'other@x.test'), ('username', 'ana2')):
            response = self.client.patch('/api/accounts/me/', {field: value, 'current_password': OLD}, format='json')
            self.assertEqual(response.status_code, 400, field)
        user.refresh_from_db()
        self.assertEqual(user.email, 'ana@x.test')

    def test_changing_a_citizen_email_in_user_management_updates_the_record(self):
        farmer, user = make_citizen(email='ana@x.test')
        response = self.client.patch(f'/api/accounts/users/{user.id}/', {'email': 'Fixed@x.test'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        farmer.refresh_from_db()
        self.assertEqual(farmer.email, 'fixed@x.test')
        blank = self.client.patch(f'/api/accounts/users/{user.id}/', {'email': ''}, format='json')
        self.assertEqual(blank.status_code, 400)

    def test_clearing_the_record_email_keeps_the_sign_in_email(self):
        farmer, user = make_citizen(email='old@x.test')
        farmer.email = ''
        farmer.save()
        user.refresh_from_db()
        self.assertEqual(user.email, 'old@x.test')

    def test_staff_cannot_give_a_record_an_email_that_another_account_signs_in_with(self):
        make_citizen(email='taken@x.test')
        farmer, _ = make_citizen(email='mine@x.test')
        response = self.client.patch(f'/api/farmers/{farmer.id}/', {'email': 'Taken@x.test'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.data)

    def test_a_new_record_with_a_taken_email_does_not_crash_account_creation(self):
        make_citizen(email='family@x.test')
        farmer = make_farmer(email='family@x.test')
        user = create_inactive_citizen_shell('FARMER', farmer, email=farmer.email)
        self.assertIsNone(user.email)


@override_settings(**MAIL)
class ForgotPasswordTests(APITestCase):
    def setUp(self):
        cache.clear()

    def ask(self, email, client=None, **extra):
        return (client or self.client).post(FORGOT, {'email': email}, format='json', **extra)

    def test_every_request_gets_the_same_answer(self):
        make_citizen(email='ana@x.test')
        make_citizen(email='off@x.test', active=False)
        answers = [self.ask(e) for e in ('ana@x.test', 'off@x.test', 'nobody@x.test')]
        self.assertEqual({r.status_code for r in answers}, {200})
        self.assertEqual(len({r.content for r in answers}), 1)
        self.assertEqual([m.to for m in mail.outbox], [['ana@x.test']])

    def test_the_link_points_at_the_website_whatever_host_the_request_claims(self):
        make_citizen(email='ana@x.test')
        with override_settings(ALLOWED_HOSTS=['*']):
            self.ask('ana@x.test', HTTP_HOST='evil.example.test')
        self.assertIn(f'{SITE}/reset-password#uid=', mail.outbox[0].body)
        self.assertNotIn('evil.example.test', mail.outbox[0].body)

    def test_without_a_website_address_the_live_server_sends_nothing(self):
        make_citizen(email='ana@x.test')
        with override_settings(FRONTEND_BASE_URL='', DEBUG=False, ALLOWED_HOSTS=['*']):
            self.assertEqual(self.ask('ana@x.test').status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_staff_who_have_not_verified_their_email_get_nothing(self):
        make_staff('pending@x.test', verified=False)
        self.ask('pending@x.test')
        self.assertEqual(len(mail.outbox), 0)

    def test_verified_staff_can_reset_too(self):
        make_staff('boss@x.test')
        self.ask('boss@x.test')
        self.assertEqual(len(mail.outbox), 1)

    def test_one_email_cannot_be_flooded(self):
        make_citizen(email='ana@x.test')
        with mock.patch.dict(SimpleRateThrottle.THROTTLE_RATES, {'reset_email': '3/hour'}):
            codes = [self.ask('ana@x.test').status_code for _ in range(5)]
        self.assertEqual(codes, [200, 200, 200, 429, 429])
        self.assertEqual(len(mail.outbox), 3)

    def test_one_address_cannot_try_many_emails(self):
        with mock.patch.dict(SimpleRateThrottle.THROTTLE_RATES, {'reset_ip': '4/hour'}):
            codes = [self.ask(f'guess{i}@x.test').status_code for i in range(6)]
        self.assertEqual(codes[4:], [429, 429])


@override_settings(**MAIL)
class ResetPasswordTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.farmer, self.user = make_citizen(email='ana@x.test')

    def link(self):
        mail.outbox.clear()
        self.client.post(FORGOT, {'email': 'ana@x.test'}, format='json')
        uid, token = LINK.search(mail.outbox[0].body).groups()
        mail.outbox.clear()
        return {'uid': uid, 'token': token}

    def reset(self, link, new=NEW, confirm=None):
        return self.client.post(RESET, {**link, 'new_password': new, 'confirm_new_password': confirm or new},
                                format='json')

    def test_the_link_sets_a_new_password_signs_out_old_sessions_and_confirms_by_email(self):
        self.assertEqual(self.client.post(LOGIN, {'email': 'ana@x.test', 'password': OLD}, format='json').status_code, 200)
        response = self.reset(self.link())
        self.assertEqual(response.status_code, 200, response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW))
        self.assertTrue(BlacklistedToken.objects.filter(token__user=self.user).exists())
        self.assertEqual([m.to for m in mail.outbox], [['ana@x.test']])
        self.assertNotIn(NEW, mail.outbox[0].body)

    def test_the_page_can_ask_whether_a_link_still_works_without_using_it(self):
        link = self.link()
        check = lambda data: self.client.post('/api/accounts/reset-password/check/', data, format='json')
        for _ in range(2):
            response = check(link)
            self.assertEqual((response.status_code, response.json()), (200, {'valid': True}))
        self.assertEqual(check({**link, 'token': 'x-y'}).data['code'], 'invalid_link')
        self.assertEqual(check({'uid': '', 'token': ''}).data['code'], 'invalid_link')
        self.assertEqual(self.reset(link).status_code, 200)
        used = check(link)
        self.assertEqual((used.status_code, used.data['code']), (400, 'invalid_link'))

    def test_the_link_works_only_once(self):
        link = self.link()
        self.assertEqual(self.reset(link).status_code, 200)
        again = self.reset(link, 'Another#2025y')
        self.assertEqual(again.status_code, 400)
        self.assertEqual(again.data['code'], 'invalid_link')

    def test_the_link_stops_working_after_thirty_minutes(self):
        from django.contrib.auth.tokens import PasswordResetTokenGenerator
        link = self.link()
        later = PasswordResetTokenGenerator._now
        with mock.patch.object(PasswordResetTokenGenerator, '_now',
                               lambda gen: later(gen) + timedelta(minutes=31)):
            self.assertEqual(self.reset(link).data['code'], 'invalid_link')
        self.assertEqual(self.reset(link).status_code, 200)

    def test_a_made_up_link_is_refused(self):
        for link in ({'uid': 'zzz', 'token': 'abc-def'}, {'uid': '', 'token': ''}, {**self.link(), 'token': 'x-y'}):
            self.assertEqual(self.reset(link).status_code, 400)

    def test_the_password_rules_still_apply(self):
        link = self.link()
        weak = self.reset(link, 'weakpass')
        self.assertEqual(weak.status_code, 400)
        self.assertIn('new_password', weak.data)
        self.assertEqual(self.reset(link, NEW, 'Different#2024x').status_code, 400)
        self.assertIn('new_password', self.reset(link, OLD).data)

    def test_it_verifies_an_account_still_on_its_temporary_password(self):
        issue_temporary_password(self.user)
        self.assertEqual(self.reset(self.link()).status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.must_change_password)
        self.assertIsNone(self.user.temp_password_expires_at)
        self.assertEqual(self.client.post(LOGIN, {'email': 'ana@x.test', 'password': NEW}, format='json').status_code, 200)

    def test_a_reset_never_switches_on_a_deactivated_account(self):
        link = self.link()
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertEqual(self.reset(link).status_code, 400)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_active)


@override_settings(**MAIL)
class NotificationEmailTests(APITestCase):
    def send(self, user):
        with self.captureOnCommitCallbacks(execute=True):
            notify_user(user, None, 'approved your request', 'crop', 1, 'Palay, Parcel 1', 'See your crop page.')

    def test_a_citizen_gets_the_notification_by_email(self):
        _, user = make_citizen(email='ana@x.test')
        self.send(user)
        self.assertEqual([m.to for m in mail.outbox], [['ana@x.test']])
        self.assertIn('approved your request', mail.outbox[0].body)
        self.assertIn('See your crop page.', mail.outbox[0].body)
        self.assertIn(SITE, mail.outbox[0].body)

    def test_staff_notifications_are_not_emailed(self):
        make_staff('boss@x.test')
        with self.captureOnCommitCallbacks(execute=True):
            notify_staff(None, 'submitted', 'crop', 1, 'Palay')
        self.assertEqual(len(mail.outbox), 0)

    def test_placeholder_addresses_are_skipped(self):
        for email in ('a@example.com', 'b@imported.example.invalid'):
            _, user = make_citizen(email=email)
            self.send(user)
        self.assertEqual(len(mail.outbox), 0)

    def test_a_dead_mail_server_does_not_break_the_notification(self):
        _, user = make_citizen(email='ana@x.test')
        with mock.patch('core.notification_email.send_mass_mail', side_effect=OSError('down')):
            self.send(user)
        self.assertEqual(user.notifications.count(), 1)


class DemoEmailCommandTests(APITestCase):
    BASE = 'omag.demo@gmail.com'

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.farmer, self.no_email = make_citizen()
        self.placeholder_farmer, self.placeholder = make_citizen(email='x@example.invalid')
        _, self.real = make_citizen(email='real.person@gmail.com')
        _, self.inactive = make_citizen(active=False)
        self.staff = make_staff('boss@x.test')

    def run_command(self, *args):
        out = io.StringIO()
        call_command('assign_demo_emails', *args, stdout=out)
        return out.getvalue()

    def emails(self):
        for user in (self.no_email, self.placeholder, self.real, self.inactive, self.staff):
            user.refresh_from_db()
        return [u.email for u in (self.no_email, self.placeholder, self.real, self.inactive, self.staff)]

    def test_without_confirm_nothing_changes(self):
        before = self.emails()
        out = self.run_command('--base-email', self.BASE, '--backup-dir', self.dir)
        self.assertIn(f'omag.demo+farmer{self.no_email.id}@gmail.com', out)
        self.assertEqual(self.emails(), before)
        self.assertEqual(os.listdir(self.dir), [])

    def test_confirm_gives_working_addresses_and_keeps_real_ones(self):
        self.run_command('--base-email', self.BASE, '--backup-dir', self.dir, '--confirm')
        self.assertEqual(self.emails(), [
            f'omag.demo+farmer{self.no_email.id}@gmail.com', f'omag.demo+farmer{self.placeholder.id}@gmail.com',
            'real.person@gmail.com', None, 'boss@x.test'])
        self.farmer.refresh_from_db()
        self.assertEqual(self.farmer.email, f'omag.demo+farmer{self.no_email.id}@gmail.com')
        self.assertTrue(self.no_email.check_password(OLD))          # passwords are not touched unless asked

    def test_undo_puts_the_old_emails_back(self):
        self.run_command('--base-email', self.BASE, '--backup-dir', self.dir, '--confirm')
        manifest = os.path.join(self.dir, os.listdir(self.dir)[0])
        self.assertNotIn(OLD, open(manifest, encoding='utf-8').read())
        self.run_command('--undo', manifest, '--confirm')
        self.assertEqual(self.emails()[:2], [None, 'x@example.invalid'])
        self.placeholder_farmer.refresh_from_db()
        self.assertEqual(self.placeholder_farmer.email, 'x@example.invalid')

    def test_a_passwords_file_lists_every_changed_account_with_a_working_temporary_password(self):
        path = os.path.join(self.dir, 'logins.csv')
        out = self.run_command('--base-email', self.BASE, '--backup-dir', self.dir, '--passwords-file', path, '--confirm')
        with open(path, newline='', encoding='utf-8-sig') as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), 2)
        for row in rows:
            user = User.objects.get(email=row['login_email'])
            self.assertTrue(user.check_password(row['temporary_password']))
            self.assertTrue(user.must_change_password)
            self.assertNotIn(row['temporary_password'], out)

    def test_a_bad_base_address_is_refused(self):
        for bad in ('nope', 'a+b@gmail.com'):
            with self.assertRaises(CommandError):
                self.run_command('--base-email', bad, '--backup-dir', self.dir)
