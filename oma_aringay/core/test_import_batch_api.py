"""The endpoints behind every "Undo a recent import" panel: list recent batches of one import type, preview what an
undo would do, and run it. Admin and Evaluator only."""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from core.import_batches import record_created, start_batch
from core.models import ImportBatch
from farmers.models import Farmer
from monitoring.models import FarmVisit

User = get_user_model()
LIST = '/api/imports/batches/'


class ImportBatchApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='ia-admin', password='pw', role='ADMIN', email='iaa@x.test')
        cls.evaluator = User.objects.create_user(username='ia-eval', password='pw', role='EVALUATOR', email='iae@x.test')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-950001', first_name='Api', last_name='Farmer', gender='Male',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        cls.citizen = User.objects.create_user(username='ia-cit', password='pw', role='CITIZEN', email='iac@x.test')
        UserLinkedRecord.objects.create(
            user=cls.citizen, record_type=User.LinkedRecordType.FARMER, record_id=cls.farmer.id, is_active=True)

    def make_batch(self, import_type='crop_records', rows=2, user=None, label='sample file'):
        batch = start_batch(import_type, user or self.admin, label=label)
        for n in range(rows):
            v = FarmVisit.objects.create(farmer=self.farmer, visit_date=date(2026, 5, 1), purpose=f'row {n}')
            record_created(batch, v)
        return batch

    def test_only_staff_can_use_the_endpoints(self):
        batch = self.make_batch()
        self.assertIn(self.client.get(LIST, {'type': 'crop_records'}).status_code, (401, 403))
        self.client.force_authenticate(self.citizen)
        for method, url in (('get', f'{LIST}?type=crop_records'), ('get', f'{LIST}{batch.id}/undo-plan/'), ('post', f'{LIST}{batch.id}/undo/')):
            self.assertEqual(getattr(self.client, method)(url).status_code, 403, url)

    def test_the_list_shows_one_types_recent_batches_newest_first(self):
        old = self.make_batch(label='old one')
        ImportBatch.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=5))
        new = self.make_batch(label='new one', user=self.evaluator)
        self.make_batch('stocking', label='another type')
        too_old = self.make_batch(label='too old')
        ImportBatch.objects.filter(pk=too_old.pk).update(created_at=timezone.now() - timedelta(days=31))
        self.client.force_authenticate(self.admin)
        r = self.client.get(LIST, {'type': 'crop_records'})
        self.assertEqual(r.status_code, 200, r.content)
        rows = r.json()['batches']
        self.assertEqual([b['label'] for b in rows], ['new one', 'old one'])
        self.assertEqual(rows[0]['id'], str(new.id))
        self.assertEqual((rows[0]['row_count'], rows[0]['undone']), (2, False))
        self.assertTrue(rows[0]['performed_by_name'])

    def test_the_list_needs_a_known_type(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(LIST).status_code, 400)
        self.assertEqual(self.client.get(LIST, {'type': 'nope'}).status_code, 400)

    def test_the_plan_says_what_would_happen_and_changes_nothing(self):
        batch = self.make_batch(rows=2)
        v = FarmVisit.objects.filter(purpose='row 0').first()
        FarmVisit.objects.filter(pk=v.pk).update(purpose='edited')
        self.client.force_authenticate(self.evaluator)
        r = self.client.get(f'{LIST}{batch.id}/undo-plan/')
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual((body['can_undo'], body['kept']), (1, 1))
        self.assertEqual({i['reason'] for i in body['items'] if not i['can_undo']}, {'Edited since the import.'})
        self.assertEqual(FarmVisit.objects.count(), 2)

    def test_undo_removes_untouched_rows_and_reports_each(self):
        batch = self.make_batch(rows=3)
        ids = list(batch.items.values_list('id', flat=True))
        self.client.force_authenticate(self.admin)
        r = self.client.post(f'{LIST}{batch.id}/undo/', {'item_ids': ids}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual([x['result'] for x in r.json()['results']], ['removed'] * 3)
        self.assertEqual(FarmVisit.objects.count(), 0)
        batch.refresh_from_db()
        self.assertIsNotNone(batch.undone_at)
        listed = self.client.get(LIST, {'type': 'crop_records'}).json()['batches'][0]
        self.assertTrue(listed['undone'])

    def test_more_than_100_ids_is_refused(self):
        batch = self.make_batch(rows=1)
        self.client.force_authenticate(self.admin)
        r = self.client.post(f'{LIST}{batch.id}/undo/', {'item_ids': list(range(1, 102))}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_item_ids_must_be_a_list_of_whole_numbers(self):
        batch = self.make_batch(rows=1)
        self.client.force_authenticate(self.admin)
        for bad in (None, 'abc', [], ['x'], [1, None], {'a': 1}):
            r = self.client.post(f'{LIST}{batch.id}/undo/', {'item_ids': bad}, format='json')
            self.assertEqual(r.status_code, 400, bad)

    def test_an_unknown_batch_is_a_404(self):
        self.client.force_authenticate(self.admin)
        missing = '00000000-0000-0000-0000-000000000000'
        self.assertEqual(self.client.get(f'{LIST}{missing}/undo-plan/').status_code, 404)
        self.assertEqual(self.client.post(f'{LIST}{missing}/undo/', {'item_ids': [1]}, format='json').status_code, 404)
