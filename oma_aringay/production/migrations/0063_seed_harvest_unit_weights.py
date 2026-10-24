from django.db import migrations

# The starting weights. Official ones carry their source; the corn sack is marked as not official.
SEEDS = [
    ('Metric Ton', None, '1000', 'Official: 1 metric ton = 1,000 kg.'),
    ('Cavan (50kg)', None, '50', 'Official: NFA Letter-Circular AO-2013-04-003, one cavan of rice or corn is 50 kg net.'),
    ('cavan', None, '50', 'Official: NFA Letter-Circular AO-2013-04-003, one cavan of rice or corn is 50 kg net.'),
    ('bags', None, '50', 'The 50 kg bag the harvest form has always labelled "Bags (50 kg/bag)".'),
    ('Sack', 'Corn (Mais)', '50', 'Not an official standard: a sack of corn trades as one 50 kg cavan (NFA).'),
]


def seed(apps, schema_editor):
    Weight = apps.get_model('production', 'HarvestUnitWeight')
    CropType = apps.get_model('production', 'CropType')
    for unit, crop_name, kg, note in SEEDS:
        crop = None
        if crop_name:
            crop = CropType.objects.filter(name=crop_name).first()
            if crop is None:
                continue
        Weight.objects.get_or_create(unit=unit, crop_type=crop, defaults={'kg_per_unit': kg, 'note': note})


def unseed(apps, schema_editor):
    Weight = apps.get_model('production', 'HarvestUnitWeight')
    for unit, crop_name, kg, note in SEEDS:
        Weight.objects.filter(unit=unit, crop_type__name=crop_name, note=note).delete() if crop_name else Weight.objects.filter(
            unit=unit, crop_type__isnull=True, note=note).delete()


class Migration(migrations.Migration):
    dependencies = [('production', '0062_harvest_unit_weights')]
    operations = [migrations.RunPython(seed, unseed)]
