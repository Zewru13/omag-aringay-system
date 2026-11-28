"""A variety or seed source typed as "Other" on a crop is remembered in the lists of Crop Settings, so it can be picked next time.

Called by CropMonitoringRecordSerializer, which every way of saving a crop record goes through. Names are the same when
production.naming.normalize_name says so: the listed entry is then used as it is spelled, and nothing is added twice."""
from .models import CropMonitoringRecord, CropVariety, SeedSource
from .naming import normalize_name

# typed to say there is nothing to name; never worth listing
NOT_A_NAME = {'other', 'others', 'na', 'none', 'nil'}


def _tidy(value):
    return ' '.join(str(value or '').split())


def _listable(name):
    key = normalize_name(name)
    return bool(key) and key not in NOT_A_NAME


def _fits(name, field):
    return len(name) <= CropMonitoringRecord._meta.get_field(field).max_length


def _same_name(entries, name):
    key = normalize_name(name)
    return next((e for e in entries if normalize_name(e.name) == key), None)


def saved_variety(name, crop_type):
    """The spelling to keep on the record: the listed one, or `name`, which is then added under `crop_type`. A variety listed for
    every crop counts, and a deactivated one is left as it is."""
    entries = list(CropVariety.objects.filter(crop_type=crop_type)) + list(CropVariety.objects.filter(crop_type__isnull=True))
    found = _same_name(sorted(entries, key=lambda e: (e.crop_type_id is None, not e.is_active, e.pk)), name)
    if found:
        return found.name if _fits(found.name, 'variety_used') else name
    CropVariety.objects.get_or_create(crop_type=crop_type, name=name)
    return name


def saved_seed_source(name):
    """The same for a seed source. None when it cannot be stored on a record by its name (too long): it then stays "Other"."""
    found = _same_name(SeedSource.objects.order_by('-is_active', 'pk'), name)
    kept = found.name if found else name
    if not _fits(kept, 'seed_source'):
        return None
    if not found:
        SeedSource.objects.get_or_create(name=name)
    return kept


def remember_crop_choices(data, instance=None):
    """Adds what is new in `data` (a crop record about to be saved) to the lists, and changes `data` to the spelling to store.
    On an edit (`instance`), only a value that changes is looked at, so older records keep what they have."""
    if 'variety_used' in data:
        typed = _tidy(data['variety_used'])
        crop_type = data.get('crop_type') or getattr(instance, 'crop_type', None)
        changed = instance is None or normalize_name(typed) != normalize_name(instance.variety_used)
        if changed and crop_type and _listable(typed) and _fits(typed, 'variety_used'):
            data['variety_used'] = saved_variety(typed, crop_type)

    source = data.get('seed_source', getattr(instance, 'seed_source', ''))
    if source != 'Other' or not ({'seed_source', 'seed_source_other_specify'} & set(data)):
        return
    typed = _tidy(data.get('seed_source_other_specify', getattr(instance, 'seed_source_other_specify', '')))
    unchanged = (instance is not None and instance.seed_source == 'Other'
                 and normalize_name(instance.seed_source_other_specify) == normalize_name(typed))
    if unchanged or not _listable(typed):
        return
    kept = saved_seed_source(typed)
    if kept:
        data['seed_source'] = kept
        data['seed_source_other_specify'] = ''
