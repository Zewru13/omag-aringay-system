import re

from django.db import migrations

# Provisional Philippine-standard Unit of Measure defaults per crop.
# OMAg should confirm these against local convention before relying on them.
UNIT_KEYWORD_MAP = [
    ('palay',     ['Cavan (50kg)', 'kg', 'Metric Ton']),
    ('corn',      ['kg', 'Sack', 'Metric Ton']),
    ('cassava',   ['kg', 'Sack']),
    ('kamote',    ['kg', 'Sack']),
    ('watermelon', ['kg', 'Piece']),
    ('mango',     ['kg', 'Piece']),
    ('banana',    ['kg', 'Piece', 'Hand']),
    ('pechay',    ['kg', 'Bundle']),
    ('cabbage',   ['kg', 'Bundle']),
    ('ampalaya',  ['kg', 'Bundle']),
    ('eggplant',  ['kg', 'Bundle']),
    ('sitaw',     ['kg', 'Bundle']),
    ('rabong',    ['kg', 'Bundle']),
    ('garlic',    ['kg', 'Sack']),
    ('onion',     ['kg', 'Sack']),
    ('cacao',     ['kg']),
    ('coffee',    ['kg']),
    ('ginger',    ['kg', 'Sack']),
    ('tobacco',   ['kg', 'Bundle']),
    ('tomato',    ['kg', 'Crate']),
]

SEED_SOURCES = ['DA', 'Own Saved Seed', 'Local Market', 'LGU/Governor\'s Office']

PALAY_VARIETIES = ['NSIC Rc222', 'NSIC Rc216']


def _keyword_match(name, keyword):
    # Word-boundary match — plain substring matching would let "palay" match
    # inside "Ampalaya", which is wrong. \b treats non-word characters
    # (spaces, parentheses) as boundaries, so "(Sitaw)" still matches "sitaw".
    return re.search(r'\b' + re.escape(keyword) + r'\b', name, flags=re.IGNORECASE) is not None


def seed_forward(apps, schema_editor):
    CropType = apps.get_model('production', 'CropType')
    SeedSource = apps.get_model('production', 'SeedSource')
    CropVariety = apps.get_model('production', 'CropVariety')

    for crop_type in CropType.objects.all():
        matched = None
        for keyword, units in UNIT_KEYWORD_MAP:
            if _keyword_match(crop_type.name, keyword):
                matched = units
                break
        crop_type.allowed_units = matched or ['kg']
        crop_type.save(update_fields=['allowed_units'])

    for name in SEED_SOURCES:
        SeedSource.objects.get_or_create(name=name, defaults={'is_active': True})

    palay = next(
        (ct for ct in CropType.objects.all() if _keyword_match(ct.name, 'palay')),
        None,
    )
    for name in PALAY_VARIETIES:
        CropVariety.objects.get_or_create(
            name=name, defaults={'crop_type': palay, 'is_active': True},
        )


def seed_reverse(apps, schema_editor):
    SeedSource = apps.get_model('production', 'SeedSource')
    CropVariety = apps.get_model('production', 'CropVariety')
    SeedSource.objects.filter(name__in=SEED_SOURCES).delete()
    CropVariety.objects.filter(name__in=PALAY_VARIETIES).delete()
    # allowed_units left as-is on reverse — not worth reconstructing blank state


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0035_seedsource_croptype_allowed_units_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_forward, reverse_code=seed_reverse),
    ]
