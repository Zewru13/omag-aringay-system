"""The organization members import and the equipment import can be undone (both kinds of organization)."""
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from associations.test_equipment_import import HEADERS as EQUIPMENT_HEADERS, KNOWN, equipment_model
from associations.test_member_import import DOMAINS, add_member, make_org, make_person, sheet
from core.models import ImportBatch, ImportBatchItem

BATCHES = '/api/imports/batches/'
TODAY = date.today().isoformat()


class _ImportUndoBase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user(
            username='mu-staff', password='pw', role='ADMIN', email='mu-staff@x.test')

    def setUp(self):
        self.client.force_authenticate(self.staff)

    def undo_all(self, batch):
        ids = list(batch.items.values_list('id', flat=True))
        return self.client.post(f'{BATCHES}{batch.id}/undo/', {'item_ids': ids}, format='json').json()['results']


class MemberImportUndoTests(_ImportUndoBase):
    def run_import(self, domain, org, people, dry_run=False):
        rows = [[p.rsbsa_number, 'Member', TODAY] for p in people]
        r = self.client.post(f'/api/organizations/{domain}/{org.id}/members/import/',
                             {'file': sheet(rows), 'dry_run': 'true' if dry_run else 'false'}, format='multipart')
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def test_new_members_are_recorded_for_both_kinds(self):
        for domain, cfg in DOMAINS.items():
            org = make_org(domain)
            people = [make_person(domain), make_person(domain)]
            self.run_import(domain, org, people)
            batch = ImportBatch.objects.get(import_type=f'{domain}_org_members')
            self.assertEqual(batch.label, org.name)
            items = ImportBatchItem.objects.filter(batch=batch)
            self.assertEqual({i.model_label for i in items}, {cfg['member']._meta.label_lower}, domain)
            self.assertEqual({i.object_id for i in items}, set(cfg['member'].objects.filter(organization=org).values_list('id', flat=True)))
            self.assertEqual(batch.row_count, 2)

    def test_a_preview_leaves_no_batch(self):
        for domain in DOMAINS:
            self.run_import(domain, make_org(domain), [make_person(domain)], dry_run=True)
        self.assertEqual(ImportBatch.objects.count(), 0)

    def test_an_import_that_adds_nobody_leaves_no_batch(self):
        org, person = make_org('farmers'), None
        person = make_person('farmers')
        add_member('farmers', org, person)
        self.run_import('farmers', org, [person])             # already a member: nothing is added
        self.assertEqual(ImportBatch.objects.count(), 0)

    def test_undo_removes_the_new_members_and_leaves_other_memberships_alone(self):
        for domain, cfg in DOMAINS.items():
            first_org, second_org = make_org(domain), make_org(domain)
            person = make_person(domain)
            existing = add_member(domain, first_org, person, is_main=True)
            self.run_import(domain, second_org, [person, make_person(domain)])
            batch = ImportBatch.objects.get(import_type=f'{domain}_org_members')
            self.assertEqual([r['result'] for r in self.undo_all(batch)], ['removed', 'removed'], domain)
            self.assertFalse(cfg['member'].objects.filter(organization=second_org).exists(), domain)
            existing.refresh_from_db()
            self.assertTrue(existing.is_main and existing.is_active, domain)

    def test_an_edited_member_is_kept(self):
        org, person = make_org('farmers'), make_person('farmers')
        self.run_import('farmers', org, [person])
        batch = ImportBatch.objects.get(import_type='farmers_org_members')
        DOMAINS['farmers']['member'].objects.filter(organization=org).update(position='Treasurer')
        results = self.undo_all(batch)
        self.assertEqual((results[0]['result'], results[0]['reason']), ('kept', 'Edited since the import.'))


class EquipmentImportUndoTests(_ImportUndoBase):
    def run_import(self, domain, org, rows, dry_run=False):
        r = self.client.post(f'/api/organizations/{domain}/{org.id}/equipment/import/',
                             {'file': sheet(rows, EQUIPMENT_HEADERS, 'equipment.xlsx'), 'dry_run': 'true' if dry_run else 'false'},
                             format='multipart')
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def rows(self, domain):
        return [[KNOWN[domain], 2, 'Good', TODAY, ''], [KNOWN[domain], 1, 'Broken', TODAY, 'second line']]

    def test_new_equipment_lines_are_recorded_for_both_kinds(self):
        for domain in DOMAINS:
            org = make_org(domain)
            self.run_import(domain, org, self.rows(domain))
            batch = ImportBatch.objects.get(import_type=f'{domain}_org_equipment')
            model = equipment_model(domain)
            self.assertEqual(batch.label, org.name)
            self.assertEqual({i.object_id for i in batch.items.all()}, set(model.objects.filter(organization=org).values_list('id', flat=True)), domain)
            self.assertEqual({i.model_label for i in batch.items.all()}, {model._meta.label_lower})

    def test_a_preview_leaves_no_batch(self):
        for domain in DOMAINS:
            self.run_import(domain, make_org(domain), self.rows(domain), dry_run=True)
        self.assertEqual(ImportBatch.objects.count(), 0)

    def test_undo_removes_untouched_lines(self):
        for domain in DOMAINS:
            org = make_org(domain)
            self.run_import(domain, org, self.rows(domain))
            batch = ImportBatch.objects.get(import_type=f'{domain}_org_equipment')
            self.assertEqual([r['result'] for r in self.undo_all(batch)], ['removed', 'removed'], domain)
            self.assertFalse(equipment_model(domain).objects.filter(organization=org).exists(), domain)

    def test_an_edited_line_is_kept(self):
        org = make_org('farmers')
        self.run_import('farmers', org, self.rows('farmers'))
        batch = ImportBatch.objects.get(import_type='farmers_org_equipment')
        first = equipment_model('farmers').objects.filter(organization=org).order_by('id').first()
        equipment_model('farmers').objects.filter(pk=first.pk).update(quantity=9)
        results = self.undo_all(batch)
        self.assertEqual(sorted(r['result'] for r in results), ['kept', 'removed'])
        self.assertEqual(list(equipment_model('farmers').objects.filter(organization=org).values_list('id', flat=True)), [first.pk])
