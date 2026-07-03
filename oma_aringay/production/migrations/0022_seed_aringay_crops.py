from django.db import migrations


def seed_aringay_crops(apps, schema_editor):
    CropCategory = apps.get_model('production', 'CropCategory')
    CropSubcategory = apps.get_model('production', 'CropSubcategory')
    CropType = apps.get_model('production', 'CropType')

    # ── Categories ──────────────────────────────────────────────────────────
    staple, _     = CropCategory.objects.get_or_create(name='Staple Crops')
    high_value, _ = CropCategory.objects.get_or_create(name='High Value Crops')

    # ── Subcategories ────────────────────────────────────────────────────────
    cereals,    _ = CropSubcategory.objects.get_or_create(name='Cereals',          category=staple)
    root_crops, _ = CropSubcategory.objects.get_or_create(name='Root Crops',       category=staple)
    fruits,     _ = CropSubcategory.objects.get_or_create(name='Fruits',           category=high_value)
    vegetables, _ = CropSubcategory.objects.get_or_create(name='Vegetables',       category=high_value)
    industrial, _ = CropSubcategory.objects.get_or_create(name='Industrial Crops', category=high_value)

    # ── 19 Official Crops of Aringay ─────────────────────────────────────────
    # update_or_create on name so wrong days_to_harvest from old seed get corrected.
    crops = [
        ('Palay (Rice)',       staple,     cereals,    110),
        ('Corn (Mais)',        staple,     cereals,     90),
        ('Kamote',             staple,     root_crops,  90),
        ('Cassava',            staple,     root_crops, 270),
        ('Watermelon',         high_value, fruits,      90),
        ('Mango',              high_value, fruits,     120),
        ('Banana (Saging)',    high_value, fruits,     365),
        ('Ampalaya',           high_value, vegetables,  55),
        ('Cabbage',            high_value, vegetables,  80),
        ('Eggplant (Talong)',  high_value, vegetables,  75),
        ('Garlic',             high_value, vegetables,  90),
        ('Onion',              high_value, vegetables, 100),
        ('Pechay',             high_value, vegetables,  30),
        ('Rabong',             high_value, vegetables,  21),
        ('Sitaw',              high_value, vegetables,  60),
        ('Cacao',              high_value, industrial, 180),
        ('Coffee (Kape)',      high_value, industrial, 365),
        ('Ginger',             high_value, industrial, 180),
        ('Tobacco',            high_value, industrial,  90),
    ]

    for name, category, subcategory, days in crops:
        CropType.objects.update_or_create(
            name=name,
            defaults={
                'days_to_harvest': days,
                'category':        category,
                'subcategory':     subcategory,
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0021_add_farmer_farm_location_land_status_to_monitoring'),
    ]

    operations = [
        migrations.RunPython(seed_aringay_crops, migrations.RunPython.noop),
    ]
