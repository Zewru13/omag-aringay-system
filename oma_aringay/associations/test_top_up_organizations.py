"""manage.py top_up_organizations: make every organization (farmers and fisherfolk) reach a number of members and of kinds of equipment.

Members come from the registered people who are not in any organization yet (the same barangay as the organization first); each becomes an
ordinary Member whose first organization is their main one. Equipment is added as new kinds (names the organization does not have yet) until
it has enough. Dry run by default; --confirm does it and writes a manifest of exactly what was added; --undo <manifest> removes exactly that."""
import itertools
import json
import tempfile
from datetime import date
from io import StringIO
from pathlib import Path

from django.core.management import call_command
from django.test import TestCase

from associations.models import (
    FarmersOrganization, FarmersOrganizationEquipment, FarmersOrganizationMember,
    FisherfolkOrganization, FisherfolkOrganizationEquipment, FisherfolkOrganizationMember,
)
from farmers.models import Farmer
from fisheries.models import Fisherfolk

_N = itertools.count(1)
ORG = dict(registration_agency='SEC', contact_person='Pat', contact_number='09170000000', date_organized=date(2020, 1, 1), date_registered=date(2020, 2, 1))


def farmer(barangay='Alaska', rsbsa=None):
    n = next(_N)
    return Farmer.objects.create(rsbsa_number=rsbsa or '01-033-02-019-%06d' % (950000 + n), first_name='Top', last_name=f'F{n}', gender='Male',
                                 birthdate=date(1985, 1, 1), barangay=barangay, civil_status='Single')


def fisher(barangay='Alaska'):
    n = next(_N)
    return Fisherfolk.objects.create(rsbsa_number='01-033-02-019-%06d' % (960000 + n), first_name='Top', last_name=f'S{n}', gender='Male',
                                     birthdate=date(1985, 1, 1), barangay=barangay, fisherfolk_type='Inland')


def farmers_org(name, barangay='Alaska'):
    n = next(_N)
    return FarmersOrganization.objects.create(name=name, registration_number=f'TOP-F{n:04d}', barangay=barangay, **ORG)


def fisherfolk_org(name, barangay='Alaska'):
    n = next(_N)
    return FisherfolkOrganization.objects.create(name=name, registration_number=f'TOP-S{n:04d}', barangay=barangay, **ORG)


