from django.db import migrations

# Written out here (not imported) so this migration keeps doing what it did when it was written. They are the grades of
# production/fertilizer_defaults.py (the DA Fertilizer and Pesticide Authority price bulletins).
DESCRIPTION = 'Common grade listed in the DA Fertilizer and Pesticide Authority price bulletins.'
NAMES = (
    'Urea (46-0-0)',
    'Ammosul - Ammonium Sulfate (21-0-0)',
    'Complete (14-14-14)',
    'Ammophos (16-20-0)',
    'Muriate of Potash (0-0-60)',
    'DAP - Diammonium Phosphate (18-46-0)',
)


def fill_fertilizer_types(apps, schema_editor):
    """Crop Settings > Input Types starts with the common fertilizer grades. A Fertilizer list with something in it is left as it is, and a
    name already used by another category is skipped (names are unique)."""
    CropInputType = apps.get_model('production', 'CropInputType')
    if CropInputType.objects.filter(input_type='Fertilizer').exists():
        return
    taken = set(CropInputType.objects.values_list('name', flat=True))
    CropInputType.objects.bulk_create([
        CropInputType(name=name, description=DESCRIPTION, input_type='Fertilizer', is_active=True) for name in NAMES if name not in taken
    ])


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0066_seed_quantity_unit_any'),
    ]

    operations = [
        migrations.RunPython(fill_fertilizer_types, migrations.RunPython.noop),
    ]
