from django.db import migrations


def convert_seaweed_farm_to_other(apps, schema_editor):
    AquacultureRecord = apps.get_model('fisheries', 'AquacultureRecord')
    AquacultureRecord.objects.filter(culture_type='Seaweed Farm').update(culture_type='Other')


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0002_fisherfolk_prefix_aquaculture_choices_vessel_material_vendor_location'),
    ]

    operations = [
        migrations.RunPython(convert_seaweed_farm_to_other, migrations.RunPython.noop),
    ]
