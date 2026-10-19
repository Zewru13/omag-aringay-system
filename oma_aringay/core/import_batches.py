"""Remember what a committed import added, so it can be undone (core.import_undo).

An import opens one batch when it COMMITS (never on a preview), reports every record it created, and reports any change
it made to an existing record that can be put back. All of it happens inside the import's own transaction, so an import
that rolls back leaves no batch behind. The RSBSA registry import keeps its own log (farmers.RsbsaImportChangeLog)."""
import hashlib
import json

from core.models import ImportBatch, ImportBatchItem

IMPORT_TYPES = {
    'crop_records': 'Crop records',
    'farmers_org': 'Farmers organizations',
    'fisherfolk_org': 'Fisherfolk organizations',
    'farmers_org_members': 'Farmers organization members',
    'fisherfolk_org_members': 'Fisherfolk organization members',
    'farmers_org_equipment': 'Farmers organization equipment',
    'fisherfolk_org_equipment': 'Fisherfolk organization equipment',
    'crop_assistance': 'Crop assistance',
    'fisheries_assistance': 'Fisheries assistance',
    'stocking': 'Stocking records',
}


def start_batch(import_type, user, label=''):
    if import_type not in IMPORT_TYPES:
        raise ValueError(f'Unknown import type: {import_type}')
    return ImportBatch.objects.create(import_type=import_type, performed_by=user, label=label[:255])


def fingerprint(obj):
    """A hash of every stored value of `obj` except its primary key and fields the database fills in by itself
    (auto_now / auto_now_add). If any other field changes later, the fingerprint no longer matches."""
    values = {}
    for field in obj._meta.concrete_fields:
        if field.primary_key or getattr(field, 'auto_now', False) or getattr(field, 'auto_now_add', False):
            continue
        values[field.attname] = str(getattr(obj, field.attname))
    return hashlib.sha256(json.dumps(values, sort_keys=True).encode('utf-8')).hexdigest()


def record_created(batch, obj):
    """Call AFTER the import has finished changing `obj` (a later save by the import would change its fingerprint).
    The fingerprint is taken from the row as the database holds it (decimals and dates normalised), because that is
    what the undo will compare against."""
    stored = type(obj)._default_manager.get(pk=obj.pk)
    ImportBatchItem.objects.create(
        batch=batch, model_label=obj._meta.label_lower, object_id=obj.pk,
        action=ImportBatchItem.Action.CREATE, fingerprint=fingerprint(stored))
    ImportBatch.objects.filter(pk=batch.pk).update(row_count=batch.row_count + 1)
    batch.row_count += 1


def record_restore(batch, obj, field, old, new):
    """The import changed `field` of an existing record from `old` to `new`; undo puts `old` back if still `new`."""
    ImportBatchItem.objects.create(
        batch=batch, model_label=obj._meta.label_lower, object_id=obj.pk,
        action=ImportBatchItem.Action.RESTORE, field_name=field, old_value=str(old), new_value=str(new))
