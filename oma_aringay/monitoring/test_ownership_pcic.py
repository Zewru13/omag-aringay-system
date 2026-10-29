"""Aquaculture production cycle: Ownership (Tenant / Lease / Owner, with the owner's details for a Tenant only) and PCIC insurance, which
is kept per pond/cage (form photo included); a cycle is insured when any of its ponds/cages is."""
import io
import tempfile
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image

from accounts.models import UserLinkedRecord
from fisheries.models import StockingRecord
from monitoring.models import AquacultureProductionCycle, AquacultureProductionUnit
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

    def test_a_lease_cycle_needs_no_owner_details_and_drops_any_sent_with_it(self):
        data = self.started(ownership='Lease')            # no owner fields at all
        self.assertEqual((data['ownership'], data['owner_name'], data['owner_registration_number']), ('Lease', '', ''))
        data = self.started(ownership='Lease', owner_name='Pedro Reyes', owner_registration_number='000123')
        self.assertEqual((data['ownership'], data['owner_name'], data['owner_registration_number']), ('Lease', '', ''))
        saved = AquacultureProductionCycle.objects.get(pk=data['id'])
        self.assertEqual((saved.owner_name, saved.owner_registration_number), ('', ''))

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

    def test_a_tenant_needs_both_owner_fields(self):
        r = self.post(ownership='Tenant', owner_registration_number='001')
        self.assertEqual(r.status_code, 400)
        self.assertIn('owner_name', r.data)
        r = self.post(ownership='Tenant', owner_name='Rosa')
        self.assertEqual(r.status_code, 400)
        self.assertIn('owner_registration_number', r.data)
        self.assertEqual(self.post(ownership='Tenant', owner_name='   ', owner_registration_number='001').status_code, 400)
        self.assertEqual(self.post(ownership='Tenant').status_code, 400)
        self.assertEqual(AquacultureProductionCycle.objects.count(), 0)

    # --- editing
    def test_switching_to_lease_or_owner_clears_the_owner_details_and_back_to_tenant_asks_again(self):
        cid = self.started(ownership='Tenant', owner_name='Rosa', owner_registration_number='0045')['id']
        r = self.patch(cid, {'ownership': 'Lease'})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual((r.data['ownership'], r.data['owner_name'], r.data['owner_registration_number']), ('Lease', '', ''))
        self.assertEqual(self.detail(cid)['owner_name'], '')
        r = self.patch(cid, {'ownership': 'Owner'})
        self.assertEqual((r.data['ownership'], r.data['owner_name'], r.data['owner_registration_number']), ('Owner', '', ''))
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


UNITS = '/api/monitoring/aquaculture-units/'


