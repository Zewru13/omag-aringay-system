"""The "Settings and lists" rules: what happens to every entry of every settings list. No database."""
from django.apps import apps
from django.db import models
from django.test import SimpleTestCase

from backups.list_rules import BY_LABEL, LISTS, REASONS, UNUSED_TABLES, decide

CATEGORY = 'production.cropcategory'
T = 'production.croptype'
VARIETY = 'production.cropvariety'
STEP = 'production.cropactivitystage'
SIGNATORY = 'reports.signatory'
SPECIES = 'fisheries.speciesoption'
VERBS = ('add', 'update', 'remove')


def run(now, filed, used=None):
    return decide(now, filed, used or {})


def outcome(decision, label, number):
    for verb in VERBS:
        if number in getattr(decision, verb).get(label, set()):
            return verb
    return decision.skipped.get((label, number))


class TableTests(SimpleTestCase):
    """One test for each row of the design's table."""

    def test_in_the_file_only_is_added(self):
        self.assertEqual(outcome(run({T: {}}, {T: {1: {'name': 'Rice'}}}), T, 1), 'add')

    def test_same_name_is_set_back_even_when_in_use(self):
        d = run({T: {1: {'name': 'rice'}}}, {T: {1: {'name': 'Rice'}}}, {T: {1}})
        self.assertEqual(outcome(d, T, 1), 'update')

    def test_a_different_name_not_in_use_is_set_back(self):
        self.assertEqual(outcome(run({T: {1: {'name': 'Okra'}}}, {T: {1: {'name': 'Rice'}}}), T, 1), 'update')

    def test_a_different_name_in_use_is_never_renamed(self):
        self.assertEqual(outcome(run({T: {1: {'name': 'Okra'}}}, {T: {1: {'name': 'Rice'}}}, {T: {1}}), T, 1), 'renamed')

    def test_only_in_the_system_is_removed_unless_in_use(self):
        d = run({T: {1: {'name': 'A'}, 2: {'name': 'B'}}}, {T: {}}, {T: {2}})
        self.assertEqual((outcome(d, T, 1), outcome(d, T, 2)), ('remove', 'used'))

    def test_a_name_taken_by_a_kept_entry_cannot_be_added(self):
        d = run({T: {9: {'name': 'Rice'}}}, {T: {5: {'name': 'rice'}}}, {T: {9}})
        self.assertEqual((outcome(d, T, 5), outcome(d, T, 9)), ('clash', 'used'))


