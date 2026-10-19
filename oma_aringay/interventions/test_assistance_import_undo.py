"""The crop and fisheries assistance imports can be undone. The import settles each record's status after saving it, so
the fingerprint must be taken after that: a freshly imported batch must read as untouched."""
import io
from datetime import date

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook
from rest_framework.test import APITestCase

from core.models import ImportBatch, ImportBatchItem
from farmers.models import Farmer
from fisheries.models import Fisherfolk
from interventions.models import BeneficiaryRecord, FisherfolkBeneficiaryRecord
from interventions.views import ASSISTANCE_TEMPLATE_HEADERS

BATCHES = '/api/imports/batches/'
DOMAINS = {
    'crop': dict(url='/api/interventions/beneficiaries/adhoc/import/', type='crop_assistance', model=BeneficiaryRecord,
                 label='interventions.beneficiaryrecord', id_label='Farmer RSBSA Number', assistance='Seeds'),
    'fisheries': dict(url='/api/interventions/fisherfolk-beneficiaries/adhoc/import/', type='fisheries_assistance',
                      model=FisherfolkBeneficiaryRecord, label='interventions.fisherfolkbeneficiaryrecord',
                      id_label='Fisherfolk RSBSA Number', assistance='Fingerlings/Seeds'),
}


def workbook(id_label, rows):
    book = Workbook()
    sheet = book.active
    sheet.append([id_label] + ASSISTANCE_TEMPLATE_HEADERS[1:])
    for row in rows:
        sheet.append(row)
    stream = io.BytesIO()
    book.save(stream)
    return SimpleUploadedFile('assistance.xlsx', stream.getvalue(),
                              content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


class AssistanceImportUndoTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user(
            username='ai-staff', password='pw', role='ADMIN', email='ai-staff@x.test')
        cls.people = {
            'crop': [Farmer.objects.create(
                rsbsa_number='01-033-02-019-93%04d' % n, first_name=f'Ana{n}', last_name='Assist', gender='Male',
                birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single') for n in (1, 2)],
            'fisheries': [Fisherfolk.objects.create(
                rsbsa_number='01-033-02-019-92%04d' % n, first_name=f'Ben{n}', last_name='Assist', gender='Male',
                birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland') for n in (1, 2)],
        }

    def setUp(self):
        self.client.force_authenticate(self.staff)

    def run_import(self, domain, dry_run=False):
        cfg = DOMAINS[domain]
        rows = [[p.rsbsa_number, cfg['assistance'], 'Department of Agriculture (DA)', '2 units', '2026-01-15', 'Dry', 'import test']
                for p in self.people[domain]]
        data = {'file': workbook(cfg['id_label'], rows)}
        if dry_run:
            data['dry_run'] = 'true'
        r = self.client.post(cfg['url'], data, format='multipart')
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def undo_all(self, batch):
        ids = list(batch.items.values_list('id', flat=True))
        return self.client.post(f'{BATCHES}{batch.id}/undo/', {'item_ids': ids}, format='json').json()['results']

    def test_each_created_record_is_recorded_for_both_domains(self):
        for domain, cfg in DOMAINS.items():
            result = self.run_import(domain)
            self.assertEqual(result['created'], 2, result)
            batch = ImportBatch.objects.get(import_type=cfg['type'])
            items = ImportBatchItem.objects.filter(batch=batch)
            self.assertEqual({i.model_label for i in items}, {cfg['label']})
            self.assertEqual({i.object_id for i in items}, set(cfg['model'].objects.values_list('id', flat=True)), domain)
            self.assertEqual((batch.row_count, batch.performed_by), (2, self.staff))

    def test_a_preview_leaves_no_batch(self):
        for domain in DOMAINS:
            self.run_import(domain, dry_run=True)
        self.assertEqual(ImportBatch.objects.count(), 0)

    def test_a_freshly_imported_batch_reads_as_untouched(self):
        # the import sets each record to Confirmed after saving it; that must not look like an edit
        for domain, cfg in DOMAINS.items():
            self.run_import(domain)
            batch = ImportBatch.objects.get(import_type=cfg['type'])
            plan = self.client.get(f'{BATCHES}{batch.id}/undo-plan/').json()
            self.assertEqual((plan['can_undo'], plan['kept']), (2, 0), domain)

    def test_undo_removes_untouched_records(self):
        for domain, cfg in DOMAINS.items():
            self.run_import(domain)
            batch = ImportBatch.objects.get(import_type=cfg['type'])
            self.assertEqual([r['result'] for r in self.undo_all(batch)], ['removed', 'removed'], domain)
            self.assertEqual(cfg['model'].objects.count(), 0, domain)

    def test_an_edited_record_is_kept(self):
        self.run_import('crop')
        batch = ImportBatch.objects.get(import_type='crop_assistance')
        first = BeneficiaryRecord.objects.order_by('id').first()
        BeneficiaryRecord.objects.filter(pk=first.pk).update(remarks='staff corrected this')
        results = self.undo_all(batch)
        self.assertEqual(sorted(r['result'] for r in results), ['kept', 'removed'])
        self.assertEqual(list(BeneficiaryRecord.objects.values_list('id', flat=True)), [first.pk])
