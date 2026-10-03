from django.db import migrations, models


def backfill_force_harvest(apps, schema_editor):
    """Until now a harvest record could only be linked to production units through Force Harvest
    (the serializer rejected any unit not under Force Harvest), so exactly those records are Force
    Harvests. Records without linked units stay False. No unit links are added or changed."""
    FisheriesHarvestRecord = apps.get_model('fisheries', 'FisheriesHarvestRecord')
    ids = list(
        FisheriesHarvestRecord.objects.filter(production_units__isnull=False)
        .values_list('id', flat=True).distinct()
    )
    FisheriesHarvestRecord.objects.filter(id__in=ids).update(is_force_harvest=True)


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0067_fisheriesharvestrecord_production_units'),
    ]

    operations = [
        migrations.AddField(
            model_name='fisheriesharvestrecord',
            name='is_force_harvest',
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(backfill_force_harvest, migrations.RunPython.noop),
    ]
