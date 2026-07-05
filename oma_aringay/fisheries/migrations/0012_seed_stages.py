from django.db import migrations


# Stages defined per species. Each entry: (activity_name, application_days_list, priority, window_days, order)
# application_days is a list of days after stocking

STAGES_BY_SPECIES = {
    'Tilapia': [
        ('Pond Preparation',    [0],              'HIGH',   2, 1),
        ('Stocking',            [1],              'HIGH',   1, 2),
        ('Feeding',             [7, 30, 60, 90],  'HIGH',   3, 3),
        ('Water Quality Check', [14, 45, 75, 105],'MEDIUM', 3, 4),
        ('Sampling',            [30, 60, 90],     'MEDIUM', 3, 5),
        ('Pre-Harvest',         [110],            'MEDIUM', 3, 6),
        ('Harvesting',          [120],            'HIGH',   3, 7),
    ],
    'Bangus': [
        ('Pond Preparation',    [0],               'HIGH',   2, 1),
        ('Stocking',            [1],               'HIGH',   1, 2),
        ('Feeding',             [7, 30, 60, 90, 120], 'HIGH',  3, 3),
        ('Water Quality Check', [14, 45, 75, 105, 135], 'MEDIUM', 3, 4),
        ('Sampling',            [30, 60, 90, 120], 'MEDIUM', 3, 5),
        ('Pre-Harvest',         [140],             'MEDIUM', 3, 6),
        ('Harvesting',          [150],             'HIGH',   3, 7),
    ],
    'Hito': [
        ('Pond Preparation',    [0],              'HIGH',   2, 1),
        ('Stocking',            [1],              'HIGH',   1, 2),
        ('Feeding',             [7, 30, 60],      'HIGH',   3, 3),
        ('Water Quality Check', [14, 45, 75],     'MEDIUM', 3, 4),
        ('Sampling',            [30, 60],         'MEDIUM', 3, 5),
        ('Pre-Harvest',         [100],            'MEDIUM', 3, 6),
        ('Harvesting',          [105],            'HIGH',   3, 7),
    ],
    'Dalag': [
        ('Pond Preparation',    [0],              'HIGH',   2, 1),
        ('Stocking',            [1],              'HIGH',   1, 2),
        ('Feeding',             [7, 30, 60, 90],  'HIGH',   3, 3),
        ('Water Quality Check', [14, 45, 75, 105],'MEDIUM', 3, 4),
        ('Sampling',            [30, 60, 90],     'MEDIUM', 3, 5),
        ('Pre-Harvest',         [140],            'MEDIUM', 3, 6),
        ('Harvesting',          [150],            'HIGH',   3, 7),
    ],
    'Shrimp': [
        ('Pond Preparation',    [0],              'HIGH',   2, 1),
        ('Stocking',            [1],              'HIGH',   1, 2),
        ('Feeding',             [7, 21, 45, 75],  'HIGH',   3, 3),
        ('Water Quality Check', [14, 30, 60, 90], 'HIGH',   3, 4),
        ('Sampling',            [30, 60, 90],     'MEDIUM', 3, 5),
        ('Molting Check',       [45, 75],         'MEDIUM', 3, 6),
        ('Pre-Harvest',         [110],            'MEDIUM', 3, 7),
        ('Harvesting',          [120],            'HIGH',   3, 8),
    ],
    'Oyster': [
        ('Site Preparation',    [0],              'HIGH',   3, 1),
        ('Seeding / Stocking',  [1],              'HIGH',   2, 2),
        ('Water Quality Check', [30, 90, 150, 210], 'MEDIUM', 5, 3),
        ('Thinning / Cleaning', [60, 120, 180],   'MEDIUM', 5, 4),
        ('Growth Sampling',     [90, 150, 210],   'MEDIUM', 5, 5),
        ('Pre-Harvest',         [225],            'MEDIUM', 5, 6),
        ('Harvesting',          [240],            'HIGH',   5, 7),
    ],
}


def seed_stages(apps, schema_editor):
    SpeciesOption        = apps.get_model('fisheries', 'SpeciesOption')
    SpeciesActivityStage = apps.get_model('fisheries', 'SpeciesActivityStage')

    for species_name, stages in STAGES_BY_SPECIES.items():
        try:
            species = SpeciesOption.objects.get(species_name=species_name)
        except SpeciesOption.DoesNotExist:
            continue

        for activity_name, application_days, priority, window_days, order in stages:
            SpeciesActivityStage.objects.get_or_create(
                species_option=species,
                activity_name=activity_name,
                defaults={
                    'application_days':   application_days,
                    'day_after_stocking': min(application_days),
                    'priority':           priority,
                    'window_days':        window_days,
                    'order':              order,
                    'recommendation':     '',
                },
            )


def unseed_stages(apps, schema_editor):
    SpeciesOption        = apps.get_model('fisheries', 'SpeciesOption')
    SpeciesActivityStage = apps.get_model('fisheries', 'SpeciesActivityStage')
    species_names = list(STAGES_BY_SPECIES.keys())
    SpeciesActivityStage.objects.filter(
        species_option__species_name__in=species_names
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0011_seed_species'),
    ]

    operations = [
        migrations.RunPython(seed_stages, unseed_stages),
    ]
