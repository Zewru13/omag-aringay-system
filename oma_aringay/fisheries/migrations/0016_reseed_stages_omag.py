from django.db import migrations


# Re-seed SpeciesActivityStage rows per OMAg field-form frequencies.
# Each stage uses a single row with the full application_days list.

def _range_list(start, stop, step):
    """Return [start, start+step, ...] while value <= stop."""
    days = []
    d = start
    while d <= stop:
        days.append(d)
        d += step
    return days


def _build_stages(duration):
    D = duration
    return [
        {
            'activity_name': 'Pond Preparation',
            'application_days': [0],
            'priority': 'HIGH',
            'order': 1,
        },
        {
            'activity_name': 'Stocking',
            'application_days': [1],
            'priority': 'HIGH',
            'order': 2,
        },
        {
            'activity_name': 'Feed Monitoring',
            'application_days': _range_list(7, D - 7, 7),
            'priority': 'HIGH',
            'order': 3,
            'recommendation': 'Check feed consumption and adjust ration to current biomass.',
        },
        {
            'activity_name': 'Water Quality Check',
            'application_days': _range_list(7, D - 7, 7),
            'priority': 'MEDIUM',
            'order': 4,
            'recommendation': (
                'Check water color, odor, and level; perform partial water change if deteriorating. '
                'Watch for disease signs and log Disease Control as needed.'
            ),
        },
        {
            'activity_name': 'Sampling',
            'application_days': _range_list(14, D - 14, 14),
            'priority': 'MEDIUM',
            'order': 5,
            'recommendation': 'Sample-weigh 30 pieces; record average body weight.',
        },
        {
            'activity_name': 'Pre-Harvest Inspection',
            'application_days': [D - 10] if D >= 10 else [0],
            'priority': 'MEDIUM',
            'order': 6,
        },
        {
            'activity_name': 'Harvesting',
            'application_days': [D],
            'priority': 'HIGH',
            'order': 7,
        },
    ]


def _build_oyster_stages(duration):
    D = duration
    return [
        {
            'activity_name': 'Pond Preparation',
            'application_days': [0],
            'priority': 'HIGH',
            'order': 1,
        },
        {
            'activity_name': 'Stocking',
            'application_days': [1],
            'priority': 'HIGH',
            'order': 2,
        },
        {
            'activity_name': 'Water Quality Check',
            'application_days': _range_list(7, D - 7, 7),
            'priority': 'MEDIUM',
            'order': 4,
            'recommendation': (
                'Check water color, odor, and level; perform partial water change if deteriorating. '
                'Watch for disease signs and log Disease Control as needed.'
            ),
        },
        {
            'activity_name': 'Sampling',
            'application_days': _range_list(14, D - 14, 14),
            'priority': 'MEDIUM',
            'order': 5,
            'recommendation': 'Sample-weigh 30 pieces; record average body weight.',
        },
        {
            'activity_name': 'Pre-Harvest Inspection',
            'application_days': [D - 10] if D >= 10 else [0],
            'priority': 'MEDIUM',
            'order': 6,
        },
        {
            'activity_name': 'Harvesting',
            'application_days': [D],
            'priority': 'HIGH',
            'order': 7,
        },
    ]


def reseed_stages(apps, schema_editor):
    SpeciesOption = apps.get_model('fisheries', 'SpeciesOption')
    SpeciesActivityStage = apps.get_model('fisheries', 'SpeciesActivityStage')

    for species in SpeciesOption.objects.all():
        # Wipe existing stages for this species
        SpeciesActivityStage.objects.filter(species_option=species).delete()

        if species.species_name == 'Oyster':
            stage_defs = _build_oyster_stages(species.culture_duration_days)
        else:
            stage_defs = _build_stages(species.culture_duration_days)

        for sd in stage_defs:
            application_days = sd.get('application_days', [0])
            SpeciesActivityStage.objects.create(
                species_option=species,
                activity_name=sd['activity_name'],
                application_days=application_days,
                day_after_stocking=min(application_days),
                priority=sd['priority'],
                window_days=3,
                order=sd['order'],
                recommendation=sd.get('recommendation', ''),
            )


def unseed_stages(apps, schema_editor):
    SpeciesOption = apps.get_model('fisheries', 'SpeciesOption')
    SpeciesActivityStage = apps.get_model('fisheries', 'SpeciesActivityStage')
    SpeciesActivityStage.objects.filter(
        species_option__in=SpeciesOption.objects.all()
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0015_fisherfolk_boatr_number_fisherfolk_is_aquaculture_and_more'),
    ]

    operations = [
        migrations.RunPython(reseed_stages, unseed_stages),
    ]
