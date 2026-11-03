from django.db import migrations

# The names are written out here (not imported) so this migration keeps doing what it did when it was written. They are the equipment names
# the organization forms offer, see interventions/equipment_defaults.py.
DEFAULTS = {
    'crop': (
        'Hand Tractor', 'Four-Wheel Tractor', 'Rice Thresher', 'Corn Sheller', 'Water Pump/Irrigation Pump', 'Knapsack Sprayer',
        'Power Sprayer', 'Rice Mill', 'Dryer', 'Storage Facility', 'Post-Harvest Equipment', 'Farm Tools (Shovel, Hoe, etc.)',
        'Harvesting Equipment', 'Seedling Tray', 'Greenhouse/Net House', 'Generator',
    ),
    'fisheries': (
        'Fishing Boat/Banca', 'Motorized Banca', 'Outboard Motor', 'Fish Cage', 'Fish Net (Gill Net)', 'Fish Net (Cast Net)',
        'Fish Net (Trawl Net)', 'Fishing Lines and Hooks', 'Fish Pond/Tank', 'Aerator/Air Pump', 'Water Pump', 'Life Vest/Safety Gear',
        'Ice Box/Cooler', 'Fish Weighing Scale', 'GPS/Navigation Equipment', 'Feeding Equipment', 'Harvesting Net', 'Generator',
    ),
}


def fill_equipment_types(apps, schema_editor):
    """An Equipment Types list with no names yet gets the organization forms' names; a list an Admin has already built is left as it is."""
    AssistanceOption = apps.get_model('interventions', 'AssistanceOption')
    for domain, names in DEFAULTS.items():
        if AssistanceOption.objects.filter(domain=domain, kind='equipment').exists():
            continue
        AssistanceOption.objects.bulk_create([AssistanceOption(domain=domain, kind='equipment', name=name) for name in names])


class Migration(migrations.Migration):

    dependencies = [
        ('interventions', '0023_assistance_type_units'),
    ]

    operations = [
        migrations.RunPython(fill_equipment_types, migrations.RunPython.noop),
    ]