class RulingTests(SimpleTestCase):
    def test_a_field_the_file_does_not_have_does_not_count_as_a_new_name(self):
        now = {VARIETY: {1: {'crop_type': 3, 'name': 'Sinandomeng'}}}
        d = run(now, {VARIETY: {1: {'name': 'sinandomeng'}}}, {VARIETY: {1}})
        self.assertEqual(outcome(d, VARIETY, 1), 'update')

    def test_a_new_crop_type_in_use_keeps_its_variety_step_and_category(self):
        now = {CATEGORY: {1: {'name': 'Grains'}}, T: {2: {'name': 'Adlai', 'category': 1, 'subcategory': None}},
               VARIETY: {3: {'name': 'Local', 'crop_type': 2}}, STEP: {4: {'crop_type': 2, 'stage_name': 'Weeding'}}}
        d = run(now, {CATEGORY: {}, T: {}, VARIETY: {}, STEP: {}}, {T: {2}})
        self.assertEqual(
            [outcome(d, CATEGORY, 1), outcome(d, T, 2), outcome(d, VARIETY, 3), outcome(d, STEP, 4)],
            ['needed', 'used', 'belongs', 'belongs'])

    def test_what_belongs_to_an_entry_that_is_kept_for_that_reason_stays_too(self):
        # a species kept because its category is kept does not lose its steps
        categories, steps = 'fisheries.speciescategory', 'fisheries.speciesactivitystage'
        now = {categories: {1: {'name': 'Shellfish'}},
               SPECIES: {2: {'species_name': 'Mussel', 'category': 1}, 3: {'species_name': 'Oyster', 'category': 1}},
               steps: {4: {'species_option': 3, 'activity_name': 'Cleaning'}}}
        d = run(now, {categories: {}, SPECIES: {}, steps: {}}, {categories: {1}, SPECIES: {2}})
        self.assertEqual(
            [outcome(d, categories, 1), outcome(d, SPECIES, 2), outcome(d, SPECIES, 3), outcome(d, steps, 4)],
            ['used', 'used', 'belongs', 'belongs'])

    def test_a_variety_of_a_renamed_crop_type_is_not_restored(self):
        now = {T: {1: {'name': 'Okra'}}, VARIETY: {7: {'name': 'Green', 'crop_type': 1}}}
        filed = {T: {1: {'name': 'Rice'}}, VARIETY: {8: {'name': 'Sinandomeng', 'crop_type': 1}}}
        d = run(now, filed, {T: {1}})
        self.assertEqual((outcome(d, T, 1), outcome(d, VARIETY, 8), outcome(d, VARIETY, 7)), ('renamed', 'parent', 'belongs'))

    def test_the_parent_of_a_kept_entry_is_not_renamed(self):
        now = {CATEGORY: {1: {'name': 'Vegetables'}}, T: {2: {'name': 'Okra', 'category': 1, 'subcategory': None}}}
        filed = {CATEGORY: {1: {'name': 'Grains'}}, T: {}}
        d = run(now, filed, {T: {2}})
        self.assertEqual((outcome(d, CATEGORY, 1), outcome(d, T, 2)), ('needed', 'used'))

    def test_the_parent_of_a_kept_entry_is_still_set_back_when_its_name_stays(self):
        now = {CATEGORY: {1: {'name': 'grains'}}, T: {2: {'name': 'Okra', 'category': 1, 'subcategory': None}}}
        d = run(now, {CATEGORY: {1: {'name': 'Grains'}}, T: {}}, {T: {2}})
        self.assertEqual(outcome(d, CATEGORY, 1), 'update')

    def test_two_signatories_of_one_name_are_both_written(self):
        person = {'name': 'Ana Cruz', 'role': 'noted'}
        d = run({SIGNATORY: {}}, {SIGNATORY: {1: person, 2: dict(person)}})
        self.assertEqual((outcome(d, SIGNATORY, 1), outcome(d, SIGNATORY, 2)), ('add', 'add'))

    def test_a_clash_that_keeps_a_crop_type_also_stops_its_variety(self):
        now = {T: {3: {'name': 'Okra'}, 9: {'name': 'Rice'}}, VARIETY: {}}
        filed = {T: {3: {'name': 'Rice'}}, VARIETY: {4: {'name': 'Red', 'crop_type': 3}}}
        d = run(now, filed, {T: {9}})
        self.assertEqual((outcome(d, T, 3), outcome(d, T, 9), outcome(d, VARIETY, 4)), ('clash', 'used', 'parent'))

    def test_a_parent_the_file_does_not_cover_counts_when_it_is_still_there(self):
        filed = {VARIETY: {1: {'name': 'A', 'crop_type': 5}, 2: {'name': 'B', 'crop_type': 6}}}
        d = run({T: {5: {'name': 'Rice'}}, VARIETY: {}}, filed)
        self.assertEqual((outcome(d, VARIETY, 1), outcome(d, VARIETY, 2)), ('add', 'parent'))

    def test_an_entry_with_no_parent_never_clashes_by_its_empty_parent(self):
        # the database does not count two empty parents as the same
        now = {VARIETY: {1: {'name': 'Local', 'crop_type': None}}}
        d = run(now, {VARIETY: {2: {'name': 'Local', 'crop_type': None}}}, {VARIETY: {1}})
        self.assertEqual((outcome(d, VARIETY, 1), outcome(d, VARIETY, 2)), ('used', 'add'))

    def test_a_list_the_file_does_not_cover_is_left_alone(self):
        d = run({'fisheries.fingerlingsource': {1: {'name': 'BFAR'}}, T: {}}, {T: {}})
        self.assertIsNone(outcome(d, 'fisheries.fingerlingsource', 1))
        self.assertNotIn('fisheries.fingerlingsource', d.remove)

    def test_the_parent_an_older_file_says_nothing_about_stays(self):
        # the entry is written back, but its parent is not in the file, so the one it has now stays and must not go
        subcategory = 'production.cropsubcategory'
        now = {CATEGORY: {1: {'name': 'Grains'}}, subcategory: {5: {'name': 'Wet', 'category': 1}},
               T: {2: {'name': 'Rice', 'category': 1, 'subcategory': 5}}}
        filed = {CATEGORY: {1: {'name': 'Grains'}}, subcategory: {}, T: {2: {'name': 'Rice', 'category': 1}}}
        d = run(now, filed)
        self.assertEqual((outcome(d, T, 2), outcome(d, subcategory, 5)), ('update', 'needed'))

    def test_an_entry_of_a_list_the_file_does_not_cover_keeps_its_parent(self):
        # an older backup knows no activity steps: the one there stays, so its crop type is neither removed nor renamed
        now = {CATEGORY: {}, T: {2: {'name': 'Adlai'}, 3: {'name': 'Okra'}},
               STEP: {4: {'crop_type': 2, 'stage_name': 'Weeding'}, 5: {'crop_type': 3, 'stage_name': 'Thinning'}}}
        d = run(now, {T: {3: {'name': 'Rice'}}})
        self.assertEqual((outcome(d, T, 2), outcome(d, T, 3)), ('needed', 'needed'))
        self.assertIsNone(outcome(d, STEP, 4))

    def test_every_entry_gets_exactly_one_outcome(self):
        now = {CATEGORY: {1: {'name': 'Grains'}, 2: {'name': 'Fruit'}},
               T: {1: {'name': 'Okra', 'category': 2, 'subcategory': None}, 2: {'name': 'Corn', 'category': 1, 'subcategory': None},
                   9: {'name': 'Rice', 'category': 1, 'subcategory': None}},
               VARIETY: {1: {'name': 'A', 'crop_type': 1}, 2: {'name': 'B', 'crop_type': 9}}}
        filed = {CATEGORY: {1: {'name': 'Grains'}, 3: {'name': 'Fruit'}},
                 T: {1: {'name': 'Rice', 'category': 3, 'subcategory': None}, 4: {'name': 'Yam', 'category': 1, 'subcategory': None}},
                 VARIETY: {1: {'name': 'A', 'crop_type': 1}, 5: {'name': 'C', 'crop_type': 4}}}
        d = run(now, filed, {T: {9}, CATEGORY: {2}})
        for label in (CATEGORY, T, VARIETY):
            numbers = set(now[label]) | set(filed[label])
            for number in numbers:
                found = [verb for verb in VERBS if number in getattr(d, verb).get(label, set())]
                found += ['skipped'] if (label, number) in d.skipped else []
                self.assertEqual(len(found), 1, (label, number, found))
            listed = set().union(*(getattr(d, verb).get(label, set()) for verb in VERBS))
            self.assertLessEqual(listed, numbers)
        self.assertTrue(set(d.skipped.values()) <= set(REASONS))

    def test_the_reasons_are_the_ones_the_page_shows(self):
        self.assertEqual(REASONS, {
            'used': 'Kept: records use it.',
            'renamed': 'Kept: records use it, and the backup has a different name in its place.',
            'belongs': 'Kept: it belongs to an entry that is kept.',
            'needed': 'Kept: an entry that is kept belongs to it.',
            'parent': 'Not restored: the entry it belongs to was not restored.',
            'clash': 'Not restored: another entry that is kept has this name.',
        })


