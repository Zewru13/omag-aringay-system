"""The undo engine: build a plan (what would be removed, what is kept and why), then execute it in slices. FarmVisit
stands in for an imported record; a Farmer with visits stands in for "a record other records depend on"."""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase

from core import import_undo
from core.import_batches import record_created, record_restore, start_batch
from core.import_undo import build_plan, execute_items, register_cleanup
from core.models import ImportBatch, ImportBatchItem
from farmers.models import Farmer
from monitoring.models import FarmVisit

User = get_user_model()


class ImportUndoEngineTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username='iu-admin', password='pw', role='ADMIN', email='iu@x.test')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-960001', first_name='Undo', last_name='Farmer', gender='Male',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')

    def setUp(self):
        self.batch = start_batch('crop_records', self.user, label='sample')

    def visit(self, purpose='x'):
        v = FarmVisit.objects.create(farmer=self.farmer, visit_date=date(2026, 5, 1), purpose=purpose)
        record_created(self.batch, v)
        return v

    def ids(self):
        return list(ImportBatchItem.objects.filter(batch=self.batch).values_list('id', flat=True))

    def test_untouched_rows_are_removed(self):
        a, b = self.visit('a'), self.visit('b')
        results = execute_items(self.batch, self.ids(), self.user)
        self.assertEqual([r['result'] for r in results], ['removed', 'removed'])
        self.assertFalse(FarmVisit.objects.filter(pk__in=[a.pk, b.pk]).exists())

    def test_an_edited_row_is_kept_with_the_reason(self):
        v = self.visit('before')
        FarmVisit.objects.filter(pk=v.pk).update(purpose='changed by staff')
        plan = build_plan(self.batch)
        self.assertEqual([(p.can_undo, p.reason) for p in plan], [(False, 'Edited since the import.')])
        results = execute_items(self.batch, self.ids(), self.user)
        self.assertEqual((results[0]['result'], results[0]['reason']), ('kept', 'Edited since the import.'))
        self.assertTrue(FarmVisit.objects.filter(pk=v.pk).exists())

    def test_a_row_with_dependents_is_kept(self):
        record_created(self.batch, self.farmer)
        FarmVisit.objects.create(farmer=self.farmer, visit_date=date(2026, 5, 2), purpose='depends')
        results = execute_items(self.batch, self.ids(), self.user)
        self.assertEqual((results[0]['result'], results[0]['reason']), ('kept', 'Other records depend on it.'))
        self.assertTrue(Farmer.objects.filter(pk=self.farmer.pk).exists())

    def test_a_missing_row_is_skipped_as_already_removed(self):
        v = self.visit()
        v.delete()
        results = execute_items(self.batch, self.ids(), self.user)
        self.assertEqual((results[0]['result'], results[0]['reason']), ('skipped', 'Already removed.'))

    def test_undo_twice_changes_nothing_more(self):
        self.visit()
        first = execute_items(self.batch, self.ids(), self.user)
        second = execute_items(self.batch, self.ids(), self.user)
        self.assertEqual(first[0]['result'], 'removed')
        self.assertEqual(second[0]['result'], 'skipped')

    def test_resuming_after_a_partial_run_finishes_the_rest(self):
        for n in range(4):
            self.visit(f'v{n}')
        ids = self.ids()
        execute_items(self.batch, ids[:2], self.user)
        self.assertEqual(FarmVisit.objects.count(), 2)
        execute_items(self.batch, ids, self.user)
        self.assertEqual(FarmVisit.objects.count(), 0)

    def test_build_plan_never_writes(self):
        self.visit()
        before = (FarmVisit.objects.count(), ImportBatchItem.objects.filter(undone_at__isnull=False).count())
        build_plan(self.batch)
        after = (FarmVisit.objects.count(), ImportBatchItem.objects.filter(undone_at__isnull=False).count())
        self.assertEqual(before, after)

    def test_restore_item_reverts_only_when_unchanged(self):
        v = FarmVisit.objects.create(farmer=self.farmer, visit_date=date(2026, 5, 1), purpose='new text')
        record_restore(self.batch, v, 'purpose', 'old text', 'new text')
        results = execute_items(self.batch, self.ids(), self.user)
        self.assertEqual(results[0]['result'], 'restored')
        v.refresh_from_db()
        self.assertEqual(v.purpose, 'old text')

    def test_a_restore_item_is_left_alone_if_someone_changed_the_value_since(self):
        v = FarmVisit.objects.create(farmer=self.farmer, visit_date=date(2026, 5, 1), purpose='edited later')
        record_restore(self.batch, v, 'purpose', 'old text', 'new text')
        results = execute_items(self.batch, self.ids(), self.user)
        self.assertEqual((results[0]['result'], results[0]['reason']), ('kept', 'Changed since the import.'))
        v.refresh_from_db()
        self.assertEqual(v.purpose, 'edited later')

    def test_a_cleanup_check_can_keep_a_record(self):
        v = self.visit()
        register_cleanup('monitoring.farmvisit', check=lambda obj: 'Its login was already used.')
        try:
            results = execute_items(self.batch, self.ids(), self.user)
        finally:
            import_undo.CLEANUPS.pop('monitoring.farmvisit', None)
        self.assertEqual((results[0]['result'], results[0]['reason']), ('kept', 'Its login was already used.'))
        self.assertTrue(FarmVisit.objects.filter(pk=v.pk).exists())

    def test_a_cleanup_before_delete_runs_only_when_the_record_goes(self):
        self.visit()
        seen = []
        register_cleanup('monitoring.farmvisit', check=lambda obj: None, before_delete=lambda obj, user: seen.append(obj.pk))
        try:
            execute_items(self.batch, self.ids(), self.user)
        finally:
            import_undo.CLEANUPS.pop('monitoring.farmvisit', None)
        self.assertEqual(len(seen), 1)

    def test_the_batch_is_marked_undone_only_when_nothing_is_pending(self):
        a = self.visit('a')
        FarmVisit.objects.filter(pk=a.pk).update(purpose='edited')   # will be kept
        self.visit('b')                                              # will go
        execute_items(self.batch, self.ids(), self.user)
        self.batch.refresh_from_db()
        self.assertIsNotNone(self.batch.undone_at)                   # everything is resolved: one removed, one kept
        self.assertEqual(self.batch.undone_by, self.user)

    def test_a_batch_whose_rows_were_all_kept_is_not_marked_undone(self):
        a = self.visit('a')
        FarmVisit.objects.filter(pk=a.pk).update(purpose='edited')
        execute_items(self.batch, self.ids(), self.user)
        self.batch.refresh_from_db()
        self.assertIsNone(self.batch.undone_at)

    def test_ids_from_another_batch_are_ignored(self):
        other = start_batch('stocking', self.user)
        v = FarmVisit.objects.create(farmer=self.farmer, visit_date=date(2026, 5, 3), purpose='other batch')
        record_created(other, v)
        foreign = list(ImportBatchItem.objects.filter(batch=other).values_list('id', flat=True))
        self.assertEqual(execute_items(self.batch, foreign, self.user), [])
        self.assertTrue(FarmVisit.objects.filter(pk=v.pk).exists())

    def test_a_record_that_other_records_protect_counts_as_having_dependents(self):
        from unittest import mock

        from django.db.models import ProtectedError
        v = self.visit()
        protector = FarmVisit.objects.create(farmer=self.farmer, visit_date=date(2026, 5, 4), purpose='protects')
        with mock.patch('core.import_undo.Collector') as collector:
            collector.return_value.collect.side_effect = ProtectedError('protected', [protector])
            results = execute_items(self.batch, self.ids(), self.user)
        self.assertEqual((results[0]['result'], results[0]['reason']), ('kept', 'Other records depend on it.'))
        self.assertTrue(FarmVisit.objects.filter(pk=v.pk).exists())
