"""The crop records import can be undone: a commit remembers the records it added; undo removes the ones nobody has
touched and keeps the rest, with the reason."""
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from core.models import ImportBatch, ImportBatchItem
from farmers.models import Farmer
from farmers.test_no_dual_registration import registry_row, workbook
from production.models import CropMonitoringRecord, CropRemark, CropType

User = get_user_model()
COMMIT = '/api/production/crop-record-import/commit/'
PREVIEW = '/api/production/crop-record-import/preview/'
BATCHES = '/api/imports/batches/'


class CropImportUndoTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='ci-admin', password='pw', role='ADMIN', email='ci@x.test')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-940001', first_name='Crop', last_name='Importer', gender='Male',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        cls.corn, _ = CropType.objects.get_or_create(name='Corn (Mais)', defaults=dict(days_to_harvest=100))

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def rows(self, n=2):
        return [{
            'row_number': 2 + i, 'status': 'ready', 'farmer_id': self.farmer.id, 'crop_type_id': self.corn.id,
            'variety_used': f'Variety {i}', 'date_planted': f'2026-0{3 + i}-01', 'area_planted_ha': 1.5,
            'season': 'Dry', 'year': 2026, 'farm_location_barangay': 'Alaska',
        } for i in range(n)]

    def commit(self, n=2):
        r = self.client.post(COMMIT, {'rows': self.rows(n)}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        return ImportBatch.objects.get(import_type='crop_records')

    def test_a_commit_records_one_batch_with_every_created_record(self):
        batch = self.commit(2)
        items = list(ImportBatchItem.objects.filter(batch=batch))
        self.assertEqual(len(items), 2)
        self.assertEqual({i.model_label for i in items}, {'production.cropmonitoringrecord'})
        self.assertEqual({i.object_id for i in items}, set(CropMonitoringRecord.objects.values_list('id', flat=True)))
        self.assertEqual((batch.row_count, batch.performed_by), (2, self.admin))

    def test_a_preview_leaves_no_batch(self):
        r = self.client.post(PREVIEW, {'file': workbook([registry_row(self.farmer.rsbsa_number)])}, format='multipart')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(ImportBatch.objects.count(), 0)

    def test_a_refused_commit_leaves_no_batch(self):
        bad = self.rows(1)
        bad[0]['status'] = 'invalid'
        r = self.client.post(COMMIT, {'rows': bad}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(ImportBatch.objects.count(), 0)

    def test_undoing_removes_the_untouched_records(self):
        batch = self.commit(2)
        ids = list(batch.items.values_list('id', flat=True))
        plan = self.client.get(f'{BATCHES}{batch.id}/undo-plan/').json()
        self.assertEqual((plan['can_undo'], plan['kept']), (2, 0))
        r = self.client.post(f'{BATCHES}{batch.id}/undo/', {'item_ids': ids}, format='json')
        self.assertEqual([x['result'] for x in r.json()['results']], ['removed', 'removed'])
        self.assertEqual(CropMonitoringRecord.objects.count(), 0)

    def test_an_edited_record_is_kept(self):
        batch = self.commit(2)
        first = CropMonitoringRecord.objects.order_by('id').first()
        CropMonitoringRecord.objects.filter(pk=first.pk).update(notes='staff added a note')
        plan = self.client.get(f'{BATCHES}{batch.id}/undo-plan/').json()
        self.assertEqual((plan['can_undo'], plan['kept']), (1, 1))
        self.client.post(f'{BATCHES}{batch.id}/undo/', {'item_ids': list(batch.items.values_list('id', flat=True))}, format='json')
        self.assertEqual(list(CropMonitoringRecord.objects.values_list('id', flat=True)), [first.pk])

    def test_a_record_with_a_remark_is_kept(self):
        batch = self.commit(1)
        rec = CropMonitoringRecord.objects.get()
        CropRemark.objects.create(crop_type=self.corn, monitoring_record=rec, remark_text='a field note')
        r = self.client.post(f'{BATCHES}{batch.id}/undo/', {'item_ids': list(batch.items.values_list('id', flat=True))}, format='json')
        self.assertEqual(r.json()['results'][0]['result'], 'kept')
        self.assertTrue(CropMonitoringRecord.objects.filter(pk=rec.pk).exists())

    def test_a_record_the_import_marked_harvested_is_still_undoable(self):
        # An estimated planting date in the past makes the import save the record a second time (Harvested); the
        # fingerprint is taken after that, so it must not count as "edited since the import".
        past = self.rows(1)
        past[0]['date_planted'] = '2025-01-01'
        self.client.post(COMMIT, {'rows': past}, format='json')
        batch = ImportBatch.objects.get(import_type='crop_records')
        self.assertEqual(CropMonitoringRecord.objects.get().status, 'Harvested')
        plan = self.client.get(f'{BATCHES}{batch.id}/undo-plan/').json()
        self.assertEqual((plan['can_undo'], plan['kept']), (1, 0))