class ListDefinitionTests(SimpleTestCase):
    """The definitions must say what the database says."""

    def test_there_are_22_lists_and_every_parent_comes_before_its_children(self):
        self.assertEqual(len(LISTS), 22)
        self.assertEqual(len(BY_LABEL), 22)
        seen = set()
        for found in LISTS:
            for _, target in found.parents + found.links:
                self.assertIn(target, seen, found.label)
            seen.add(found.label)

    def test_parents_links_and_fields_match_the_models(self):
        for found in LISTS:
            model = apps.get_model(found.label)
            for field in found.named_by + found.unique:
                model._meta.get_field(field)
            parents = {(f.name, f.related_model._meta.label_lower) for f in model._meta.fields
                       if f.is_relation and f.related_model._meta.label_lower in BY_LABEL}
            self.assertEqual(set(found.parents), parents, found.label)
            links = {(f.name, f.related_model._meta.label_lower) for f in model._meta.many_to_many}
            self.assertEqual(set(found.links), links, found.label)

    def test_unique_is_what_the_database_keeps_unique(self):
        for found in LISTS:
            meta = apps.get_model(found.label)._meta
            in_database = [{f.name} for f in meta.fields if f.unique and not f.primary_key]
            in_database += [set(fields) for fields in meta.unique_together]
            in_database += [set(c.fields) for c in meta.constraints if isinstance(c, models.UniqueConstraint)]
            self.assertEqual(in_database, [set(found.unique)] if found.unique else [], found.label)

    def test_the_unused_tables_are_real(self):
        self.assertEqual(
            [apps.get_model(label)._meta.label_lower for label in UNUSED_TABLES],
            ['production.disasterresponserule', 'fisheries.diseaseresponseguide', 'fisheries.fisheriesdisasterresponserule'])
