from django.db import migrations, models

# Real training courses the offices run, written out here (not imported) so this migration keeps doing what it did when it was written.
# Sources: ATI (Agricultural Training Institute) training services, BFAR extension and training services, and TESDA training regulations
# (Agriculture, Forestry and Fishery sector). An Admin or Focal Person can add to, rename or delete these in Assistance Settings.
DEFAULTS = {
    'crop': (
        'Agricultural Crops Production (TESDA NC II)', 'Agricultural Machinery Operation (TESDA NC II)', 'Agro-Entrepreneurship (TESDA NC II)',
        'Farm Business School', 'Farmer-Scientist Training Program (FSTP)', "Farmers' Field School (FFS)", 'Good Agricultural Practices (GAP)',
        'Grains Production (TESDA NC II)', 'Integrated Pest Management (IPM)', 'Organic Agriculture Internal Control System (ICS)',
        'Organic Agriculture Production (TESDA NC II)', 'Rice Production Training',
    ),
    'fisheries': (
        'Aquaculture (Grow-Out Operation) (TESDA NC II)', 'Fish Breeding and Feeding', 'Fish Cage Construction and Tilapia Farming',
        'Fish Capture (TESDA NC II)', 'Fish Processing and Value-Adding', 'Fish Products Packaging (TESDA NC II)', 'Milkfish Aquaculture',
        'Organic Tilapia Aquaculture', 'Post-Harvest Handling of Fish', 'Tilapia Production',
    ),
}


def fill_training_types(apps, schema_editor):
    """A Types of Training list with no names yet gets the courses above; a list an Admin has already built is left as it is."""
    AssistanceOption = apps.get_model('interventions', 'AssistanceOption')
    for domain, names in DEFAULTS.items():
        if AssistanceOption.objects.filter(domain=domain, kind='training').exists():
            continue
        AssistanceOption.objects.bulk_create([AssistanceOption(domain=domain, kind='training', name=name) for name in names])


class Migration(migrations.Migration):

    dependencies = [
        ('interventions', '0024_equipment_type_defaults'),
    ]

    operations = [
        migrations.AddField(
            model_name='beneficiaryrecord',
            name='training_type',
            field=models.CharField(blank=True, max_length=150),
        ),
        migrations.AddField(
            model_name='fisherfolkbeneficiaryrecord',
            name='training_type',
            field=models.CharField(blank=True, max_length=150),
        ),
        migrations.RunPython(fill_training_types, migrations.RunPython.noop),
    ]
