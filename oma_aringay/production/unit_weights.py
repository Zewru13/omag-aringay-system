"""
Harvest units and their weight in kg (Settings > Harvest Units).

A harvest is typed in the unit it was counted in (20 sacks) and saved in kg. `weight_for` finds the kg one unit weighs for a crop:
the row for that crop first, then the row for the unit with no crop; None when there is no standard weight (the form then asks for
the total kg). "kg" is built in. `apply_unit_weight` is what the harvest serializers call to turn a quantity into volume_kg.
"""
from decimal import Decimal

from rest_framework import serializers

from .models import HarvestUnitWeight

KG = 'kg'


def weight_for(unit, crop_type_id=None):
    """The kg one `unit` weighs for the crop (Decimal), or None when it has no standard weight."""
    name = ' '.join(str(unit or KG).split())
    if name.lower() == KG:
        return Decimal(1)
    rows = list(HarvestUnitWeight.objects.filter(unit__iexact=name))
    if crop_type_id:
        for row in rows:
            if row.crop_type_id == crop_type_id:
                return row.kg_per_unit           # the crop's own row wins, even when it says "no standard weight"
    for row in rows:
        if row.crop_type_id is None:
            return row.kg_per_unit
    return None


def apply_unit_weight(data, instance, record):
    """Turn what was counted into kg. With a quantity_harvested: the unit's weight x the quantity becomes volume_kg (and the weight is
    kept as kg_per_unit); a unit with no standard weight needs the total weight typed as volume_kg. Without a quantity (an older client,
    or an edit that does not touch the quantity) nothing changes: volume_kg is whatever was sent."""
    unit = data.get('unit_of_measure', getattr(instance, 'unit_of_measure', '')) or KG
    quantity = data.get('quantity_harvested')
    if quantity is None and instance is not None and instance.quantity_harvested is not None and 'unit_of_measure' in data \
            and (data.get('unit_of_measure') or KG) != (instance.unit_of_measure or KG):
        quantity = instance.quantity_harvested        # only the unit changed: count the same quantity in the new unit
    if quantity is None:
        if instance is None and data.get('volume_kg') is None:
            raise serializers.ValidationError({'volume_kg': 'This field is required.'})
        return data
    crop_type_id = record.crop_type_id if record is not None else None
    weight = weight_for(unit, crop_type_id)
    if weight is not None:
        data['volume_kg'] = (Decimal(quantity) * weight).quantize(Decimal('0.01'))
        data['kg_per_unit'] = weight
    else:
        total = data.get('volume_kg')
        if total is None or total <= 0:
            raise serializers.ValidationError({'volume_kg': f'"{unit}" has no standard weight: enter the total weight in kg.'})
        data['kg_per_unit'] = None
    data['quantity_harvested'] = quantity
    return data
