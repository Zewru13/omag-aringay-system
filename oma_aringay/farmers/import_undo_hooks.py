"""Undo rule for the farm parcels an import created. (Registered once, from FarmersConfig.ready.)

A parcel goes away together with its crops, but only if they are exactly what the import made: a crop added or edited
afterwards, or any crop monitoring record on the parcel, keeps the parcel and says why. (Machinery and the like added to
the parcel afterwards are other records that depend on it, which already keeps it.)"""
from core.import_batches import fingerprint
from core.import_undo import register_cleanup
from core.models import ImportBatchItem


def _check(parcel):
    if parcel.monitoring_records.exists():
        return 'Crop records depend on it.'
    for crop in parcel.crops.all():
        recorded = ImportBatchItem.objects.filter(
            model_label='farmers.farmcrop', object_id=crop.pk, undone_at__isnull=True).values_list('fingerprint', flat=True)
        if fingerprint(crop) not in recorded:
            return 'A crop was added or changed after the import.'
    return None


def register():
    register_cleanup('farmers.farmparcel', check=_check, ignore_dependents=('FarmCrop',))
