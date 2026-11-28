"""A "Settings and lists" restore: the settings pages' lists and the report signatories go back to the backup's; people, farms,
ponds, their records and the uploaded files are left alone. What happens to each entry is decided by `list_rules`; this module
reads the entries and writes the answer, in ONE transaction.

Everything is written with raw deletes, `QuerySet.update` and plain inserts, so no signal is sent: the restore is one entry of the
Audit Log, not one per record.
"""
import json

from django.apps import apps
from django.contrib.auth import get_user_model
from django.core import serializers
from django.db import connections, models, transaction
from django.utils import timezone

from .list_rules import BY_LABEL, LISTS, REASONS, UNUSED_TABLES, decide
from .service import insert_records, link_tables, make_report

SKIPPED_LISTED = 200          # entries named in the result; the totals count them all
IN_SYSTEM = ('used', 'renamed', 'belongs', 'needed')          # a kept entry is named as the system has it, the rest as the backup does


def _covered(manifest, counts):
    """The lists a backup file really covers. Its manifest names them; an older backup's does not, and then only the lists it has
    entries of count, so that a list it never knew is not emptied."""
    named = manifest.get('models')
    if isinstance(named, list):
        return [found.label for found in LISTS if found.label in named]
    return [found.label for found in LISTS if counts.get(found.label)]


def file_lists(json_path, manifest):
    """{label: {number: {field: value}}} of the lists the backup covers, each entry with only the fields written in the file."""
    with open(json_path, 'r', encoding='utf-8') as f:
        items = json.load(f)
    entries = {}
    for item in items:
        if item.get('model') in BY_LABEL:
            entries.setdefault(item['model'], {})[item['pk']] = item.get('fields') or {}
    return {label: entries.get(label, {}) for label in _covered(manifest, {label: len(found) for label, found in entries.items()})}


def current_lists(using='default'):
    """The same, for what the system has now."""
    lists = {}
    for found in LISTS:
        model = apps.get_model(found.label)
        fields = [f for f in model._meta.concrete_fields if not f.primary_key]
        lists[found.label] = {record.pk: {f.name: f.value_from_object(record) for f in fields}
                              for record in model._base_manager.using(using).order_by('pk')}
    return lists


def list_rows(in_file, manifest, using='default'):
    """The preview's table: a row per list with its entries in the backup (`in_file` is {label: number of records in the file}) and
    in the system now. A list the backup does not cover is `kept` and has no number."""
    covered = _covered(manifest, in_file)
    return [{'key': found.label, 'label': found.title,
             'in_file': in_file.get(found.label, 0) if found.label in covered else None,
             'now': apps.get_model(found.label)._base_manager.using(using).count(),
             'kept': found.label not in covered}
            for found in LISTS]


def _list_models():
    return {apps.get_model(found.label): found.label for found in LISTS}


def _links_two_lists(model):
    """The in-between table of a many-to-many field from one list to another (feed types and species)."""
    owner = model._meta.auto_created
    return bool(owner) and owner._meta.label_lower in BY_LABEL and all(
        f.related_model._meta.label_lower in BY_LABEL for f in model._meta.fields if f.is_relation)


def _pointing_at(target):
    """(model, field) of every link in the database that points at `target`'s records."""
    return [(model, field) for model in apps.get_models(include_auto_created=True)
            for field in model._meta.fields if field.is_relation and field.related_model is target]


def used_now(using='default'):
    """{label: {numbers}} of the entries records use. Found from the models' own links, so a link added later counts by itself:
    any record outside these lists that points at an entry, and then every entry whose removal would take a used one with it."""
    ours = _list_models()
    used = {found.label: set() for found in LISTS}
    for model in apps.get_models(include_auto_created=True):
        label = model._meta.label_lower
        if label in BY_LABEL or label in UNUSED_TABLES or _links_two_lists(model):
            continue
        for field in model._meta.fields:
            if field.is_relation and field.related_model in ours:
                numbers = (model._base_manager.using(using).filter(**{f'{field.name}__isnull': False})
                           .order_by().values_list(field.attname, flat=True).distinct())
                used[ours[field.related_model]].update(numbers)
    for found in reversed(LISTS):          # children before parents, so one pass reaches the top
        model = apps.get_model(found.label)
        for name, target in found.parents:
            field = model._meta.get_field(name)
            if field.remote_field.on_delete is models.CASCADE and used[found.label]:
                above = model._base_manager.using(using).filter(pk__in=used[found.label], **{f'{name}__isnull': False})
                used[target].update(above.values_list(field.attname, flat=True))
    return used


