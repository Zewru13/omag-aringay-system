"""Aquaculture production cycle: Ownership (Tenant / Lease / Owner, with the owner's details for the first two) and the PCIC insurance of
the cycle (read from, and edited on, its linked stocking record, form photo included)."""
import io
import tempfile
from datetime import date

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image

from accounts.models import UserLinkedRecord
from fisheries.models import StockingRecord
from monitoring.models import AquacultureProductionCycle
from monitoring.tests import ProductionCycleBase

STOCKING = '/api/fisheries/stocking/'
LOCAL_FILES = override_settings(
    STORAGES={'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
              'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}},
    MEDIA_ROOT=tempfile.mkdtemp(prefix='oma_ownership_pcic_'),
)


def image(name='pcic.png'):
    buf = io.BytesIO()
    Image.new('RGB', (40, 30), (30, 120, 60)).save(buf, format='PNG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/png')


class OwnershipTests(ProductionCycleBase):
    def detail(self, cycle_id):
        r = self.client.get(f'{self.CYCLES}{cycle_id}/')
        self.assertEqual(r.status_code, 200, r.data)
        return r.data

    def patch(self, cycle_id, body):
        return self.client.patch(f'{self.CYCLES}{cycle_id}/', body, format='json')

    def started(self, **over):
        r = self.post(**over)
        self.assertEqual(r.status_code, 201, r.data)
        return r.data

    # --- starting a cycle
    def test_a_tenant_cycle_keeps_the_owner_and_the_registration_number_with_its_leading_zeros(self):
        data = self.started(ownership='Tenant', owner_name='  Rosa Dela Cruz ', owner_registration_number='0012-0345')
        saved = self.detail(data['id'])
        self.assertEqual((saved['ownership'], saved['owner_name'], saved['owner_registration_number']), ('Tenant', 'Rosa Dela Cruz', '0012-0345'))
        self.assertEqual(AquacultureProductionCycle.objects.get(pk=data['id']).owner_registration_number, '0012-0345')

    def test_a_lease_cycle_keeps_them_too(self):
        data = self.started(ownership='Lease', owner_name='Pedro Reyes', owner_registration_number='000123')
        self.assertEqual((data['ownership'], data['owner_name'], data['owner_registration_number']), ('Lease', 'Pedro Reyes', '000123'))

    def test_an_owner_cycle_needs_nothing_more_and_drops_any_owner_details_sent_with_it(self):
        data = self.started(owner_name='Someone Else', owner_registration_number='99')
        self.assertEqual((data['ownership'], data['owner_name'], data['owner_registration_number']), ('Owner', '', ''))

    def test_ownership_is_required_and_only_the_three_choices_are_accepted(self):
        payload = self.payload()
        payload.pop('ownership', None)
        r = self.client.post(self.CYCLES, payload, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('ownership', r.data)
        for bad in ('Lessee', 'Other', 'tenant', ''):
            self.assertEqual(self.post(ownership=bad).status_code, 400, bad)
        self.assertEqual(AquacultureProductionCycle.objects.count(), 0)

    def test_tenant_and_lease_need_both_owner_fields(self):
        for ownership in ('Tenant', 'Lease'):
            r = self.post(ownership=ownership, owner_registration_number='001')
            self.assertEqual(r.status_code, 400, ownership)
            self.assertIn('owner_name', r.data)
            r = self.post(ownership=ownership, owner_name='Rosa')
            self.assertEqual(r.status_code, 400, ownership)
            self.assertIn('owner_registration_number', r.data)
            self.assertEqual(self.post(ownership=ownership, owner_name='   ', owner_registration_number='001').status_code, 400)
        self.assertEqual(AquacultureProductionCycle.objects.count(), 0)

    # --- editing
    def test_switching_between_tenant_and_lease_keeps_the_owner_details_and_owner_clears_them(self):
        cid = self.started(ownership='Tenant', owner_name='Rosa', owner_registration_number='0045')['id']
        r = self.patch(cid, {'ownership': 'Lease'})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual((r.data['ownership'], r.data['owner_name'], r.data['owner_registration_number']), ('Lease', 'Rosa', '0045'))
        r = self.patch(cid, {'ownership': 'Owner'})
        self.assertEqual((r.data['ownership'], r.data['owner_name'], r.data['owner_registration_number']), ('Owner', '', ''))
        self.assertEqual(self.detail(cid)['owner_name'], '')
        r = self.patch(cid, {'ownership': 'Tenant'})
        self.assertEqual(r.status_code, 400)       # the owner details were cleared, so they must be entered again
        self.assertIn('owner_name', r.data)
        self.assertEqual(self.patch(cid, {'ownership': 'Tenant', 'owner_name': 'Ana', 'owner_registration_number': '07'}).status_code, 200)

    def test_editing_something_else_never_touches_ownership(self):
        cid = self.started(ownership='Tenant', owner_name='Rosa', owner_registration_number='0045')['id']
        r = self.patch(cid, {'notes': 'checked the pond'})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual((r.data['ownership'], r.data['owner_name'], r.data['owner_registration_number'], r.data['notes']),
                         ('Tenant', 'Rosa', '0045', 'checked the pond'))

    def test_a_cycle_made_before_ownership_existed_still_works_and_reads_as_blank(self):
        cid = self.started()['id']
        AquacultureProductionCycle.objects.filter(pk=cid).update(ownership='', owner_name='', owner_registration_number='')
        legacy = self.detail(cid)
        self.assertEqual((legacy['ownership'], legacy['owner_name']), ('', ''))
        self.assertEqual(self.patch(cid, {'notes': 'still editable'}).status_code, 200)
        r = self.patch(cid, {'owner_name': 'No ownership chosen'})
        self.assertEqual(r.status_code, 400)
        self.assertIn('ownership', r.data)
        self.assertEqual(self.patch(cid, {'ownership': 'Owner'}).status_code, 200)

    # --- the Aquaculture Monitoring table's rows
    def test_each_stocking_row_carries_its_own_cycles_ownership(self):
        tenant = self.started(ownership='Tenant', owner_name='Rosa', owner_registration_number='0045')['id']
        owner = self.started(ownership='Owner')['id']
        rows = self.client.get(STOCKING, {'status': 'Stocked,Near Harvest,Harvested'}).data
        rows = rows['results'] if isinstance(rows, dict) else rows
        by_cycle = {r['production_cycle']: r for r in rows}
        self.assertEqual((by_cycle[tenant]['ownership'], by_cycle[tenant]['owner_name'], by_cycle[tenant]['owner_registration_number']),
                         ('Tenant', 'Rosa', '0045'))
        self.assertEqual(by_cycle[owner]['ownership'], 'Owner')
        self.assertEqual({r['fisherfolk'] for r in rows}, {self.ff_a.id})       # one fisherfolk, two different ownerships
        plain = StockingRecord.objects.create(fisherfolk=self.ff_a, species=self.species, date_stocked=date.today(), number_of_fingerlings=5, season='Wet', year=date.today().year)
        one = self.client.get(f'{STOCKING}{plain.id}/').data
        self.assertIsNone(one['ownership'])        # a stocking with no cycle has no ownership: the table shows "Not specified"


@LOCAL_FILES
class CyclePcicTests(ProductionCycleBase):
    def started(self, insured=False, **over):
        r = self.post(has_pcic_insurance=insured, **over)
        self.assertEqual(r.status_code, 201, r.data)
        return r.data

    def detail(self, cycle_id):
        return self.client.get(f'{self.CYCLES}{cycle_id}/').data

    def upload(self, cycle):
        return self.client.post(f'{STOCKING}{cycle["stocking_record_id"]}/pcic-form/', {'photo': image()}, format='multipart')

    def test_the_cycle_reads_the_insurance_of_its_stocking_record(self):
        insured, plain = self.started(True), self.started(False)
        self.assertTrue(self.detail(insured['id'])['has_pcic_insurance'])
        self.assertIsNone(self.detail(insured['id'])['pcic_form_photo'])        # insured, no document yet
        self.assertFalse(self.detail(plain['id'])['has_pcic_insurance'])
        self.assertTrue(StockingRecord.objects.get(production_cycle_id=insured['id']).has_pcic_insurance)

    def test_the_uploaded_document_comes_back_with_the_cycle(self):
        cycle = self.started(True)
        self.assertEqual(self.upload(cycle).status_code, 200)
        link = self.detail(cycle['id'])['pcic_form_photo']
        self.assertTrue(link and 'pcic_forms/stockingrecord/' in link, link)
        listed = self.client.get(self.CYCLES).data
        listed = listed['results'] if isinstance(listed, dict) else listed
        self.assertTrue(next(c for c in listed if c['id'] == cycle['id'])['pcic_form_photo'])

    def test_editing_something_else_keeps_the_insurance_and_the_document(self):
        cycle = self.started(True)
        self.upload(cycle)
        r = self.client.patch(f'{self.CYCLES}{cycle["id"]}/', {'notes': 'a note', 'status': 'Active'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        again = self.detail(cycle['id'])
        self.assertTrue(again['has_pcic_insurance'])
        self.assertTrue(again['pcic_form_photo'])

    def test_unticking_the_insurance_in_an_edit_removes_the_document_and_ticking_it_again_does_not_bring_it_back(self):
        cycle = self.started(True)
        self.upload(cycle)
        r = self.client.patch(f'{self.CYCLES}{cycle["id"]}/', {'has_pcic_insurance': False}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        record = StockingRecord.objects.get(production_cycle_id=cycle['id'])
        self.assertFalse(record.has_pcic_insurance)
        self.assertFalse(record.pcic_form_photo)
        self.assertIsNone(r.data['pcic_form_photo'])
        r = self.client.patch(f'{self.CYCLES}{cycle["id"]}/', {'has_pcic_insurance': True}, format='json')
        self.assertTrue(r.data['has_pcic_insurance'])
        self.assertIsNone(r.data['pcic_form_photo'])

    def test_ticking_the_insurance_in_an_edit_marks_the_stocking_record(self):
        cycle = self.started(False)
        r = self.client.patch(f'{self.CYCLES}{cycle["id"]}/', {'has_pcic_insurance': True}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(StockingRecord.objects.get(production_cycle_id=cycle['id']).has_pcic_insurance)

    def test_a_cycle_without_a_stocking_record_cannot_be_marked_insured(self):
        legacy = AquacultureProductionCycle.objects.create(
            fisherfolk=self.ff_a, cycle_name='Old', species_farmed='Tilapia', culture_system='Fishpond', stocking_date=date(2025, 1, 1))
        r = self.client.patch(f'{self.CYCLES}{legacy.id}/', {'has_pcic_insurance': True}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('has_pcic_insurance', r.data)
        data = self.detail(legacy.id)
        self.assertEqual((data['has_pcic_insurance'], data['pcic_form_photo'], data['stocking_record_id']), (False, None, None))

    def test_cycles_of_one_fisherfolk_have_their_own_insurance_in_the_table_rows(self):
        insured, plain = self.started(True), self.started(False)
        rows = self.client.get(STOCKING, {'status': 'Stocked,Near Harvest,Harvested'}).data
        rows = rows['results'] if isinstance(rows, dict) else rows
        by_cycle = {r['production_cycle']: r for r in rows}
        self.assertTrue(by_cycle[insured['id']]['has_pcic_insurance'])
        self.assertFalse(by_cycle[plain['id']]['has_pcic_insurance'])
        self.client.patch(f'{self.CYCLES}{plain["id"]}/', {'has_pcic_insurance': True}, format='json')
        self.client.patch(f'{self.CYCLES}{insured["id"]}/', {'has_pcic_insurance': False}, format='json')
        rows = self.client.get(STOCKING, {'status': 'Stocked,Near Harvest,Harvested'}).data
        rows = rows['results'] if isinstance(rows, dict) else rows
        by_cycle = {r['production_cycle']: r for r in rows}
        self.assertFalse(by_cycle[insured['id']]['has_pcic_insurance'])
        self.assertTrue(by_cycle[plain['id']]['has_pcic_insurance'])

    def test_another_fisherfolk_cannot_open_the_cycle_or_its_document(self):
        cycle = self.started(True)
        self.upload(cycle)
        User = get_user_model()
        other = User.objects.create_user(username='ff-b-user', password='pw', role='CITIZEN', email='ffb@x.test')
        UserLinkedRecord.objects.create(user=other, record_type=User.LinkedRecordType.FISHERFOLK, record_id=self.ff_b.id, is_active=True)
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(f'{self.CYCLES}{cycle["id"]}/').status_code, 404)
        self.assertEqual(self.client.post(f'{STOCKING}{cycle["stocking_record_id"]}/pcic-form/', {'photo': image()}, format='multipart').status_code, 404)
        owner = User.objects.create_user(username='ff-a-user', password='pw', role='CITIZEN', email='ffa@x.test')
        UserLinkedRecord.objects.create(user=owner, record_type=User.LinkedRecordType.FISHERFOLK, record_id=self.ff_a.id, is_active=True)
        self.client.force_authenticate(owner)
        self.assertEqual(self.client.get(f'{self.CYCLES}{cycle["id"]}/').status_code, 200)       # their own cycle
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(f'{self.CYCLES}{cycle["id"]}/').status_code, (401, 403))
