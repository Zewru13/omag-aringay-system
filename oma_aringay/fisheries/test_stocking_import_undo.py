"""The stocking import can be undone: a commit remembers the stocking records it added; undo removes the untouched ones
and keeps any that have logs or have been edited."""
import io
from datetime import date

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook
from rest_framework.test import APITestCase

from core.models import ImportBatch, ImportBatchItem
from fisheries.models import Fisherfolk, SpeciesCategory, SpeciesOption, StockingRecord
from fisheries.views import STOCKING_TEMPLATE_HEADERS

IMPORT = '/api/fisheries/stocking/forecasting/import/'
BATCHES = '/api/imports/batches/'


def workbook(rows):
    book = Workbook()
    sheet = book.active
    sheet.append(STOCKING_TEMPLATE_HEADERS)
    for row in rows:
        sheet.append(row)
    stream = io.BytesIO()
    book.save(stream)
    return SimpleUploadedFile('stocking.xlsx', stream.getvalue(),
                              content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


class StockingImportUndoTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user(
            username='si-staff', password='pw', role='ADMIN', email='si-staff@x.test')
        category, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        cls.species, _ = SpeciesOption.objects.get_or_create(species_name='Tilapia', defaults=dict(
            category=category, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct=80, default_avg_body_weight_kg='0.25'))
        cls.fisher = Fisherfolk.objects.create(
            rsbsa_number='01-033-02-019-910001', first_name='Stock', last_name='Importer', gender='Male',
            birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')

    def setUp(self):
        self.client.force_authenticate(self.staff)

    def rows(self):
        return [[self.fisher.rsbsa_number, 'Tilapia', '2026-03-01', 500, 'Pond'],
                [self.fisher.rsbsa_number, 'Tilapia', '2026-04-01', 700, 'Cage']]

    def run_import(self, dry_run=False):
        data = {'file': workbook(self.rows())}
        if dry_run:
            data['dry_run'] = 'true'
        r = self.client.post(IMPORT, data, format='multipart')
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def undo_all(self, batch):
        ids = list(batch.items.values_list('id', flat=True))
        return self.client.post(f'{BATCHES}{batch.id}/undo/', {'item_ids': ids}, format='json').json()['results']

    def test_created_records_are_recorded(self):
        self.assertEqual(self.run_import()['created'], 2)
        batch = ImportBatch.objects.get(import_type='stocking')
        items = ImportBatchItem.objects.filter(batch=batch)
        self.assertEqual({i.model_label for i in items}, {'fisheries.stockingrecord'})
        self.assertEqual({i.object_id for i in items}, set(StockingRecord.objects.values_list('id', flat=True)))
        self.assertEqual((batch.row_count, batch.performed_by), (2, self.staff))

    def test_a_preview_leaves_no_batch(self):
        self.run_import(dry_run=True)
        self.assertEqual(ImportBatch.objects.count(), 0)

    def test_undo_removes_untouched_records(self):
        self.run_import()
        batch = ImportBatch.objects.get(import_type='stocking')
        plan = self.client.get(f'{BATCHES}{batch.id}/undo-plan/').json()
        self.assertEqual((plan['can_undo'], plan['kept']), (2, 0))
        self.assertEqual([r['result'] for r in self.undo_all(batch)], ['removed', 'removed'])
        self.assertEqual(StockingRecord.objects.count(), 0)

    def test_an_edited_record_is_kept(self):
        self.run_import()
        batch = ImportBatch.objects.get(import_type='stocking')
        first = StockingRecord.objects.order_by('id').first()
        StockingRecord.objects.filter(pk=first.pk).update(number_of_fingerlings=999)
        results = self.undo_all(batch)
        self.assertEqual(sorted(r['result'] for r in results), ['kept', 'removed'])
        self.assertEqual(list(StockingRecord.objects.values_list('id', flat=True)), [first.pk])

    def test_a_record_with_a_log_is_kept(self):
        from fisheries.models import FisheriesActivityLog
        self.run_import()
        batch = ImportBatch.objects.get(import_type='stocking')
        first = StockingRecord.objects.order_by('id').first()
        FisheriesActivityLog.objects.create(stocking_record=first, activity='Feeding', date_of_activity=date(2026, 3, 5))
        results = self.undo_all(batch)
        self.assertEqual(sorted(r['result'] for r in results), ['kept', 'removed'])
        self.assertTrue(StockingRecord.objects.filter(pk=first.pk).exists())
