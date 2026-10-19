"""The organization imports (farmers and fisherfolk) can be undone. An organization goes only if nobody has touched it,
nothing depends on it, and the login the import made for it was never used."""
from datetime import date

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User, UserLinkedRecord
from associations.models import FarmersOrganization, FarmersOrganizationEquipment, FisherfolkOrganization
from associations.test_org_activation import MAIL, import_row, linked_user, workbook
from core.models import ImportBatch, ImportBatchItem

BATCHES = '/api/imports/batches/'
KINDS = {
    'farmers': ('farmers_org', FarmersOrganization, 'associations.farmersorganization', 'FARMERS_ORG'),
    'fisherfolk': ('fisherfolk_org', FisherfolkOrganization, 'associations.fisherfolkorganization', 'FISHERFOLK_ORG'),
}


@override_settings(**MAIL)
class OrgImportUndoTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user(
            username='oi-staff', password='pw', role='ADMIN', email='oi-staff@x.test')

    def setUp(self):
        cache.clear()
        self.client.force_authenticate(self.staff)

    def run_import(self, kind, regs=('UNDO-A1', 'UNDO-A2'), dry_run=False):
        rows = [import_row(reg, f'{reg.lower()}@example.test') for reg in regs]
        data = {'file': workbook(rows)}
        if dry_run:
            data['dry_run'] = 'true'
        r = self.client.post(f'/api/organizations/{kind}/import/', data, format='multipart')
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def undo_all(self, batch):
        ids = list(batch.items.values_list('id', flat=True))
        return self.client.post(f'{BATCHES}{batch.id}/undo/', {'item_ids': ids}, format='json').json()['results']

    def test_each_created_organization_is_recorded_for_both_kinds(self):
        for kind, (import_type, model, label, _link) in KINDS.items():
            self.run_import(kind, regs=(f'{kind[:3].upper()}-R1', f'{kind[:3].upper()}-R2'))
            batch = ImportBatch.objects.get(import_type=import_type)
            items = ImportBatchItem.objects.filter(batch=batch)
            self.assertEqual({i.model_label for i in items}, {label})
            self.assertEqual({i.object_id for i in items}, set(model.objects.values_list('id', flat=True)), kind)
            self.assertEqual((batch.row_count, batch.performed_by), (2, self.staff))

    def test_a_preview_leaves_no_batch(self):
        for kind in KINDS:
            self.run_import(kind, dry_run=True)
        self.assertEqual(ImportBatch.objects.count(), 0)

    def test_an_import_that_creates_nothing_leaves_no_batch(self):
        self.run_import('farmers', regs=('SAME-1',))
        ImportBatch.objects.all().delete()
        self.run_import('farmers', regs=('SAME-1',))          # a duplicate: nothing is created
        self.assertEqual(ImportBatch.objects.count(), 0)

    def test_undo_removes_the_organization_and_its_unused_login(self):
        for kind, (import_type, model, _label, link) in KINDS.items():
            self.run_import(kind, regs=(f'{kind[:3].upper()}-U1', f'{kind[:3].upper()}-U2'))
            batch = ImportBatch.objects.get(import_type=import_type)
            org = model.objects.order_by('id').first()
            login = linked_user(getattr(User.LinkedRecordType, link), org)
            self.assertTrue(login.is_active)                  # the import activated it and emailed the password
            results = self.undo_all(batch)
            self.assertEqual([r['result'] for r in results], ['removed', 'removed'], kind)
            self.assertEqual(model.objects.count(), 0, kind)
            self.assertFalse(User.objects.filter(pk=login.pk).exists(), kind)
            self.assertFalse(UserLinkedRecord.objects.filter(user_id=login.pk).exists(), kind)

    def test_an_organization_whose_login_was_used_is_kept_with_its_login(self):
        self.run_import('farmers', regs=('USED-1', 'USED-2'))
        batch = ImportBatch.objects.get(import_type='farmers_org')
        used = FarmersOrganization.objects.get(registration_number='USED-1')
        login = linked_user(User.LinkedRecordType.FARMERS_ORG, used)
        User.objects.filter(pk=login.pk).update(last_login=timezone.now())
        plan = self.client.get(f'{BATCHES}{batch.id}/undo-plan/').json()
        self.assertEqual((plan['can_undo'], plan['kept']), (1, 1))
        results = self.undo_all(batch)
        self.assertEqual(sorted(r['result'] for r in results), ['kept', 'removed'])
        self.assertEqual(list(FarmersOrganization.objects.values_list('registration_number', flat=True)), ['USED-1'])
        self.assertTrue(User.objects.filter(pk=login.pk).exists())

    def test_an_organization_with_equipment_is_kept(self):
        self.run_import('farmers', regs=('EQ-1',))
        batch = ImportBatch.objects.get(import_type='farmers_org')
        org = FarmersOrganization.objects.get()
        FarmersOrganizationEquipment.objects.create(
            organization=org, equipment_name='Generator', condition='Good', quantity=1, acquisition_date=date(2025, 1, 1))
        results = self.undo_all(batch)
        self.assertEqual((results[0]['result'], results[0]['reason']), ('kept', 'Other records depend on it.'))
        self.assertTrue(FarmersOrganization.objects.filter(pk=org.pk).exists())

    def test_an_edited_organization_is_kept(self):
        self.run_import('fisherfolk', regs=('ED-1',))
        batch = ImportBatch.objects.get(import_type='fisherfolk_org')
        org = FisherfolkOrganization.objects.get()
        FisherfolkOrganization.objects.filter(pk=org.pk).update(contact_person='Someone New')
        results = self.undo_all(batch)
        self.assertEqual((results[0]['result'], results[0]['reason']), ('kept', 'Edited since the import.'))
