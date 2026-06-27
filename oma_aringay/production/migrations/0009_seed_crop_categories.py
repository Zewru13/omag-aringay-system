from django.db import migrations


SEED_DATA = [
    {
        'name': 'High Value Crops',
        'subcategories': ['Fruits', 'Vegetables and Others', 'Industrial Crops'],
    },
    {
        'name': 'Staple Crops',
        'subcategories': ['Grains', 'Root Crops'],
    },
]


def seed_categories(apps, schema_editor):
    CropCategory = apps.get_model('production', 'CropCategory')
    CropSubcategory = apps.get_model('production', 'CropSubcategory')

    for entry in SEED_DATA:
        cat, _ = CropCategory.objects.get_or_create(name=entry['name'])
        for sub_name in entry['subcategories']:
            CropSubcategory.objects.get_or_create(name=sub_name, category=cat)


def unseed_categories(apps, schema_editor):
    CropCategory = apps.get_model('production', 'CropCategory')
    CropCategory.objects.filter(name__in=[d['name'] for d in SEED_DATA]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0008_cropcategory_croptype_suggested_activities_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_categories, reverse_code=unseed_categories),
    ]
