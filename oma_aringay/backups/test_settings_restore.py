"""A "Settings and lists" restore against a real database: the lists go back to the backup, and nothing else changes.
Run ONLY with the file storage overridden to a temporary folder (below), never against the real bucket."""
import json
import os
import shutil
import tempfile
from datetime import date
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import TransactionTestCase, override_settings

from auditlog.models import AuditLogEntry
from backups import service, settings_restore
from backups.list_rules import LISTS, REASONS
from farmers.models import Farmer
from fisheries.models import DiseaseType, FeedType, FingerlingSource, Fisherfolk, SpeciesCategory, SpeciesOption, StockingRecord
from production.models import (
    CropActivityLog, CropActivityStage, CropCategory, CropMonitoringRecord, CropType, CropVariety, DisasterResponseRule, SeedSource,
)
from reports.models import Signatory

_MEDIA = tempfile.mkdtemp(prefix='oma_test_media_settings_restore_')
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage', 'OPTIONS': {'location': _MEDIA}},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}


@override_settings(STORAGES=STORAGES, MEDIA_ROOT=_MEDIA)
class SettingsRestoreTests(TransactionTestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(_MEDIA, ignore_errors=True)

    # --- helpers
    def backup(self):
        """(the database file of a backup taken now, its manifest)"""
        handle, path = tempfile.mkstemp(suffix='.json')
        os.close(handle)
        self.addCleanup(os.remove, path)
        service.dump_database(path)
        return path, {'models': [model._meta.label_lower for model in service.backed_up_models()]}

    def restore(self, taken):
        return settings_restore.restore_settings(*taken)

    def lists_now(self):
        return settings_restore.current_lists()

    @staticmethod
    def row(report, label):
        return next(r for r in report['rows'] if r['key'] == label)

    @staticmethod
    def reasons(report):
        return {(item['list'], item['name']): item['reason'] for item in report['skipped']}

    def edit_file(self, taken, change):
        """The backup with its entries changed by `change(items)`, which returns the entries to keep."""
        with open(taken[0], encoding='utf-8') as f:
            items = json.load(f)
        with open(taken[0], 'w', encoding='utf-8') as f:
            json.dump(change(items), f)

    def farmer(self, number=1):
        return Farmer.objects.create(rsbsa_number=f'01-033-02-019-97000{number}', first_name='Settings', last_name=f'Farmer {number}',
                                     gender='Male', birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')

    def crop_record(self, crop_type):
        return CropMonitoringRecord.objects.create(
            farmer=self.farmer(), farm_location_barangay='Alaska', land_status='Owner', crop_type=crop_type, season='Wet', year=2026,
            date_planted=date(2026, 5, 1), area_planted_ha='1.00')

    def species(self, name, category):
        return SpeciesOption.objects.create(
            species_name=name, category=category, culture_environment='Freshwater', culture_duration_days=100,
            default_survival_rate_pct='80.00', default_avg_body_weight_kg='0.250')

    # --- the lists go back
    def test_a_changed_entry_goes_back_and_a_new_unused_one_goes(self):
        source = SeedSource.objects.create(name='ZZ Cooperative')
        signer = Signatory.objects.create(name='ZZ Ana', position='Clerk', role='noted')
        taken = self.backup()
        SeedSource.objects.filter(pk=source.pk).update(name='ZZ Renamed', is_active=False)
        SeedSource.objects.create(name='ZZ Added later')
        Signatory.objects.filter(pk=signer.pk).update(position='Chief')
        report = self.restore(taken)
        source.refresh_from_db()
        signer.refresh_from_db()
        self.assertEqual((source.name, source.is_active, signer.position), ('ZZ Cooperative', True, 'Clerk'))
        self.assertFalse(SeedSource.objects.filter(name='ZZ Added later').exists())
        row = self.row(report, 'production.seedsource')
        self.assertEqual((row['label'], row['written'], row['removed'], row['skipped'], row['kept']),
                         ('Seed sources', SeedSource.objects.count(), 1, 0, False))

    def test_the_report_has_a_row_for_every_list_and_adds_up(self):
        SeedSource.objects.create(name='ZZ One')
        report = self.restore(self.backup())
        self.assertEqual([r['key'] for r in report['rows']], [found.label for found in LISTS])
        for total in ('written', 'removed', 'skipped'):
            self.assertEqual(report['totals'][total], sum(r[total] for r in report['rows']), total)
        self.assertEqual(report['skipped'], [])

    def test_a_removed_entry_comes_back_with_its_own_number(self):
        category = CropCategory.objects.create(name='ZZ Grains')
        crop = CropType.objects.create(name='ZZ Adlai', days_to_harvest=100, category=category)
        variety = CropVariety.objects.create(name='ZZ Local', crop_type=crop)
        feed = FeedType.objects.create(name='ZZ Pellets')
        fish = self.species('ZZ Tilapia', SpeciesCategory.objects.create(name='ZZ Fish'))
        feed.species_options.add(fish)
        numbers = (category.pk, crop.pk, variety.pk, feed.pk, fish.pk)
        taken = self.backup()
        variety.delete()
        crop.delete()
        category.delete()
        feed.delete()
        fish.delete()
        self.restore(taken)
        self.assertEqual(CropVariety.objects.get(pk=numbers[2]).crop_type_id, numbers[1])
        self.assertEqual(CropType.objects.get(pk=numbers[1]).category_id, numbers[0])
        self.assertEqual(list(FeedType.objects.get(pk=numbers[3]).species_options.values_list('pk', flat=True)), [numbers[4]])

    def test_an_entry_whose_maker_is_gone_comes_back_without_a_maker(self):
        maker = get_user_model().objects.create_user(username='zz-maker', password='pw', role='ADMIN', email='zz@x.test')
        category = CropCategory.objects.create(name='ZZ Made', created_by=maker)
        made_at, number = category.date_created, category.pk
        taken = self.backup()
        category.delete()
        maker.delete()
        self.restore(taken)
        back = CropCategory.objects.get(pk=number)
        self.assertIsNone(back.created_by_id)
        self.assertEqual(back.date_created.replace(microsecond=0), made_at.replace(microsecond=0))

    def test_two_entries_that_swapped_names_swap_back(self):
        one, two = SeedSource.objects.create(name='ZZ North'), SeedSource.objects.create(name='ZZ South')
        taken = self.backup()
        for pk, name in ((one.pk, 'ZZ tmp'), (two.pk, 'ZZ North'), (one.pk, 'ZZ South')):
            SeedSource.objects.filter(pk=pk).update(name=name)
        self.restore(taken)
        self.assertEqual((SeedSource.objects.get(pk=one.pk).name, SeedSource.objects.get(pk=two.pk).name), ('ZZ North', 'ZZ South'))

    # --- what records use is kept
    def test_a_crop_in_use_keeps_its_type_variety_steps_and_category(self):
        taken = self.backup()
        category = CropCategory.objects.create(name='ZZ New category')
        crop = CropType.objects.create(name='ZZ New crop', days_to_harvest=90, category=category)
        variety = CropVariety.objects.create(name='ZZ New variety', crop_type=crop)
        step = CropActivityStage.objects.create(crop_type=crop, stage_name='ZZ Weeding', day_after_planting=10)
        record = self.crop_record(crop)
        report = self.restore(taken)
        for entry in (category, crop, variety, step):
            self.assertTrue(type(entry).objects.filter(pk=entry.pk).exists(), entry)
        record.refresh_from_db()
        self.assertEqual(record.crop_type_id, crop.pk)
        reasons = self.reasons(report)
        self.assertEqual(reasons['Crop types', 'ZZ New crop'], REASONS['used'])
        self.assertEqual(reasons['Crop varieties', 'ZZ New variety (ZZ New crop)'], REASONS['belongs'])
        self.assertEqual(reasons['Crop activity steps', 'ZZ Weeding (ZZ New crop)'], REASONS['belongs'])
        self.assertEqual(reasons['Crop categories', 'ZZ New category'], REASONS['needed'])
        self.assertEqual(report['totals']['skipped'], 4)

    def test_a_crop_in_use_is_never_renamed_and_the_backups_variety_is_not_restored(self):
        crop = CropType.objects.create(name='ZZ Was rice', days_to_harvest=100)
        variety = CropVariety.objects.create(name='ZZ Sinandomeng', crop_type=crop)
        taken = self.backup()
        variety.delete()
        CropType.objects.filter(pk=crop.pk).update(name='ZZ Now okra')
        record = self.crop_record(CropType.objects.get(pk=crop.pk))
        report = self.restore(taken)
        record.refresh_from_db()
        self.assertEqual(record.crop_type.name, 'ZZ Now okra')
        self.assertFalse(CropVariety.objects.filter(name='ZZ Sinandomeng').exists())
        reasons = self.reasons(report)
        self.assertEqual(reasons['Crop types', 'ZZ Now okra'], REASONS['renamed'])
        self.assertEqual(reasons['Crop varieties', 'ZZ Sinandomeng (ZZ Was rice)'], REASONS['parent'])

    def test_a_species_in_stock_keeps_its_feed_and_disease_links(self):
        feed, disease = FeedType.objects.create(name='ZZ Starter'), DiseaseType.objects.create(name='ZZ White spot')
        taken = self.backup()
        fish = self.species('ZZ New fish', SpeciesCategory.objects.create(name='ZZ New fish group'))
        feed.species_options.add(fish)
        disease.species_options.add(fish)
        fisher = Fisherfolk.objects.create(rsbsa_number='01-033-02-019-970101', first_name='Pond', last_name='Owner', gender='Male',
                                           birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Aquaculture')
        stock = StockingRecord.objects.create(fisherfolk=fisher, species=fish, culture_type='Pond', date_stocked=date(2026, 5, 1),
                                              number_of_fingerlings=100, season='Wet', year=2026)
        self.restore(taken)
        stock.refresh_from_db()
        self.assertEqual(stock.species_id, fish.pk)
        self.assertEqual(list(feed.species_options.values_list('pk', flat=True)), [fish.pk])
        self.assertEqual(list(disease.species_options.values_list('pk', flat=True)), [fish.pk])
        self.assertTrue(SpeciesCategory.objects.filter(pk=fish.category_id).exists())

    def test_old_unused_rules_do_not_hold_an_entry(self):
        planted = CropType.objects.create(name='ZZ Planted', days_to_harvest=90)
        record = self.crop_record(planted)
        taken = self.backup()
        extra = CropType.objects.create(name='ZZ Extra', days_to_harvest=90)
        rule = DisasterResponseRule.objects.create(disaster_type='Flood', crop_type=extra, title='ZZ old advice', action='Drain.')
        log = CropActivityLog.objects.create(monitoring_record=record, activity_type='Weeding', date_of_activity=date(2026, 5, 2),
                                             disaster_rule=rule)
        report = self.restore(taken)
        self.assertFalse(CropType.objects.filter(pk=extra.pk).exists())
        self.assertFalse(DisasterResponseRule.objects.filter(pk=rule.pk).exists())
        log.refresh_from_db()
        self.assertIsNone(log.disaster_rule_id)
        self.assertEqual(self.row(report, 'production.croptype')['removed'], 1)

    # --- older backup files
    def test_an_older_backup_without_a_list_leaves_that_list_alone(self):
        FingerlingSource.objects.all().delete()
        SeedSource.objects.create(name='ZZ Kept in file')
        path, _ = self.backup()
        added = FingerlingSource.objects.create(name='ZZ Hatchery')
        report = self.restore((path, {}))          # the manifest of an older backup does not say which lists it covers
        self.assertTrue(FingerlingSource.objects.filter(pk=added.pk).exists())
        row = self.row(report, 'fisheries.fingerlingsource')
        self.assertEqual((row['kept'], row['written'], row['removed']), (True, 0, 0))
        self.assertFalse(self.row(report, 'production.seedsource')['kept'])

    def test_a_field_the_file_does_not_have_keeps_its_value(self):
        crop = CropType.objects.create(name='ZZ Cassava', days_to_harvest=200, planting_type='Seed')
        taken = self.backup()

        def older(items):
            for item in items:
                if item['model'] == 'production.croptype':
                    item['fields'].pop('planting_type')
            return items
        self.edit_file(taken, older)
        CropType.objects.filter(pk=crop.pk).update(planting_type='Tree', days_to_harvest=5)
        self.restore(taken)
        crop.refresh_from_db()
        self.assertEqual((crop.planting_type, crop.days_to_harvest), ('Tree', 200))

    # --- nothing else changes
    def test_people_and_records_are_left_alone_and_no_file_is_touched(self):
        os.makedirs(_MEDIA, exist_ok=True)
        saved = default_storage.save('photos/settings.txt', ContentFile(b'before'))
        taken = self.backup()
        farmer = self.farmer(2)
        with default_storage.open(saved, 'wb') as f:
            f.write(b'changed since')
        AuditLogEntry.objects.create(user_name='Someone', action='UPDATE', object_repr='ZZ entry')
        SeedSource.objects.create(name='ZZ to be removed')
        farmers, entries = Farmer.objects.count(), AuditLogEntry.objects.count()
        self.restore(taken)
        self.assertTrue(Farmer.objects.filter(pk=farmer.pk).exists())
        self.assertEqual((Farmer.objects.count(), AuditLogEntry.objects.count()), (farmers, entries))   # no note per record either
        with default_storage.open(saved, 'rb') as f:
            self.assertEqual(f.read(), b'changed since')

    def test_a_failure_changes_nothing(self):
        gone, renamed = SeedSource.objects.create(name='ZZ Gone'), SeedSource.objects.create(name='ZZ Renamed')
        feed = FeedType.objects.create(name='ZZ Feed')
        feed.species_options.add(self.species('ZZ Bangus', SpeciesCategory.objects.create(name='ZZ Milkfish')))
        taken = self.backup()
        gone.delete()
        SeedSource.objects.filter(pk=renamed.pk).update(name='ZZ Other')
        SeedSource.objects.create(name='ZZ Extra')
        feed.species_options.clear()
        before = self.lists_now()
        links = list(FeedType.species_options.through.objects.values_list('feedtype_id', 'speciesoption_id'))
        with mock.patch('backups.settings_restore.insert_records', side_effect=RuntimeError('lost the connection')):
            with self.assertRaises(RuntimeError):
                self.restore(taken)
        self.assertEqual(self.lists_now(), before)
        self.assertEqual(list(FeedType.species_options.through.objects.values_list('feedtype_id', 'speciesoption_id')), links)

    def test_an_older_backup_with_an_empty_list_still_restores_when_newer_entries_of_it_have_a_parent(self):
        CropActivityStage.objects.all().delete()          # the older backup is taken while no crop has a step
        CropType.objects.create(name='ZZ Planted before', days_to_harvest=90)
        path, _ = self.backup()
        crop = CropType.objects.create(name='ZZ Added since', days_to_harvest=90)          # no record uses it
        step = CropActivityStage.objects.create(crop_type=crop, stage_name='ZZ Weeding', day_after_planting=10)
        report = self.restore((path, {}))          # no 'models' in the manifest of an older backup
        self.assertTrue(CropType.objects.filter(pk=crop.pk).exists())
        self.assertEqual(CropActivityStage.objects.get(pk=step.pk).crop_type_id, crop.pk)
        self.assertEqual(self.reasons(report)['Crop types', 'ZZ Added since'], REASONS['needed'])

    # --- the numbers new records get (PostgreSQL keeps a counter for each table; MariaDB moves its own)
    def test_a_new_entry_can_be_added_afterwards(self):
        last = SeedSource.objects.create(name='ZZ Last')
        number = last.pk
        taken = self.backup()
        last.delete()
        self.restore(taken)
        added = SeedSource.objects.create(name='ZZ After the restore')
        self.assertGreater(added.pk, number)
        self.assertEqual(SeedSource.objects.filter(name__in=['ZZ Last', 'ZZ After the restore']).count(), 2)

    def test_the_counter_moves_past_a_restored_number_above_it(self):
        source = SeedSource.objects.create(name='ZZ From another copy')
        high = source.pk + 1000
        taken = self.backup()
        source.delete()

        def numbered_higher(items):
            for item in items:
                if item['model'] == 'production.seedsource' and item['fields']['name'] == 'ZZ From another copy':
                    item['pk'] = high
            return items
        self.edit_file(taken, numbered_higher)
        self.restore(taken)
        self.assertTrue(SeedSource.objects.filter(pk=high).exists())
        self.assertGreater(SeedSource.objects.create(name='ZZ Next').pk, high)

    def test_the_number_of_a_removed_entry_is_not_given_again(self):
        taken = self.backup()
        removed = SeedSource.objects.create(name='ZZ Added then removed').pk
        self.restore(taken)
        self.assertFalse(SeedSource.objects.filter(pk=removed).exists())
        self.assertGreater(SeedSource.objects.create(name='ZZ Next').pk, removed)

    def test_the_counters_of_records_are_left_alone(self):
        # the number of a deleted record is not given to a new one: its history would then be about the new one
        crop = CropType.objects.create(name='ZZ Counted', days_to_harvest=90)
        first = self.crop_record(crop)

        def another():
            return CropMonitoringRecord.objects.create(
                farmer=first.farmer, farm_location_barangay='Alaska', land_status='Owner', crop_type=crop, season='Wet', year=2026,
                date_planted=date(2026, 5, 2), area_planted_ha='1.00')
        deleted = another()
        number = deleted.pk
        deleted.delete()
        self.restore(self.backup())
        self.assertGreater(another().pk, number)

    # --- the preview's table
    def test_the_preview_rows_say_how_many_each_list_has(self):
        FingerlingSource.objects.all().delete()
        SeedSource.objects.create(name='ZZ A')
        path, manifest = self.backup()
        SeedSource.objects.create(name='ZZ B')
        in_file = {}
        with open(path, encoding='utf-8') as f:
            for item in json.load(f):
                in_file[item['model']] = in_file.get(item['model'], 0) + 1
        rows = {r['key']: r for r in settings_restore.list_rows(in_file, manifest)}
        self.assertEqual(list(rows), [found.label for found in LISTS])
        seeds = rows['production.seedsource']
        self.assertEqual((seeds['label'], seeds['in_file'], seeds['now'], seeds['kept']),
                         ('Seed sources', SeedSource.objects.count() - 1, SeedSource.objects.count(), False))
        self.assertEqual((rows['fisheries.fingerlingsource']['in_file'], rows['fisheries.fingerlingsource']['kept']), (0, False))
        older = {r['key']: r for r in settings_restore.list_rows(in_file, {})}
        self.assertEqual((older['fisheries.fingerlingsource']['in_file'], older['fisheries.fingerlingsource']['kept']), (None, True))
