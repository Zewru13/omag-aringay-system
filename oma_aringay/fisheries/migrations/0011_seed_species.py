from django.db import migrations


SPECIES_DATA = [
    # (species_name, category_name, culture_environment, culture_duration_days, default_survival_rate_pct, default_avg_body_weight_kg)
    ('Tilapia',  'Finfish',     'Freshwater',    120, '80.00', '0.250'),
    ('Bangus',   'Finfish',     'Brackishwater', 150, '85.00', '0.350'),
    ('Hito',     'Finfish',     'Freshwater',    105, '75.00', '0.300'),
    ('Dalag',    'Finfish',     'Freshwater',    150, '70.00', '0.400'),
    ('Shrimp',   'Crustacean',  'Brackishwater', 120, '60.00', '0.030'),
    ('Oyster',   'Mollusk',     'Brackishwater', 240, '70.00', '0.080'),
]


def seed_species(apps, schema_editor):
    SpeciesCategory = apps.get_model('fisheries', 'SpeciesCategory')
    SpeciesOption   = apps.get_model('fisheries', 'SpeciesOption')

    category_names = {'Finfish', 'Crustacean', 'Mollusk'}
    categories = {}
    for name in category_names:
        cat, _ = SpeciesCategory.objects.get_or_create(name=name)
        categories[name] = cat

    for species_name, cat_name, env, duration, survival, weight in SPECIES_DATA:
        SpeciesOption.objects.get_or_create(
            species_name=species_name,
            defaults={
                'category':                  categories[cat_name],
                'culture_environment':       env,
                'culture_duration_days':     duration,
                'default_survival_rate_pct': survival,
                'default_avg_body_weight_kg': weight,
            },
        )


def unseed_species(apps, schema_editor):
    SpeciesOption   = apps.get_model('fisheries', 'SpeciesOption')
    SpeciesCategory = apps.get_model('fisheries', 'SpeciesCategory')
    SpeciesOption.objects.filter(species_name__in=[s[0] for s in SPECIES_DATA]).delete()
    SpeciesCategory.objects.filter(name__in=['Finfish', 'Crustacean', 'Mollusk']).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0010_speciescategory_speciesoption_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_species, unseed_species),
    ]
