from django.db import migrations

# Type of Seed, Type of Fertilizer, Type of Feed and Type of Fingerlings used to be read from the crops, the Fertilizer Input Types, the Feed
# Types and the Species. They are lists of their own now (Assistance Settings), copied once from those. A list that already has names is left
# as it is, so this is safe to run again.
COPIES = (
    # (domain, kind, app, model, name field, extra filter)
    ('crop', 'seed', 'production', 'CropType', 'name', {'is_active': True}),
    ('crop', 'fertilizer', 'production', 'CropInputType', 'name', {'is_active': True, 'input_type': 'Fertilizer'}),
    ('fisheries', 'feed', 'fisheries', 'FeedType', 'name', {}),
    ('fisheries', 'fingerling', 'fisheries', 'SpeciesOption', 'species_name', {}),
)


def copy_lists(apps, schema_editor):
    AssistanceOption = apps.get_model('interventions', 'AssistanceOption')
    for domain, kind, app, model, field, extra in COPIES:
        if AssistanceOption.objects.filter(domain=domain, kind=kind).exists():
            continue
        names = sorted({n.strip() for n in apps.get_model(app, model).objects.filter(**extra).values_list(field, flat=True) if n and n.strip()}, key=str.lower)
        AssistanceOption.objects.bulk_create([AssistanceOption(domain=domain, kind=kind, name=name[:150]) for name in names])


class Migration(migrations.Migration):

    dependencies = [
        ('interventions', '0026_assistance_custom_type'),
        ('production', '0067_fill_fertilizer_types'),
        ('fisheries', '0079_fisherfolk_aquaculture'),
    ]

    operations = [
        migrations.RunPython(copy_lists, migrations.RunPython.noop),
    ]
