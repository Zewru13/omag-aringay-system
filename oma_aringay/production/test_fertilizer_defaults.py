"""Crop Settings > Input Types starts with the common fertilizer grades (the dropdown of the Log Activity form and of the Assistance forms),
only when nobody has added a fertilizer yet - a list the staff already built is never touched.

Run ONLY against an isolated test database (never the shared Supabase database)."""
from django.apps import apps
from django.test import TestCase

from production.fertilizer_defaults import FERTILIZER_TYPES, fill_fertilizer_types
from production.models import CropInputType


def fertilizers():
    return CropInputType.objects.filter(input_type='Fertilizer')


class FertilizerDefaultsTests(TestCase):
    def test_the_list_is_the_six_grades_of_the_da_price_bulletins(self):
        self.assertEqual(len(FERTILIZER_TYPES), 6)
        joined = ' | '.join(name for name, _ in FERTILIZER_TYPES)
        for grade in ('46-0-0', '21-0-0', '14-14-14', '16-20-0', '0-0-60', '18-46-0'):
            self.assertIn(grade, joined)

    def test_the_migration_writes_the_same_names_as_the_module(self):
        import importlib
        migration = importlib.import_module('production.migrations.0067_fill_fertilizer_types')
        self.assertEqual(list(migration.NAMES), [name for name, _ in FERTILIZER_TYPES])
        self.assertEqual({d for _, d in FERTILIZER_TYPES}, {migration.DESCRIPTION})

    def test_the_migration_has_already_filled_an_empty_list(self):
        self.assertEqual(sorted(fertilizers().values_list('name', flat=True)), sorted(name for name, _ in FERTILIZER_TYPES))

    def test_the_new_entries_are_active_and_recommend_nothing(self):
        for entry in fertilizers():
            self.assertTrue(entry.is_active)
            self.assertEqual(entry.growth_stage, '', entry.name)         # no stage: nothing is guessed about when to use it
            self.assertEqual(entry.crop_types.count(), 0, entry.name)     # no crop: it is never the "recommended input" of a crop

    def test_an_empty_list_is_filled(self):
        fertilizers().delete()
        fill_fertilizer_types(apps, None)
        self.assertEqual(fertilizers().count(), 6)

    def test_running_it_twice_adds_nothing(self):
        fill_fertilizer_types(apps, None)
        self.assertEqual(fertilizers().count(), 6)

    def test_a_list_the_staff_built_is_left_as_it_is(self):
        fertilizers().delete()
        CropInputType.objects.create(name='Our own blend', input_type='Fertilizer')
        fill_fertilizer_types(apps, None)
        self.assertEqual(list(fertilizers().values_list('name', flat=True)), ['Our own blend'])

    def test_pesticides_do_not_count_as_a_fertilizer_list(self):
        fertilizers().delete()
        CropInputType.objects.create(name='Some pesticide', input_type='Pesticide')
        fill_fertilizer_types(apps, None)
        self.assertEqual(fertilizers().count(), 6)

    def test_a_name_already_used_by_another_category_is_skipped_not_a_crash(self):
        fertilizers().delete()
        CropInputType.objects.create(name=FERTILIZER_TYPES[0][0], input_type='Other')
        fill_fertilizer_types(apps, None)
        self.assertEqual(fertilizers().count(), 5)
