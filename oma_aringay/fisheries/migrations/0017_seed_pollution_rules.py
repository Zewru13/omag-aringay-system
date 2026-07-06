from django.db import migrations


# Pollution Incident response rules per OMAg guidance.
POLLUTION_RULES = [
    (
        'Pollution Incident',
        'Water Quality Check',
        'Test and document water condition immediately; identify and report the pollution source to OMAg/BFAR.',
        'HIGH',
    ),
    (
        'Pollution Incident',
        'Field Monitoring',
        'Suspend water intake from the affected source; isolate unaffected units.',
        'HIGH',
    ),
    (
        'Pollution Incident',
        'Harvesting',
        'Assess stock safety; emergency-harvest marketable stock only if declared safe for consumption.',
        'MEDIUM',
    ),
]


def seed_pollution_rules(apps, schema_editor):
    FisheriesDisasterResponseRule = apps.get_model('fisheries', 'FisheriesDisasterResponseRule')

    for disaster_type, title, action, priority in POLLUTION_RULES:
        FisheriesDisasterResponseRule.objects.get_or_create(
            disaster_type=disaster_type,
            title=title,
            defaults={
                'action': action,
                'priority': priority,
                'species': None,
            },
        )


def unseed_pollution_rules(apps, schema_editor):
    FisheriesDisasterResponseRule = apps.get_model('fisheries', 'FisheriesDisasterResponseRule')
    titles = [r[1] for r in POLLUTION_RULES]
    FisheriesDisasterResponseRule.objects.filter(
        title__in=titles,
        species__isnull=True,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0016_reseed_stages_omag'),
    ]

    operations = [
        migrations.RunPython(seed_pollution_rules, unseed_pollution_rules),
    ]
