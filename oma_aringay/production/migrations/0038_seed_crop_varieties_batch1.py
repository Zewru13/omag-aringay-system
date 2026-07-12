import re

from django.db import migrations

# Batch 1 variety seed. Palay (rice) is confirmed real (NSIC/PSB registered
# varieties). Cassava and Sweet Potato have real registered varieties too.
# Everything else below is PROVISIONAL — commonly-known local/trade names
# that OMAg still needs to confirm/correct. All varieties are Admin-editable
# from the Crop Variety Management screen, so provisional entries can be
# fixed in place without another migration.
#
# (keyword, [variety names]) — keyword is matched against CropType.name with
# the same \b word-boundary regex as migration 0036, so "palay" cannot match
# inside "Ampalaya" (the Batch B bug this deliberately avoids).
CROP_VARIETY_MAP = [
    ('palay', [
        'NSIC Rc216 (Tubigan 17)',
        'NSIC Rc222 (Tubigan 18)',
        'NSIC Rc238',
        'NSIC Rc300',
        'NSIC Rc402',
        'PSB Rc10 (Rio Grande)',
    ]),
    ('corn', [
        'IPB Var 6',
        'Tiniguib (Native White)',
        'Sweet Corn Hybrid',
        'Yellow Flint Hybrid',
    ]),
    ('cassava', [
        'Golden Yellow',
        'Lakan 1',
        'KU50',
        'Rayong',
    ]),
    ('kamote', [
        'NSIC SP (VSP-1)',
        'VSP-2',
        'Bureau (BNAS) Types',
        'Native Purple',
    ]),
    ('tomato', [
        'Diamante Max',
        'Apollo',
        'Native (Tomato)',
    ]),
    ('eggplant', [
        'Casino',
        'Mistisa',
        'Native Long Purple',
    ]),
    ('watermelon', [
        'Sweet Beauty',
        'Jubilee',
        'Native (Watermelon)',
    ]),
    ('mango', [
        'Carabao (Manila Super)',
        'Pico',
    ]),
    ('banana', [
        'Lakatan',
        'Latundan',
        'Saba',
        'Cavendish',
    ]),
    ('ampalaya', [
        'Galaxy',
        'Jade Star',
        'Native (Ampalaya)',
    ]),
    ('cabbage', [
        'Scorpio',
        'Rareball',
        'Native (Cabbage)',
    ]),
    ('garlic', [
        'Ilocos Native (Batanes)',
        'Mindoro',
    ]),
    ('onion', [
        'Red Creole',
        'Yellow Granex',
        'Native Red',
    ]),
    ('pechay', [
        'Black Behi',
        'Native Pechay',
    ]),
    ('rabong', [
        'Native (Rabong)',
    ]),
    ('sitaw', [
        'CES Pole Sitaw',
        'Native (Sitaw)',
    ]),
    ('cacao', [
        'UF18',
        'BR25',
        'Native (Cacao)',
    ]),
    ('coffee', [
        'Robusta',
        'Arabica',
        'Excelsa',
    ]),
    ('ginger', [
        'Native (Halaya)',
        'Imugan',
    ]),
    ('tobacco', [
        'Virginia',
        'Burley',
        'Native (Tobacco)',
    ]),
]

# The two varieties seeded in 0036 under bare names get renamed to their
# fuller Batch 1 names instead of being duplicated.
RENAME_MAP = {
    'NSIC Rc222': 'NSIC Rc222 (Tubigan 18)',
    'NSIC Rc216': 'NSIC Rc216 (Tubigan 17)',
}


def _keyword_match(name, keyword):
    return re.search(r'\b' + re.escape(keyword) + r'\b', name, flags=re.IGNORECASE) is not None


def seed_forward(apps, schema_editor):
    CropType = apps.get_model('production', 'CropType')
    CropVariety = apps.get_model('production', 'CropVariety')

    for old_name, new_name in RENAME_MAP.items():
        CropVariety.objects.filter(name=old_name).update(name=new_name)

    all_crop_types = list(CropType.objects.all())

    for keyword, variety_names in CROP_VARIETY_MAP:
        # Attach to every CropType whose name matches the keyword — some
        # crops (Kamote, Sitaw, Cacao) currently have duplicate CropType rows
        # left over from earlier data cleanup, so seed both to avoid leaving
        # one duplicate with an empty variety dropdown.
        matches = [ct for ct in all_crop_types if _keyword_match(ct.name, keyword)]
        if not matches:
            continue
        for crop_type in matches:
            for name in variety_names:
                CropVariety.objects.get_or_create(
                    name=name, defaults={'crop_type': crop_type, 'is_active': True},
                )


def seed_reverse(apps, schema_editor):
    CropVariety = apps.get_model('production', 'CropVariety')
    all_names = [name for _, names in CROP_VARIETY_MAP for name in names]
    CropVariety.objects.filter(name__in=all_names).delete()
    for old_name, new_name in RENAME_MAP.items():
        CropVariety.objects.filter(name=new_name).update(name=old_name)


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0037_alter_cropmonitoringrecord_seed_source'),
    ]

    operations = [
        migrations.RunPython(seed_forward, reverse_code=seed_reverse),
    ]
