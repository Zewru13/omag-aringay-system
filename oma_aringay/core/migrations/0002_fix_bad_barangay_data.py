from django.db import migrations


def fix_bad_barangays(apps, schema_editor):
    Farmer = apps.get_model('farmers', 'Farmer')
    Fisherfolk = apps.get_model('fisheries', 'Fisherfolk')
    StockingRecord = apps.get_model('fisheries', 'StockingRecord')
    FarmersAssociation = apps.get_model('associations', 'FarmersAssociation')

    REplacements = [
        # (model, id, field, old, new)
        (Farmer,              9,   'barangay',                'Pangao-Aoan West', 'Pangao-aoan West'),
        (Farmer,              131, 'barangay',                'San Juan',         'San Juan East'),
        (Farmer,              136, 'barangay',                'San Juan',         'San Juan East'),
        (Farmer,              141, 'barangay',                'San Juan',         'San Juan East'),
        (Farmer,              146, 'barangay',                'San Juan',         'San Juan East'),
        (Farmer,              151, 'barangay',                'San Juan',         'San Juan East'),
        (Farmer,              156, 'barangay',                'San Juan',         'San Juan East'),
        (Fisherfolk,          7,   'barangay',                'Pangao-Aoan West', 'Pangao-aoan West'),
        (Fisherfolk,          8,   'barangay',                'Dinaoyan',         'Samara'),
        (StockingRecord,      3,   'pond_location_barangay',  'Dinaoyan',         'Samara'),
        (FarmersAssociation,  1,   'barangay',                'Planas',           'Poblacion'),
        (FarmersAssociation,  25,  'barangay',                'San Juan',         'San Juan East'),
    ]

    for Model, pk, field, old, new in REplacements:
        Model.objects.filter(pk=pk, **{field: old}).update(**{field: new})


def reverse_fix(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_drop_infrastructure_tables'),
        ('associations', '0011_correct_barangay_choices'),
        ('farmers', '0011_correct_barangay_choices'),
        ('fisheries', '0020_correct_barangay_choices'),
        ('monitoring', '0011_correct_barangay_choices'),
        ('production', '0029_correct_barangay_choices'),
    ]

    operations = [
        migrations.RunPython(fix_bad_barangays, reverse_fix),
    ]
