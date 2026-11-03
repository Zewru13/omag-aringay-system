"""Harvest unit weights set for several crops at once. A group is one unit with one weight and a note for any number of crops (none chosen =
every crop); underneath it stays one HarvestUnitWeight row per unit and crop, so the lookup in unit_weights.py is untouched. Adding, changing
and deleting a group is all-or-nothing."""
from django.db import transaction
from rest_framework import serializers

from .models import CropType, HarvestUnitWeight
from .serializers import HarvestUnitWeightSerializer


def _clean(unit, kg_per_unit, note):
    """The unit, weight and note as the single-row form validates them; errors keyed by the field, as the screen shows them."""
    ser = HarvestUnitWeightSerializer()
    try:
        name = ser.validate_unit(ser.fields['unit'].run_validation(unit))
    except serializers.ValidationError as exc:
        raise serializers.ValidationError({'unit': exc.detail}) from exc
    try:
        kg = ser.validate_kg_per_unit(ser.fields['kg_per_unit'].run_validation(kg_per_unit if kg_per_unit != '' else None))
    except serializers.ValidationError as exc:
        raise serializers.ValidationError({'kg_per_unit': exc.detail}) from exc
    try:
        text = ser.fields['note'].run_validation((note or '').strip())
    except serializers.ValidationError as exc:
        raise serializers.ValidationError({'note': exc.detail}) from exc
    return name, kg, text


@transaction.atomic
def save_group(ids, unit, kg_per_unit, note, crop_ids):
    """Make the rows `ids` (none for a new group) into the unit for exactly the crops `crop_ids` ([] = every crop): rows of crops that
    stay are updated, rows of crops that left are deleted, crops that joined get new rows. Returns the group's rows."""
    name, kg, text = _clean(unit, kg_per_unit, note)
    wanted = list(dict.fromkeys(crop_ids)) or [None]
    crops = {c.pk: c for c in CropType.objects.filter(pk__in=[c for c in wanted if c is not None])}
    if any(c is not None and c not in crops for c in wanted):
        raise serializers.ValidationError({'crop_types': ['Choose crops from the list.']})
    mine = list(HarvestUnitWeight.objects.select_for_update().filter(pk__in=ids))
    if len(mine) != len(set(ids)):
        raise serializers.ValidationError({'detail': 'Some of these unit weights no longer exist. Reload the page.'})

    taken = HarvestUnitWeight.objects.filter(unit__iexact=name).exclude(pk__in=[r.pk for r in mine])
    clashes = [r for r in taken if r.crop_type_id in wanted]
    if clashes:
        where = ', '.join(sorted('every crop' if r.crop_type_id is None else r.crop_type.name for r in clashes))
        raise serializers.ValidationError({'unit': f'"{name}" already has a weight for {where}. Edit that row instead.'})

    by_crop = {r.crop_type_id: r for r in mine}
    for crop_id, row in by_crop.items():
        if crop_id not in wanted:
            row.delete()
    rows = []
    for crop_id in wanted:
        row = by_crop.get(crop_id) or HarvestUnitWeight(crop_type=crops.get(crop_id))
        row.unit, row.kg_per_unit, row.note = name, kg, text
        row.save()
        rows.append(row)
    return rows


@transaction.atomic
def delete_group(ids):
    HarvestUnitWeight.objects.filter(pk__in=ids).delete()
