import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0015_alter_barangaycropsummary_barangay_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='cropremark',
            name='monitoring_record',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='remarks',
                to='production.cropmonitoringrecord',
            ),
        ),
    ]
