from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('interventions', '0015_backfill_source_agencies'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='beneficiaryrecord',
            name='source_agency',
        ),
        migrations.RemoveField(
            model_name='fisherfolkbeneficiaryrecord',
            name='source_agency',
        ),
    ]
