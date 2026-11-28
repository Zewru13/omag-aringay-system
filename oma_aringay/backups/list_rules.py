"""The rules of a "Settings and lists" restore: what happens to every entry of the settings pages' lists and the report signatories.
No database here; `settings_restore` reads the entries, asks `decide`, and writes what it answers.

An entry is known by its number. Records outside these lists point at that number, so an entry that records use is never removed and
never given another name (its number may mean something else in the backup).
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class ListDef:
    label: str
    title: str
    named_by: tuple          # the fields that say which thing an entry is; another value there is another name
    unique: tuple = ()       # the fields the database keeps unique together
    parents: tuple = ()      # ((field, label of the list it points at), ...)
    links: tuple = ()        # ((many-to-many field, label of the list it points at), ...)


def _starred(label, title, *named_by, **more):
    """A list whose names the database keeps unique."""
    return ListDef(label, title, named_by, unique=named_by, **more)


CROP_CATEGORY, CROP_SUBCATEGORY, CROP_TYPE = 'production.cropcategory', 'production.cropsubcategory', 'production.croptype'
SPECIES_CATEGORY, SPECIES = 'fisheries.speciescategory', 'fisheries.speciesoption'

# parents before children
LISTS = (
    _starred(CROP_CATEGORY, 'Crop categories', 'name'),
    _starred(CROP_SUBCATEGORY, 'Crop subcategories', 'category', 'name', parents=(('category', CROP_CATEGORY),)),
    _starred(CROP_TYPE, 'Crop types', 'name', parents=(('category', CROP_CATEGORY), ('subcategory', CROP_SUBCATEGORY))),
    _starred('production.cropvariety', 'Crop varieties', 'crop_type', 'name', parents=(('crop_type', CROP_TYPE),)),
    _starred('production.cropinputtype', 'Crop input types', 'name', links=(('crop_types', CROP_TYPE),)),
    ListDef('production.cropactivitystage', 'Crop activity steps', ('crop_type', 'stage_name'), parents=(('crop_type', CROP_TYPE),)),
    ListDef('production.harvestunitweight', 'Harvest unit weights', ('crop_type', 'unit'), parents=(('crop_type', CROP_TYPE),)),
    _starred('production.seedsource', 'Seed sources', 'name'),
    _starred('production.activitytype', 'Crop activity types', 'name'),
    _starred(SPECIES_CATEGORY, 'Species categories', 'name'),
    _starred(SPECIES, 'Species', 'species_name', parents=(('category', SPECIES_CATEGORY),)),
    ListDef('fisheries.speciesactivitystage', 'Species activity steps', ('species_option', 'activity_name'),
            parents=(('species_option', SPECIES),)),
    _starred('fisheries.feedtype', 'Feed types', 'name', links=(('species_options', SPECIES),)),
    _starred('fisheries.diseasetype', 'Disease types', 'name', links=(('species_options', SPECIES),)),
    _starred('fisheries.fingerlingsource', 'Fingerling sources', 'name'),
    _starred('fisheries.fisheriesactivitytype', 'Fisheries activity types', 'name'),
    _starred('interventions.assistanceagency', 'Assistance agencies', 'name'),
    _starred('interventions.assistanceoption', 'Assistance list entries', 'domain', 'kind', 'name'),
    _starred('interventions.assistancecustomtype', 'Added assistance types', 'domain', 'name'),
    _starred('interventions.assistancetypeunits', 'Assistance type units', 'domain', 'assistance_type'),
    _starred('farmers.parcelclassification', 'Parcel classifications', 'name'),
    ListDef('reports.signatory', 'Report signatories', ('name', 'role')),
)
BY_LABEL = {found.label: found for found in LISTS}

# Tables nothing in the system reads any more (the removed disaster and disease advice). Their rows do not hold a list entry; they
# go with the entry they belong to.
UNUSED_TABLES = ('production.disasterresponserule', 'fisheries.diseaseresponseguide', 'fisheries.fisheriesdisasterresponserule')

REASONS = {
    'used': 'Kept: records use it.',
    'renamed': 'Kept: records use it, and the backup has a different name in its place.',
    'belongs': 'Kept: it belongs to an entry that is kept.',
    'needed': 'Kept: an entry that is kept belongs to it.',
    'parent': 'Not restored: the entry it belongs to was not restored.',
    'clash': 'Not restored: another entry that is kept has this name.',
}

RESTORED = ('add', 'update')                    # written from the backup
HELD = ('used', 'renamed', 'belongs')           # kept for what records use, so what belongs to it stays too


@dataclass
class Decision:
    add: dict            # {label: {numbers}}
    update: dict
    remove: dict
    skipped: dict        # {(label, number): a key of REASONS}


def _fold(value):
    """Names compare without regard to capital letters."""
    return value.casefold() if isinstance(value, str) else value


def decide(now, filed, used):
    """What a restore does with every entry. `now` and `filed` are {label: {number: {field: value}}} (a parent's value is its number):
    the system's entries and the backup's. `used` is {label: {numbers}} of the entries records use, cascades counted. A list that is
    not in `filed` (the backup does not cover it) is left as it is."""
    covered = [found for found in LISTS if found.label in filed]

    def values_now(label, number):
        return now.get(label, {}).get(number)

    def renamed(found, number):
        """Whether writing the backup's entry would give this number another name."""
        old, new = values_now(found.label, number), filed[found.label].get(number)
        if old is None or new is None:
            return False
        return any(_fold(new[field]) != _fold(old.get(field)) for field in found.named_by if field in new)

    state = {}
    for found in covered:
        mine, theirs, in_use = now.get(found.label, {}), filed[found.label], used.get(found.label, set())
        for number in set(mine) | set(theirs):
            if number not in mine:
                state[found.label, number] = 'add'
            elif number not in theirs:
                state[found.label, number] = 'used' if number in in_use else 'remove'
            else:
                state[found.label, number] = 'renamed' if number in in_use and renamed(found, number) else 'update'

    def kept(label, number):
        """In the system now, and staying exactly as it is."""
        return values_now(label, number) is not None and state.get((label, number)) not in RESTORED + ('remove',)

    def would_change(found, number):
        """Removed, or given another name, unless a rule keeps it."""
        verb = state[found.label, number]
        return verb == 'remove' or (verb == 'update' and renamed(found, number))

    def parent_restored(label, number):
        if label in filed:
            return state.get((label, number)) in RESTORED
        return values_now(label, number) is not None

    def unique_key(found, values):
        key = tuple(_fold(values.get(field)) for field in found.unique)
        return None if not key or None in key else key          # the database does not count empty values as the same

    # Every change below keeps an entry or leaves it out, never the other way round, so the rounds come to an end.
    changed = True
    while changed:
        changed = False

        def settle(label, number, code):
            nonlocal changed
            state[label, number] = code
            changed = True

        # the parent of a kept entry stays under its name, and so does a parent an older file says nothing about. Every list
        # counts here: the entries of a list the file does not cover all stay
        for found in LISTS:
            for number, values in now.get(found.label, {}).items():
                stays = kept(found.label, number)
                updated = state.get((found.label, number)) == 'update'
                for field, target in found.parents:
                    if not (stays or (updated and field not in filed[found.label][number])):
                        continue
                    above = values.get(field)
                    if target in filed and values_now(target, above) is not None and would_change(BY_LABEL[target], above):
                        settle(target, above, 'needed')
        # what belongs to a held entry stays with it
        for found in covered:
            for number, values in now.get(found.label, {}).items():
                if would_change(found, number) and any(state.get((target, values.get(field))) in HELD for field, target in found.parents):
                    settle(found.label, number, 'belongs')
        # a backup entry whose parent was not restored is not restored either
        for found in covered:
            for number, values in filed[found.label].items():
                if state[found.label, number] not in RESTORED:
                    continue
                if any(values.get(field) is not None and not parent_restored(target, values[field]) for field, target in found.parents):
                    settle(found.label, number, 'parent')
        # a name the database keeps unique cannot be written while a kept entry has it
        for found in covered:
            if not found.unique:
                continue
            taken = {unique_key(found, values) for number, values in now.get(found.label, {}).items() if kept(found.label, number)}
            taken.discard(None)
            for number, values in filed[found.label].items():
                if state[found.label, number] in RESTORED:
                    after = {**(values_now(found.label, number) or {}), **values}
                    if unique_key(found, after) in taken:
                        settle(found.label, number, 'clash')

    decision = Decision(*({found.label: set() for found in covered} for _ in range(3)), skipped={})
    for (label, number), verb in state.items():
        if verb in ('add', 'update', 'remove'):
            getattr(decision, verb)[label].add(number)
        else:
            decision.skipped[label, number] = verb
    return decision
