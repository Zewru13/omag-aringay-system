from django.db import migrations


def blank_fishr_to_null(apps, schema_editor):
    Fisherfolk = apps.get_model('fisheries', 'Fisherfolk')
    Fisherfolk.objects.filter(fishr_number='').update(fishr_number=None)


def null_fishr_to_blank(apps, schema_editor):
    Fisherfolk = apps.get_model('fisheries', 'Fisherfolk')
    Fisherfolk.objects.filter(fishr_number__isnull=True).update(fishr_number='')


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0024_alter_fisherfolk_prefix'),
    ]

    operations = [
        migrations.RunPython(blank_fishr_to_null, reverse_code=null_fishr_to_blank),
    ]
