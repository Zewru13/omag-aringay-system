from django.db import migrations


CROP_TYPES = [
    ('Palay (Rice)',              110, 4000),
    ('Corn (Mais)',               85,  3500),
    ('Tomato',                    70,  20000),
    ('Eggplant (Talong)',         65,  None),
    ('Mango',                     120, 8000),
    ('Banana (Saging)',           300, None),
    ('Cacao (Kakaw)',             150, None),
    ('Coffee (Kape)',             180, None),
    ('Onion',                     90,  15000),
    ('Pechay',                    30,  12000),
    ('Cabbage',                   60,  None),
    ('Cassava',                   270, None),
    ('Sweet Potato (Kamote)',     120, None),
    ('Bitter Gourd (Ampalaya)',   55,  None),
    ('String Beans (Sitaw)',      60,  None),
    ('Garlic',                    90,  None),
]


def seed_crop_types(apps, schema_editor):
    CropType = apps.get_model('production', 'CropType')
    for name, days, yield_kg in CROP_TYPES:
        CropType.objects.get_or_create(
            name=name,
            defaults={'days_to_harvest': days, 'yield_per_ha_kg': yield_kg},
        )


def unseed_crop_types(apps, schema_editor):
    CropType = apps.get_model('production', 'CropType')
    CropType.objects.filter(name__in=[row[0] for row in CROP_TYPES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0004_monitoring_models'),
    ]

    operations = [
        migrations.RunPython(seed_crop_types, unseed_crop_types),
    ]