# --------------------------------------------------------------------------------------------------------------------------------- the writing

def _main_field(found):
    return 'name' if 'name' in found.named_by else found.named_by[-1]


def _entry_name(found, number, source, now):
    """How an entry is called in the result: its name, then what tells it from others of that name, "Sinandomeng (Rice)"."""
    def values_of(label, key):
        return {**now.get(label, {}).get(key, {}), **source.get(label, {}).get(key, {})}

    values = values_of(found.label, number)
    main, parents, more = _main_field(found), dict(found.parents), []
    for name in found.named_by:
        if name == main:
            continue
        value = values.get(name)
        if name in parents:
            above = values_of(parents[name], value)
            value = above.get(_main_field(BY_LABEL[parents[name]]))
        if value:
            more.append(str(value))
    text = str(values.get(main, ''))
    return (f'{text} ({", ".join(more)})' if more else text)[:200]


def _report(now, filed, decision):
    rows, skipped = [], []
    for found in LISTS:
        mine = sorted((number, code) for (label, number), code in decision.skipped.items() if label == found.label)
        rows.append({'key': found.label, 'label': found.title,
                     'written': len(decision.add.get(found.label, ())) + len(decision.update.get(found.label, ())),
                     'removed': len(decision.remove.get(found.label, ())), 'skipped': len(mine), 'kept': found.label not in filed})
        for number, code in mine:
            if len(skipped) < SKIPPED_LISTED:
                source = now if code in IN_SYSTEM else filed
                skipped.append({'list': found.title, 'name': _entry_name(found, number, source, now), 'reason': REASONS[code]})
    return make_report(rows, skipped)


def _delete(queryset):
    queryset._raw_delete(queryset.db)


def _remove(decision, using):
    """Take the removed entries away, children first, with their link rows and their rows in the tables nothing reads any more."""
    unused = [apps.get_model(label) for label in UNUSED_TABLES]
    for found in reversed(LISTS):
        numbers = decision.remove.get(found.label)
        if not numbers:
            continue
        model = apps.get_model(found.label)
        for other, field in _pointing_at(model):
            if other._meta.auto_created:
                _delete(other._base_manager.using(using).filter(**{f'{field.name}__in': numbers}))
            elif other in unused:
                rows = list(other._base_manager.using(using).filter(**{f'{field.name}__in': numbers}).values_list('pk', flat=True))
                for pointer, link in _pointing_at(other):          # as the database would on a delete: the pointer is emptied
                    pointer._base_manager.using(using).filter(**{f'{link.name}__in': rows}).update(**{link.attname: None})
                _delete(other._base_manager.using(using).filter(pk__in=rows))
        _delete(model._base_manager.using(using).filter(pk__in=numbers))


def _free_names(now, filed, decision, using):
    """Entries about to get another unique name first get one nobody has, so that two can swap names."""
    for found in LISTS:
        if not found.unique:
            continue
        model, main = apps.get_model(found.label), _main_field(found)
        for number in decision.update.get(found.label, ()):
            new, old = filed[found.label][number], now[found.label][number]
            if any(name in new and new[name] != old[name] for name in found.unique):
                model._base_manager.using(using).filter(pk=number).update(**{main: f'~restoring~{number}'})


