"""A variety or seed source typed as "Other" on a crop is saved to the lists of Crop Settings, whichever way the crop is saved.

An existing name (ignoring capitals, spaces and punctuation) is used as it is spelled; an edit adds only what it changes; nothing is added
when the save is refused."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import Farmer, FarmParcel

from .models import CropMonitoringRecord, CropType, CropVariety, SeedSource

_N = itertools.count(1)
LIST = '/api/production/monitoring/'
BULK = '/api/production/monitoring/bulk/'


class RememberedChoicesTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='rc-admin', password='pw', role='ADMIN', email='rc@x.test')
        cls.rice = CropType.objects.create(name='ZZ Rice', days_to_harvest=120, planting_type='Seed')
        cls.corn = CropType.objects.create(name='ZZ Corn', days_to_harvest=100, planting_type='Seed')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % (970000 + next(_N)), first_name='Remy', last_name='Choices', gender='Female',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        cls.parcel = FarmParcel.objects.create(
            farmer=cls.farmer, parcel_number='01-33-02-005-001-02-801', area_hectares='50.00', land_ownership='Owner', barangay='Alaska')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def row(self, variety='ZZ New Variety', crop=None, **over):
        row = {'farmer': self.farmer.id, 'farm_parcel': self.parcel.id, 'farm_location_barangay': 'Alaska',
               'crop_type': (crop or self.rice).id, 'land_status': 'Owner', 'season': 'Wet', 'year': 2026, 'date_planted': '2026-10-20',
               'area_planted_ha': '1.00', 'variety_used': variety}
        row.update(over)
        return row

    def add(self, *args, **kwargs):
        res = self.client.post(LIST, self.row(*args, **kwargs), format='json')
        self.assertEqual(res.status_code, 201, res.content)
        return CropMonitoringRecord.objects.get(pk=res.json()['id'])

    def varieties(self, crop=None):
        return list(CropVariety.objects.filter(crop_type=crop or self.rice).values_list('name', flat=True))

    def sources(self, name):
        return [s for s in SeedSource.objects.values_list('name', flat=True) if s.lower().replace(' ', '') == name.lower().replace(' ', '')]

    # ── variety ────────────────────────────────────────────────────────────────
    def test_a_new_variety_is_added_under_the_crop(self):
        record = self.add('  ZZ   Mestiso  20 ')
        self.assertEqual(self.varieties(), ['ZZ Mestiso 20'])
        self.assertEqual(record.variety_used, 'ZZ Mestiso 20')
        self.assertTrue(CropVariety.objects.get(name='ZZ Mestiso 20').is_active)
        self.assertEqual(self.varieties(self.corn), [])

    def test_an_existing_variety_is_used_as_it_is_spelled(self):
        CropVariety.objects.create(name='ZZ Rc 222', crop_type=self.rice)
        self.assertEqual(self.add('zz rc-222').variety_used, 'ZZ Rc 222')
        self.assertEqual(self.varieties(), ['ZZ Rc 222'])

    def test_a_variety_listed_for_every_crop_counts(self):
        CropVariety.objects.create(name='ZZ Native', crop_type=None)
        self.assertEqual(self.add('zz native').variety_used, 'ZZ Native')
        self.assertEqual(self.varieties(), [])

    def test_the_same_name_under_another_crop_is_new_for_this_one(self):
        CropVariety.objects.create(name='ZZ Hybrid 1', crop_type=self.corn)
        self.add('ZZ Hybrid 1')
        self.assertEqual(self.varieties(), ['ZZ Hybrid 1'])

    def test_a_deactivated_variety_is_neither_copied_nor_reactivated(self):
        old = CropVariety.objects.create(name='ZZ Retired', crop_type=self.rice, is_active=False)
        self.assertEqual(self.add('zz retired').variety_used, 'ZZ Retired')
        old.refresh_from_db()
        self.assertEqual((self.varieties(), old.is_active), (['ZZ Retired'], False))

    def test_words_that_name_nothing_are_not_added(self):
        for text in ('N/A', 'none', 'Other', ' others ', '---'):
            with self.subTest(text):
                self.assertEqual(self.add(text, area_planted_ha='0.10', date_planted=f'2026-10-{next(_N) % 9 + 1:02d}',
                                          farm_parcel=self.parcel.id, crop=CropType.objects.create(name=f'ZZ Crop {next(_N)}', days_to_harvest=90)).variety_used.strip(),
                                 text.strip())
        self.assertFalse(CropVariety.objects.filter(name__in=['N/A', 'none', 'Other', 'others', '---']).exists())

    # ── seed source ────────────────────────────────────────────────────────────
    def test_a_typed_seed_source_is_added_and_stored_by_name(self):
        record = self.add(seed_source='Other', seed_source_other_specify=' ZZ Coop  Seed Bank ')
        self.assertEqual((record.seed_source, record.seed_source_other_specify), ('ZZ Coop Seed Bank', ''))
        self.assertEqual(self.sources('ZZ Coop Seed Bank'), ['ZZ Coop Seed Bank'])
        self.assertTrue(SeedSource.objects.get(name='ZZ Coop Seed Bank').is_active)

    def test_an_existing_seed_source_is_used_as_it_is_spelled(self):
        SeedSource.objects.create(name='ZZ DA Region 1')
        record = self.add(seed_source='Other', seed_source_other_specify='zz da region-1')
        self.assertEqual((record.seed_source, record.seed_source_other_specify), ('ZZ DA Region 1', ''))
        self.assertEqual(len(SeedSource.objects.filter(name__icontains='ZZ DA')), 1)

    def test_a_seed_source_chosen_from_the_list_adds_nothing(self):
        before = SeedSource.objects.count()
        self.assertEqual(self.add(seed_source='Own Seeds').seed_source, 'Own Seeds')
        self.assertEqual(SeedSource.objects.count(), before)

    def test_a_seed_source_too_long_for_the_record_stays_other(self):
        text = 'ZZ ' + 'x' * 120
        record = self.add(seed_source='Other', seed_source_other_specify=text)
        self.assertEqual((record.seed_source, record.seed_source_other_specify), ('Other', text))
        self.assertFalse(SeedSource.objects.filter(name=text).exists())

    def test_none_as_a_typed_seed_source_stays_other(self):
        record = self.add(seed_source='Other', seed_source_other_specify='none')
        self.assertEqual((record.seed_source, record.seed_source_other_specify), ('Other', 'none'))
        self.assertEqual(self.sources('none'), [])

    # ── every way of saving, and nothing when refused ──────────────────────────
    def test_two_rows_of_one_form_make_one_entry(self):
        rows = [self.row('ZZ Twin', seed_source='Other', seed_source_other_specify='ZZ Twin Source'),
                self.row('zz  twin', crop=self.rice, date_planted='2026-09-01', seed_source='Other', seed_source_other_specify='zz twin source')]
        other_parcel = FarmParcel.objects.create(farmer=self.farmer, parcel_number='01-33-02-005-001-02-802', area_hectares='5.00',
                                                 land_ownership='Owner', barangay='Alaska')
        rows[1]['farm_parcel'] = other_parcel.id
        res = self.client.post(BULK, rows, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(self.varieties(), ['ZZ Twin'])
        self.assertEqual(self.sources('ZZ Twin Source'), ['ZZ Twin Source'])
        self.assertEqual(sorted(CropMonitoringRecord.objects.values_list('variety_used', flat=True)), ['ZZ Twin', 'ZZ Twin'])

    def test_a_refused_form_adds_nothing(self):
        rows = [self.row('ZZ Never', seed_source='Other', seed_source_other_specify='ZZ Never Source'), self.row('', crop=self.corn)]
        self.assertEqual(self.client.post(BULK, rows, format='json').status_code, 400)
        self.assertEqual(self.varieties(), [])
        self.assertEqual(self.sources('ZZ Never Source'), [])

    def parcels(self, crops):
        body = [{'parcel_number': '01-33-02-005-001-02-803', 'area_hectares': 3, 'barangay': 'Alaska', 'land_ownership': 'Owner',
                 'farm_type': 'Irrigated', 'cropping_schedule': 'Single Cropping',
                 'crop_records': [{k: v for k, v in c.items() if k not in ('farmer', 'farm_parcel')} for c in crops]}]
        return self.client.post(f'/api/farmers/{self.farmer.id}/parcels/bulk/', body, format='json')

    def test_a_crop_added_with_a_new_parcel_is_remembered(self):
        res = self.parcels([self.row('ZZ With Parcel', seed_source='Other', seed_source_other_specify='ZZ Parcel Source')])
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(self.varieties(), ['ZZ With Parcel'])
        self.assertEqual(self.sources('ZZ Parcel Source'), ['ZZ Parcel Source'])

    def test_refused_parcels_add_nothing(self):
        res = self.parcels([self.row('ZZ Rolled Back'), self.row('ZZ Too Big', crop=self.corn, area_planted_ha='9.00')])
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual((self.varieties(), self.varieties(self.corn)), ([], []))

    # ── edits ──────────────────────────────────────────────────────────────────
    def old_record(self):
        """A crop saved before this change: its typed values are on the record only."""
        record = self.add('ZZ Old Variety')
        CropVariety.objects.filter(name='ZZ Old Variety').delete()
        CropMonitoringRecord.objects.filter(pk=record.pk).update(seed_source='Other', seed_source_other_specify='ZZ Uncle')
        record.refresh_from_db()
        return record

    def edit(self, record, **body):
        res = self.client.patch(f'{LIST}{record.id}/', body, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        record.refresh_from_db()
        return record

    def test_an_edit_that_changes_neither_adds_nothing(self):
        record = self.edit(self.old_record(), area_planted_ha='2.00', variety_used='ZZ Old Variety', seed_source='Other',
                           seed_source_other_specify='ZZ Uncle')
        self.assertEqual((record.variety_used, record.seed_source, record.seed_source_other_specify), ('ZZ Old Variety', 'Other', 'ZZ Uncle'))
        self.assertEqual((self.varieties(), self.sources('ZZ Uncle')), ([], []))

    def test_an_edit_adds_what_it_changes(self):
        record = self.edit(self.old_record(), variety_used='ZZ Better Variety', seed_source='Other', seed_source_other_specify='ZZ Aunt')
        self.assertEqual((record.variety_used, record.seed_source, record.seed_source_other_specify), ('ZZ Better Variety', 'ZZ Aunt', ''))
        self.assertEqual((self.varieties(), self.sources('ZZ Aunt')), (['ZZ Better Variety'], ['ZZ Aunt']))

    def test_correcting_only_the_capitals_keeps_what_was_typed(self):
        record = self.edit(self.old_record(), variety_used='ZZ OLD variety')
        self.assertEqual(record.variety_used, 'ZZ OLD variety')
        self.assertEqual(self.varieties(), [])
