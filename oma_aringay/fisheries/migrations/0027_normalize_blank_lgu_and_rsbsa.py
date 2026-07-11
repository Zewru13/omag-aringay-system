from django.db import migrations


def blank_to_null(apps, schema_editor):
    Fisherfolk = apps.get_model('fisheries', 'Fisherfolk')
    Fisherfolk.objects.filter(lgu_registration_number='').update(lgu_registration_number=None)
    Fisherfolk.objects.filter(rsbsa_number='').update(rsbsa_number=None)


def null_to_blank(apps, schema_editor):
    Fisherfolk = apps.get_model('fisheries', 'Fisherfolk')
    Fisherfolk.objects.filter(lgu_registration_number__isnull=True).update(lgu_registration_number='')
    Fisherfolk.objects.filter(rsbsa_number__isnull=True).update(rsbsa_number='')


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0026_alter_fisherfolk_fishr_number_and_more'),
    ]

    operations = [
        migrations.RunPython(blank_to_null, reverse_code=null_to_blank),
    ]
