"""Import batches: what a committed import added is remembered so it can be undone. FarmVisit stands in for "a record an
import created" because it is small and has no side effects."""
from datetime import date

from django.contrib.auth import get_user_model
from django.db import transaction
from django.test import TestCase

from core.import_batches import IMPORT_TYPES, fingerprint, record_created, record_restore, start_batch
from core.models import ImportBatch, ImportBatchItem
from farmers.models import Farmer
from monitoring.models import FarmVisit

User = get_user_model()


def make_farmer(n=1):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-97%04d' % n, first_name='Batch', last_name=f'Farmer{n}', gender='Male',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')


class ImportBatchRecorderTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username='ib-admin', password='pw', role='ADMIN', email='ib@x.test')
        cls.farmer = make_farmer()

    def visit(self, purpose='x'):
        return FarmVisit.objects.create(farmer=self.farmer, visit_date=date(2026, 5, 1), purpose=purpose)

    def test_the_eleven_import_types_are_registered(self):
        self.assertEqual(set(IMPORT_TYPES), {
            'crop_records', 'farmers_org', 'fisherfolk_org', 'farmers_org_members', 'fisherfolk_org_members',
            'farmers_org_equipment', 'fisherfolk_org_equipment', 'crop_assistance', 'fisheries_assistance', 'stocking',
            'farm_parcels'})

    def test_start_batch_rejects_an_unknown_type(self):
        with self.assertRaises(ValueError):
            start_batch('not_an_import', self.user)

    def test_start_batch_records_who_and_what(self):
        batch = start_batch('crop_records', self.user, label='Sample file')
        self.assertEqual((batch.import_type, batch.performed_by, batch.label, batch.row_count), ('crop_records', self.user, 'Sample file', 0))
        self.assertIsNone(batch.undone_at)

    def test_record_created_stores_model_id_and_fingerprint(self):
        batch = start_batch('crop_records', self.user)
        v = self.visit()
        record_created(batch, v)
        item = ImportBatchItem.objects.get(batch=batch)
        self.assertEqual((item.model_label, item.object_id, item.action), ('monitoring.farmvisit', v.pk, 'CREATE'))
        self.assertEqual(item.fingerprint, fingerprint(v))
        batch.refresh_from_db()
        self.assertEqual(batch.row_count, 1)

    def test_fingerprint_changes_when_a_field_changes_and_ignores_auto_timestamps(self):
        v = self.visit()
        before = fingerprint(v)
        FarmVisit.objects.filter(pk=v.pk).update(date_recorded=date(2020, 1, 1))  # auto_now_add field
        v.refresh_from_db()
        self.assertEqual(fingerprint(v), before)
        v.purpose = 'changed'
        self.assertNotEqual(fingerprint(v), before)

    def test_record_restore_stores_old_and_new(self):
        batch = start_batch('farmers_org_members', self.user)
        v = self.visit()
        record_restore(batch, v, 'purpose', 'old text', 'new text')
        item = ImportBatchItem.objects.get(batch=batch)
        self.assertEqual((item.action, item.field_name, item.old_value, item.new_value), ('RESTORE', 'purpose', 'old text', 'new text'))
        batch.refresh_from_db()
        self.assertEqual(batch.row_count, 0)

    def test_a_rolled_back_transaction_leaves_no_batch(self):
        try:
            with transaction.atomic():
                batch = start_batch('stocking', self.user)
                record_created(batch, self.visit())
                raise RuntimeError('import failed')
        except RuntimeError:
            pass
        self.assertEqual(ImportBatch.objects.count(), 0)
        self.assertEqual(ImportBatchItem.objects.count(), 0)
