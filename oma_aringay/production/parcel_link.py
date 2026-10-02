"""Decide which of a farmer's registered parcels a crop monitoring record sits on.

A monitoring record may carry an optional farm_parcel, but the record form and
the crop-record import never filled it in, so no record was linked to a parcel
(the parcel's own "Crop Monitoring Records" list, and the citizen Home's parcel
count, were always empty). This links a record only when the answer is
unambiguous: exactly ONE of the farmer's parcels declares this crop (and lies in
the record's barangay, when both are known). Anything with zero or several
candidates is left unlinked for a person to choose.
"""
import re

from farmers.models import FarmParcel


def _crop_keys(name):
    """A crop's comparable spellings: the full name plus the text before and
    inside a trailing parenthesis, so "Bitter Gourd (Ampalaya)" lines up with
    the catalog's "Ampalaya" and "Palay (Rice)" with itself."""
    n = (name or '').strip().lower()
    keys = {n} if n else set()
    m = re.match(r'^(.*?)\s*\((.*?)\)\s*$', n)
    if m:
        keys.update(k.strip() for k in m.groups() if k.strip())
    return keys


def same_crop(a, b):
    return bool(_crop_keys(a) & _crop_keys(b))


def declared_crop_name(farm_crop):
    return farm_crop.crop_name_other if farm_crop.crop_name == 'Other' else farm_crop.crop_name


def infer_farm_parcel(farmer_id, crop_type_name, barangay=''):
    """The farmer's single matching parcel, or None when there is not exactly one."""
    if not farmer_id or not crop_type_name:
        return None
    wanted_barangay = (barangay or '').strip().lower()
    matches = []
    for parcel in FarmParcel.objects.filter(farmer_id=farmer_id).prefetch_related('crops'):
        if wanted_barangay and parcel.barangay and parcel.barangay.strip().lower() != wanted_barangay:
            continue
        if any(same_crop(declared_crop_name(c), crop_type_name) for c in parcel.crops.all()):
            matches.append(parcel)
    return matches[0] if len(matches) == 1 else None