@LOCAL_FILES
class CyclePcicTests(ProductionCycleBase):
    """PCIC insurance is kept per pond/cage. A cycle counts as insured when any of its ponds/cages is."""

    def started(self, *insured):
        """Start a cycle whose ponds are insured or not as given (two ponds by default)."""
        flags = insured or (False, False)
        units = [{'length_m': 4 + n, 'width_m': 2, 'fingerling_count': 20 + n, 'has_pcic_insurance': flag} for n, flag in enumerate(flags)]
        r = self.post(units=units)
        self.assertEqual(r.status_code, 201, r.data)
        return r.data

    def detail(self, cycle_id):
        return self.client.get(f'{self.CYCLES}{cycle_id}/').data

    def upload(self, unit_id):
        return self.client.post(f'{UNITS}{unit_id}/pcic-form/', {'photo': image()}, format='multipart')

    def test_each_pond_keeps_its_own_insurance_and_the_cycle_is_insured_when_any_pond_is(self):
        cycle = self.started(True, False)
        data = self.detail(cycle['id'])
        self.assertEqual([u['has_pcic_insurance'] for u in data['units']], [True, False])
        self.assertTrue(data['has_pcic_insurance'])
        self.assertTrue(StockingRecord.objects.get(production_cycle_id=cycle['id']).has_pcic_insurance)
        plain = self.detail(self.started(False, False)['id'])
        self.assertEqual([u['has_pcic_insurance'] for u in plain['units']], [False, False])
        self.assertFalse(plain['has_pcic_insurance'])

    def test_the_uploaded_document_comes_back_with_its_pond_not_the_cycle(self):
        cycle = self.started(True, False)
        units = self.detail(cycle['id'])['units']
        self.assertEqual(self.upload(units[0]['id']).status_code, 200)
        data = self.detail(cycle['id'])
        link = data['units'][0]['pcic_form_photo']
        self.assertTrue(link and 'pcic_forms/aquacultureproductionunit/' in link, link)
        self.assertIsNone(data['units'][1]['pcic_form_photo'])
        self.assertIsNone(data['pcic_form_photo'])           # the documents are the ponds' own
        listed = self.client.get(self.CYCLES).data
        listed = listed['results'] if isinstance(listed, dict) else listed
        self.assertTrue(next(c for c in listed if c['id'] == cycle['id'])['units'][0]['pcic_form_photo'])

    def test_a_pond_that_is_not_insured_takes_no_document(self):
        cycle = self.started(True, False)
        units = self.detail(cycle['id'])['units']
        r = self.upload(units[1]['id'])
        self.assertEqual(r.status_code, 400)

    def test_ticking_a_pond_in_an_edit_marks_the_cycle_and_its_stocking_record(self):
        cycle = self.started(False, False)
        units = self.detail(cycle['id'])['units']
        r = self.client.patch(f'{UNITS}{units[1]["id"]}/', {'has_pcic_insurance': True}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data['has_pcic_insurance'])
        self.assertTrue(self.detail(cycle['id'])['has_pcic_insurance'])
        self.assertTrue(StockingRecord.objects.get(production_cycle_id=cycle['id']).has_pcic_insurance)

    def test_unticking_the_last_insured_pond_clears_the_cycle_and_removes_that_ponds_document(self):
        cycle = self.started(True, False)
        unit = self.detail(cycle['id'])['units'][0]
        self.upload(unit['id'])
        r = self.client.patch(f'{UNITS}{unit["id"]}/', {'has_pcic_insurance': False}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIsNone(r.data['pcic_form_photo'])
        self.assertFalse(AquacultureProductionUnit.objects.get(pk=unit['id']).pcic_form_photo)
        self.assertFalse(self.detail(cycle['id'])['has_pcic_insurance'])
        self.assertFalse(StockingRecord.objects.get(production_cycle_id=cycle['id']).has_pcic_insurance)

    def test_unticking_one_pond_keeps_the_cycle_insured_while_another_is(self):
        cycle = self.started(True, True)
        units = self.detail(cycle['id'])['units']
        self.client.patch(f'{UNITS}{units[0]["id"]}/', {'has_pcic_insurance': False}, format='json')
        data = self.detail(cycle['id'])
        self.assertEqual([u['has_pcic_insurance'] for u in data['units']], [False, True])
        self.assertTrue(data['has_pcic_insurance'])
        self.assertTrue(StockingRecord.objects.get(production_cycle_id=cycle['id']).has_pcic_insurance)

    def test_editing_the_cycle_keeps_the_ponds_insurance_and_ignores_a_cycle_wide_box(self):
        cycle = self.started(True, False)
        unit = self.detail(cycle['id'])['units'][0]
        self.upload(unit['id'])
        r = self.client.patch(f'{self.CYCLES}{cycle["id"]}/', {'notes': 'a note', 'has_pcic_insurance': False}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        again = self.detail(cycle['id'])
        self.assertEqual([u['has_pcic_insurance'] for u in again['units']], [True, False])
        self.assertTrue(again['has_pcic_insurance'])
        self.assertTrue(again['units'][0]['pcic_form_photo'])

    def test_a_pond_cannot_be_insured_without_a_species_to_stock(self):
        payload = self.payload(units=[{'length_m': 4, 'width_m': 2, 'fingerling_count': 20, 'has_pcic_insurance': True}])
        del payload['species_option']
        r = self.client.post(self.CYCLES, payload, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('units', r.data)

    def test_a_cycle_made_before_ponds_were_insured_one_by_one_reads_its_stocking_record(self):
        legacy = AquacultureProductionCycle.objects.create(
            fisherfolk=self.ff_a, cycle_name='Old', species_farmed='Tilapia', culture_system='Fishpond', stocking_date=date(2025, 1, 1))
        StockingRecord.objects.create(fisherfolk=self.ff_a, production_cycle=legacy, species=self.species, date_stocked=date(2025, 1, 1),
                                      number_of_fingerlings=10, season='Dry', year=2025, has_pcic_insurance=True)
        data = self.detail(legacy.id)
        self.assertEqual((data['has_pcic_insurance'], data['units']), (True, []))

    def test_the_table_rows_follow_the_ponds_of_each_cycle(self):
        insured, plain = self.started(False, True), self.started(False, False)
        rows = self.client.get(STOCKING, {'status': 'Stocked,Near Harvest,Harvested'}).data
        rows = rows['results'] if isinstance(rows, dict) else rows
        by_cycle = {r['production_cycle']: r for r in rows}
        self.assertTrue(by_cycle[insured['id']]['has_pcic_insurance'])
        self.assertFalse(by_cycle[plain['id']]['has_pcic_insurance'])

    def test_another_fisherfolk_cannot_open_the_pond_or_its_document(self):
        cycle = self.started(True, False)
        unit = self.detail(cycle['id'])['units'][0]
        self.upload(unit['id'])
        User = get_user_model()
        other = User.objects.create_user(username='ff-b-user', password='pw', role='CITIZEN', email='ffb@x.test')
        UserLinkedRecord.objects.create(user=other, record_type=User.LinkedRecordType.FISHERFOLK, record_id=self.ff_b.id, is_active=True)
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(f'{self.CYCLES}{cycle["id"]}/').status_code, 404)
        self.assertEqual(self.client.get(f'{UNITS}{unit["id"]}/').status_code, 404)
        self.assertEqual(self.client.patch(f'{UNITS}{unit["id"]}/', {'has_pcic_insurance': False}, format='json').status_code, 404)
        self.assertEqual(self.client.post(f'{UNITS}{unit["id"]}/pcic-form/', {'photo': image()}, format='multipart').status_code, 404)
        owner = User.objects.create_user(username='ff-a-user', password='pw', role='CITIZEN', email='ffa@x.test')
        UserLinkedRecord.objects.create(user=owner, record_type=User.LinkedRecordType.FISHERFOLK, record_id=self.ff_a.id, is_active=True)
        self.client.force_authenticate(owner)
        self.assertEqual(self.client.get(f'{self.CYCLES}{cycle["id"]}/').status_code, 200)       # their own cycle
        self.assertEqual(self.client.get(f'{UNITS}{unit["id"]}/').status_code, 200)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(f'{self.CYCLES}{cycle["id"]}/').status_code, (401, 403))
        self.assertIn(self.client.get(f'{UNITS}{unit["id"]}/').status_code, (401, 403))


class StartCycleRequiredFieldsTests(ProductionCycleBase):
    """Start Production Cycle: the target harvest date is required (the season comes from the stocking date, which is required)."""

    def test_a_new_cycle_needs_a_target_harvest_date(self):
        for body in ({'target_harvest_date': None}, {'target_harvest_date': ''}):
            r = self.post(**body)
            self.assertEqual(r.status_code, 400, body)
            self.assertIn('target_harvest_date', r.data)
        payload = self.payload()
        payload.pop('target_harvest_date')
        r = self.client.post(self.CYCLES, payload, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('target_harvest_date', r.data)
        self.assertEqual(AquacultureProductionCycle.objects.count(), 0)

    def test_a_target_date_makes_it_work_and_the_season_is_detected_from_the_stocking_date(self):
        r = self.post(target_harvest_date=str(date.today() + timedelta(days=120)))
        self.assertEqual(r.status_code, 201, r.data)
        self.assertIn(r.data['season'], ('Wet', 'Dry'))

    def test_a_target_before_the_stocking_date_is_still_refused(self):
        r = self.post(target_harvest_date=str(date.today() - timedelta(days=30)))
        self.assertEqual(r.status_code, 400)
        self.assertIn('target_harvest_date', r.data)

    def test_editing_an_existing_cycle_does_not_need_it_again(self):
        cid = self.post().data['id']
        AquacultureProductionCycle.objects.filter(pk=cid).update(target_harvest_date=None)
        r = self.client.patch(f'{self.CYCLES}{cid}/', {'notes': 'edited'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
