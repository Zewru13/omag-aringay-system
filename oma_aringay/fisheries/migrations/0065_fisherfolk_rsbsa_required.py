from django.db import migrations, models

import core.validators


def refuse_if_any_missing(apps, schema_editor):
    """Stop with a readable message instead of a database error if some
    fisherfolk still have no RSBSA number. They must be fixed or removed first,
    because the registry no longer accepts records without one."""
    Fisherfolk = apps.get_model('fisheries', 'Fisherfolk')
    missing = Fisherfolk.objects.filter(models.Q(rsbsa_number__isnull=True) | models.Q(rsbsa_number=''))
    count = missing.count()
    if count:
        ids = list(missing.values_list('id', flat=True)[:20])
        raise RuntimeError(
            f'{count} fisherfolk record(s) have no RSBSA number (ids: {ids}). '
            'Give each a valid RSBSA number or delete it, then run this migration again.'
        )


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0071_fisheriesdisasterreport_submission'),
    ]

    operations = [
        migrations.RunPython(refuse_if_any_missing, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='fisherfolk',
            name='rsbsa_number',
            field=models.CharField(max_length=50, unique=True, validators=[core.validators.validate_rsbsa]),
        ),
    ]
