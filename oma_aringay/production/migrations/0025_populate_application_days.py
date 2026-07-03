from django.db import migrations


def populate_application_days(apps, schema_editor):
    CropActivityStage = apps.get_model('production', 'CropActivityStage')
    for stage in CropActivityStage.objects.all():
        if not stage.application_days:
            stage.application_days = [stage.day_after_planting]
            stage.save(update_fields=['application_days'])


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0024_add_application_days'),
    ]

    operations = [
        migrations.RunPython(populate_application_days, migrations.RunPython.noop),
    ]
