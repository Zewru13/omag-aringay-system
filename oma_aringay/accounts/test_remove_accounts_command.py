"""remove_accounts: a deliberate, previewed way to delete leftover test accounts. It must never touch an account that
is in use, has any history, or that was not named."""
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from core.models import Notification

User = get_user_model()


def make(email, role='EVALUATOR', active=False):
    return User.objects.create_user(username=email, email=email, password='pw', role=role, is_active=active)


def run(*args, **options):
    out = StringIO()
    call_command('remove_accounts', *args, stdout=out, stderr=StringIO(), **options)
    return out.getvalue()


class RemoveAccountsTests(TestCase):
    def test_without_confirm_it_only_previews(self):
        make('tmp1@test.local')
        text = run('tmp1@test.local')
        self.assertIn('tmp1@test.local', text)
        self.assertIn('Nothing was deleted', text)
        self.assertTrue(User.objects.filter(email='tmp1@test.local').exists())

    def test_confirm_deletes_exactly_the_named_inactive_accounts(self):
        make('tmp1@test.local'); make('tmp2@test.local'); make('keep@test.local')
        text = run('tmp1@test.local', 'tmp2@test.local', confirm=True)
        self.assertIn('Deleted 2', text)
        named = User.objects.filter(email__in=['tmp1@test.local', 'tmp2@test.local', 'keep@test.local'])
        self.assertEqual(list(named.values_list('email', flat=True)), ['keep@test.local'])

    def test_an_active_account_is_never_deleted(self):
        make('live@test.local', active=True)
        text = run('live@test.local', confirm=True)
        self.assertIn('still active', text)
        self.assertTrue(User.objects.filter(email='live@test.local').exists())

    def test_an_account_with_any_history_is_never_deleted(self):
        user = make('used@test.local')
        Notification.objects.create(recipient=user, verb='x', record_type='crop', record_id=1, record_label='x')
        text = run('used@test.local', confirm=True)
        self.assertIn('has related records', text)
        self.assertTrue(User.objects.filter(email='used@test.local').exists())

    def test_one_bad_name_deletes_nothing_at_all(self):
        make('tmp1@test.local')
        make('live@test.local', active=True)
        count = User.objects.count()
        run('tmp1@test.local', 'live@test.local', 'missing@test.local', confirm=True)
        self.assertEqual(User.objects.count(), count)        # nothing removed, not even the safe one

    def test_it_needs_at_least_one_email(self):
        with self.assertRaises(CommandError):
            run()