def _write(filed, decision, using):
    """Write the restored entries, parents first. An entry that is there is set to the fields the file has; one that is not is
    added under its own number."""
    User = get_user_model()
    accounts = set(User._base_manager.using(using).values_list('pk', flat=True))
    for found in LISTS:
        added = decision.add.get(found.label, set())
        numbers = sorted(added | decision.update.get(found.label, set()))
        if not numbers:
            continue
        model = apps.get_model(found.label)
        fields = [f for f in model._meta.concrete_fields if not f.primary_key]
        items = [{'model': found.label, 'pk': number, 'fields': filed[found.label][number]} for number in numbers]
        new = []
        for item in serializers.deserialize('python', items, using=using, ignorenonexistent=True):
            record = item.object
            for field in fields:
                if field.is_relation and field.related_model is User and getattr(record, field.attname) not in accounts:
                    setattr(record, field.attname, None)          # made by an account that is no longer there
            if record.pk in added:
                for field in fields:
                    if getattr(field, 'auto_now_add', False) and getattr(record, field.attname) is None:
                        setattr(record, field.attname, timezone.now())
                new.append(record)
            else:
                values = {f.attname: getattr(record, f.attname) for f in fields if f.name in filed[found.label][record.pk]}
                if values:
                    model._base_manager.using(using).filter(pk=record.pk).update(**values)
        if new:
            insert_records(model, new, using)


def _write_links(now, filed, decision, using):
    """The many-to-many links of every written entry: the file's links to entries that were written, plus the links it has now to
    entries that are kept."""
    for found in LISTS:
        model = apps.get_model(found.label)
        for name, target in found.links:
            field = model._meta.get_field(name)
            through = field.remote_field.through
            own = through._meta.get_field(field.m2m_field_name()).attname
            other = through._meta.get_field(field.m2m_reverse_field_name()).attname
            written = decision.add.get(target, set()) | decision.update.get(target, set())
            if target in filed:
                kept = {number for label, number in decision.skipped if label == target and number in now[target]}
            else:
                kept = set(now[target])
            for number in sorted(decision.add.get(found.label, set()) | decision.update.get(found.label, set())):
                values = filed[found.label][number]
                if name not in values:
                    continue
                rows = through._base_manager.using(using).filter(**{own: number})
                links = (set(values[name]) & written) | (set(rows.values_list(other, flat=True)) & kept)
                _delete(rows)
                through._base_manager.using(using).bulk_create([through(**{own: number, other: pk}) for pk in sorted(links)])


def _written_models():
    """The lists and the in-between tables between them: the only tables this restore adds records to."""
    lists = list(_list_models())
    return lists + [through for model in lists for through in link_tables(model)]


def _raise_counters(connection, written):
    """PostgreSQL numbers new records from a counter for each table, which a restored number does not move. A counter is only
    ever RAISED: lowered, it would give a removed entry's number to a new one, or one somebody is saving right now.
    (MariaDB moves its own counters.)"""
    if connection.vendor != 'postgresql':
        return
    quote = connection.ops.quote_name
    with connection.cursor() as cursor:
        for model in written:
            table, column = model._meta.db_table, model._meta.pk.column
            cursor.execute('SELECT pg_get_serial_sequence(%s, %s)', [quote(table), column])
            counter = cursor.fetchone()[0]
            if counter:
                cursor.execute(
                    f'SELECT setval(%s::regclass, top.number) FROM (SELECT max({quote(column)}) AS number FROM {quote(table)}) AS top '
                    'WHERE top.number > coalesce(pg_sequence_last_value(%s::regclass), 0)', [counter, counter])


def _checked_models():
    """The lists, the in-between and unused tables, and every table that points at any of them."""
    touched = list(_list_models()) + [apps.get_model(label) for label in UNUSED_TABLES]
    for target in list(touched):
        touched += [model for model, _ in _pointing_at(target)]
    return list(dict.fromkeys(touched))


def restore_settings(json_path, manifest, using='default'):
    """Put the settings lists of the backup's database file back. All of it or none of it. Returns the report (`make_report`),
    one row per list, with the entries that were left as they are and why."""
    filed = file_lists(json_path, manifest)
    connection = connections[using]
    with transaction.atomic(using=using):
        now = current_lists(using)
        decision = decide(now, filed, used_now(using))
        report = _report(now, filed, decision)
        with connection.constraint_checks_disabled():
            _remove(decision, using)
            _free_names(now, filed, decision, using)
            _write(filed, decision, using)
            _write_links(now, filed, decision, using)
        # every link must hold, or the whole restore is undone
        connection.check_constraints(table_names=[model._meta.db_table for model in _checked_models()])
        # last: PostgreSQL keeps a number counter's new value even when the transaction is undone
        _raise_counters(connection, _written_models())
    return report
