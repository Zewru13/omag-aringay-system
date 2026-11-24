"""manage.py remove_empty_organizations: delete the farmers organizations that have no members, and their login accounts.

Without --confirm it only shows what it would do. An organization is removed only when it has NOTHING at all attached (no members, past or present,
no officers, equipment, crops or assistance), so no history is lost; one that has anything is listed as kept. Its organization login account goes
with it. Before deleting, a backup file with the organizations and their accounts is written."""
import itertools
import json
import tempfile
from datetime import date
from io import StringIO
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from accounts.models import UserLinkedRecord
from associations.models import FarmersOrganization, FarmersOrganizationEquipment, FarmersOrganizationMember, OrganizationOfficer
from farmers.models import Farmer

_N = itertools.count(1)
ORG = dict(barangay='Alaska', registration_agency='SEC', contact_person='Pat', contact_number='09170000000',
           date_organized=date(2020, 1, 1), date_registered=date(2020, 2, 1))


def make_org(name, account=True):
    n = next(_N)
    org = FarmersOrganization.objects.create(name=name, registration_number=f'REO-{n:04d}', **ORG)
    user = None
    if account:
        user = get_user_model().objects.create_user(username=f'reo-{n}', password='pw', role='CITIZEN', email=f'reo-{n}@x.test')
        UserLinkedRecord.objects.create(user=user, record_type='FARMERS_ORG', record_id=org.id, is_active=True)
    return org, user


def make_farmer():
    n = next(_N)
    return Farmer.objects.create(rsbsa_number='01-033-02-019-%06d' % (940000 + n), first_name='Rem', last_name=f'F{n}', gender='Male',
                                 birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')


class RemoveEmptyOrganizationsTests(TestCase):
    def run_command(self, *args):
        out = StringIO()
        with tempfile.TemporaryDirectory() as folder:
            call_command('remove_empty_organizations', *args, '--backup-dir', folder, stdout=out)
            files = sorted(Path(folder).glob('*.json'))
            data = [json.loads(f.read_text(encoding='utf8')) for f in files]
        return out.getvalue(), data

    def setUp(self):
        self.empty_a, self.user_a = make_org('Empty A')
        self.empty_b, self.user_b = make_org('Empty B')
        self.with_member, self.user_m = make_org('Has a member')
        FarmersOrganizationMember.objects.create(organization=self.with_member, farmer=make_farmer(), date_joined=date(2026, 1, 1))
        self.past_member, self.user_p = make_org('Had a member once')
        FarmersOrganizationMember.objects.create(organization=self.past_member, farmer=make_farmer(), date_joined=date(2026, 1, 1), is_active=False)
        self.with_equipment, self.user_e = make_org('Has equipment')
        FarmersOrganizationEquipment.objects.create(organization=self.with_equipment, equipment_name='Pump', quantity=1, condition='Good')

    def test_without_confirm_nothing_is_deleted_and_the_list_is_shown(self):
        text, files = self.run_command()
        self.assertIn('Empty A', text)
        self.assertIn('Empty B', text)
        self.assertIn('add --confirm', text)
        self.assertEqual(FarmersOrganization.objects.count(), 5)
        self.assertEqual(get_user_model().objects.filter(username__startswith='reo-').count(), 5)
        self.assertEqual(files, [])                      # no backup either: nothing was touched

    def test_confirm_deletes_the_empty_organizations_and_their_accounts_only(self):
        text, files = self.run_command('--confirm')
        self.assertEqual(sorted(FarmersOrganization.objects.values_list('name', flat=True)), ['Had a member once', 'Has a member', 'Has equipment'])
        self.assertFalse(get_user_model().objects.filter(pk__in=[self.user_a.pk, self.user_b.pk]).exists())
        self.assertFalse(UserLinkedRecord.objects.filter(record_type='FARMERS_ORG', record_id__in=[self.empty_a.id, self.empty_b.id]).exists())
        # the others and their accounts are untouched
        for user in (self.user_m, self.user_p, self.user_e):
            self.assertTrue(get_user_model().objects.filter(pk=user.pk).exists())
            self.assertTrue(UserLinkedRecord.objects.filter(user=user).exists())
        self.assertIn('Deleted 2 organization', text)

    def test_an_organization_with_any_history_is_kept_and_named(self):
        text, _ = self.run_command('--confirm')
        self.assertIn('Has a member', text)               # listed as kept, with why
        self.assertIn('Had a member once', text)
        self.assertIn('Has equipment', text)
        self.assertTrue(FarmersOrganization.objects.filter(pk=self.past_member.pk).exists())

    def test_an_organization_with_an_officer_is_kept(self):
        org, _ = make_org('Has an officer')
        OrganizationOfficer.objects.create(organization=org, farmer=make_farmer(), position='President', full_name='Pat President', term_start_date=date(2026, 1, 1))
        self.run_command('--confirm')
        self.assertTrue(FarmersOrganization.objects.filter(pk=org.pk).exists())

    def test_a_backup_of_what_is_deleted_is_written_before_deleting(self):
        _, files = self.run_command('--confirm')
        self.assertEqual(len(files), 1)
        names = [row['fields'].get('name') for row in files[0] if row['model'] == 'associations.farmersorganization']
        self.assertEqual(sorted(names), ['Empty A', 'Empty B'])
        users = [row for row in files[0] if row['model'] == 'accounts.user']
        self.assertEqual(len(users), 2)
        self.assertTrue(all('password' not in row['fields'] for row in users))    # no password hash is written to the file

    def test_an_account_that_also_belongs_to_another_record_is_not_deleted(self):
        UserLinkedRecord.objects.create(user=self.user_a, record_type='FARMER', record_id=make_farmer().id, is_active=True)
        self.run_command('--confirm')
        self.assertFalse(FarmersOrganization.objects.filter(pk=self.empty_a.pk).exists())
        self.assertTrue(get_user_model().objects.filter(pk=self.user_a.pk).exists())       # it is also a farmer's login, so it stays
        self.assertFalse(UserLinkedRecord.objects.filter(record_type='FARMERS_ORG', record_id=self.empty_a.id).exists())

    def test_an_organization_that_never_had_an_account_is_removed_too(self):
        org, _ = make_org('No account', account=False)
        self.run_command('--confirm')
        self.assertFalse(FarmersOrganization.objects.filter(pk=org.pk).exists())

    def test_running_it_again_finds_nothing_to_do(self):
        self.run_command('--confirm')
        text, files = self.run_command('--confirm')
        self.assertIn('No organization without members', text)
        self.assertEqual(files, [])