class TopUpOrganizationsTests(TestCase):
    def run_command(self, *args):
        out = StringIO()
        with tempfile.TemporaryDirectory() as folder:
            call_command('top_up_organizations', *args, '--backup-dir', folder, stdout=out)
            files = sorted(Path(folder).glob('*.json'))
            manifests = [json.loads(f.read_text(encoding='utf8')) for f in files]
            names = [f.name for f in files]
        return out.getvalue(), manifests, names

    def setUp(self):
        self.org_f = farmers_org('Farm Co', 'Alaska')
        for _ in range(3):                                             # already has 3 members
            FarmersOrganizationMember.objects.create(organization=self.org_f, farmer=farmer('Alaska'), date_joined=date(2026, 1, 1), is_main=True)
        self.org_s = fisherfolk_org('Fish Co', 'Dulao')
        self.free_alaska = [farmer('Alaska') for _ in range(8)]       # not in any organization
        self.free_other = [farmer('Samara') for _ in range(30)]
        self.free_fishers_dulao = [fisher('Dulao') for _ in range(4)]
        self.free_fishers_other = [fisher('Samara') for _ in range(20)]

    def count_f(self, org):
        return org.members.filter(is_active=True).count()

    def test_a_dry_run_changes_nothing_and_shows_the_plan(self):
        text, manifests, _ = self.run_command()
        self.assertIn('Farm Co', text)
        self.assertIn('add 12 member', text)
        self.assertIn('add 5 equipment', text)
        self.assertIn('Add --confirm', text)
        self.assertEqual(self.count_f(self.org_f), 3)
        self.assertEqual(self.org_f.equipment.count(), 0)
        self.assertEqual(manifests, [])

    def test_every_organization_reaches_the_number_of_members_and_kinds_of_equipment(self):
        self.run_command('--confirm')
        self.assertEqual(self.count_f(self.org_f), 15)
        self.assertEqual(self.org_s.members.filter(is_active=True).count(), 15)
        self.assertEqual(self.org_f.equipment.values('equipment_name').distinct().count(), 5)
        self.assertEqual(self.org_s.equipment.values('equipment_name').distinct().count(), 5)

    def test_the_same_barangay_is_used_first(self):
        self.run_command('--confirm')
        added = FarmersOrganizationMember.objects.filter(organization=self.org_f).exclude(farmer__last_name__startswith='F1').select_related('farmer')
        alaska = [m for m in added if m.farmer.barangay == 'Alaska']
        self.assertGreaterEqual(len(alaska), 8 + 3)         # all 8 free Alaska farmers (plus the 3 who were already there)
        fishers = FisherfolkOrganizationMember.objects.filter(organization=self.org_s).select_related('fisherfolk')
        self.assertEqual(len([m for m in fishers if m.fisherfolk.barangay == 'Dulao']), 4)

    def test_a_person_joins_one_organization_only_and_it_is_their_main(self):
        other = farmers_org('Second Farm Co', 'Alaska')
        self.run_command('--confirm')
        ids = list(FarmersOrganizationMember.objects.filter(organization__in=[self.org_f, other]).values_list('farmer_id', flat=True))
        self.assertEqual(len(ids), len(set(ids)))                              # nobody is in both
        for member in FarmersOrganizationMember.objects.filter(organization__in=[self.org_f, other]):
            self.assertTrue(member.is_main)
            self.assertEqual(member.position, 'Member')
            self.assertTrue(member.is_active)

    def test_people_who_are_already_members_or_demo_people_are_not_used(self):
        demo = farmer('Alaska', rsbsa='DEMO-0099')
        member_elsewhere = farmers_org('Elsewhere', 'Samara')
        taken = farmer('Alaska')
        FarmersOrganizationMember.objects.create(organization=member_elsewhere, farmer=taken, date_joined=date(2026, 1, 1), is_main=True)
        self.run_command('--confirm')
        self.assertFalse(FarmersOrganizationMember.objects.filter(organization=self.org_f, farmer=demo).exists())
        self.assertFalse(FarmersOrganizationMember.objects.filter(organization=self.org_f, farmer=taken).exists())

    def test_date_joined_is_the_date_the_organization_was_registered(self):
        self.run_command('--confirm')
        added = FarmersOrganizationMember.objects.filter(organization=self.org_f).exclude(date_joined=date(2026, 1, 1))
        self.assertTrue(added.exists())
        self.assertEqual({m.date_joined for m in added}, {date(2020, 2, 1)})

    def test_equipment_is_new_kinds_and_marked_as_sample_data(self):
        FarmersOrganizationEquipment.objects.create(organization=self.org_f, equipment_name='Hand Tractor', quantity=2, condition='Good')
        self.run_command('--confirm')
        names = list(self.org_f.equipment.values_list('equipment_name', flat=True))
        self.assertEqual(len(names), len(set(names)))                         # no kind twice
        self.assertEqual(len(names), 5)
        added = self.org_f.equipment.exclude(equipment_name='Hand Tractor')
        self.assertEqual(added.count(), 4)
        for row in added:
            self.assertGreaterEqual(row.quantity, 1)
            self.assertEqual(row.condition, 'Good')
            self.assertIn('Sample data', row.remarks)

    def test_an_organization_that_already_has_enough_is_left_alone(self):
        for i, name in enumerate(['Hand Tractor', 'Rice Thresher', 'Corn Sheller', 'Rice Mill', 'Dryer', 'Generator']):
            FarmersOrganizationEquipment.objects.create(organization=self.org_f, equipment_name=name, quantity=1, condition='Good')
        before = self.org_f.equipment.count()
        self.run_command('--confirm')
        self.assertEqual(self.org_f.equipment.count(), before)

    def test_when_there_are_not_enough_people_it_adds_what_there_is_and_says_so(self):
        FisherfolkOrganizationMember.objects.all().delete()
        Fisherfolk.objects.filter(last_name__startswith='S').exclude(pk__in=[f.pk for f in self.free_fishers_dulao]).delete()
        text, _, _ = self.run_command('--confirm')
        self.assertEqual(self.org_s.members.filter(is_active=True).count(), 4)
        self.assertIn('only 4', text)

    def test_the_manifest_lists_what_was_added_and_undo_removes_exactly_that(self):
        keep = self.org_f.members.count()
        text, manifests, names = self.run_command('--confirm')
        self.assertEqual(len(manifests), 1)
        manifest = manifests[0]
        self.assertEqual(len(manifest['farmers_members']), 12)
        self.assertEqual(len(manifest['fisherfolk_members']), 15)
        self.assertTrue(manifest['farmers_equipment'] and manifest['fisherfolk_equipment'])
        # undo with the manifest file
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'manifest.json'
            path.write_text(json.dumps(manifest), encoding='utf8')
            out = StringIO()
            call_command('top_up_organizations', '--undo', str(path), '--confirm', stdout=out)
        self.assertEqual(self.org_f.members.count(), keep)
        self.assertEqual(self.org_s.members.count(), 0)
        self.assertEqual(FarmersOrganizationEquipment.objects.count() + FisherfolkOrganizationEquipment.objects.count(), 0)

    def test_running_it_again_adds_nothing(self):
        self.run_command('--confirm')
        text, manifests, _ = self.run_command('--confirm')
        self.assertIn('Nothing to add', text)
        self.assertEqual(manifests, [])
        self.assertEqual(self.count_f(self.org_f), 15)
