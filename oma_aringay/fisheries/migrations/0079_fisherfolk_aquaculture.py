from django.db import migrations


def set_aquaculture(apps, schema_editor):
    """Every registered fisherfolk is Aquaculture: the ones with no type or 'Unspecified' (Not Yet Classified) become Aquaculture. A real type
    (Capture, Inland, Mariculture) is left as it is. Data only."""
    Fisherfolk = apps.get_model('fisheries', 'Fisherfolk')
    Fisherfolk.objects.filter(fisherfolk_type__in=['Unspecified', '']).update(fisherfolk_type='Aquaculture')


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0078_fingerlingsource'),
    ]

    operations = [
        migrations.RunPython(set_aquaculture, migrations.RunPython.noop),
    ]
