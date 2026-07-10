from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0021_disaster_resolution_lifecycle'),
    ]

    operations = [
        migrations.AddField(
            model_name='fisheriesactivitylog',
            name='date_logged',
            field=models.DateTimeField(auto_now_add=True, blank=True, null=True, help_text='When OMAg staff encoded this log'),
        ),
        migrations.AddField(
            model_name='fisheriesactivitylog',
            name='disaster_report',
            field=models.ForeignKey(blank=True, help_text='Set when this log was created from a disaster response rule card', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='fisheries.fisheriesdisasterreport'),
        ),
        migrations.AddField(
            model_name='fisheriesactivitylog',
            name='disaster_rule',
            field=models.ForeignKey(blank=True, help_text='The specific disaster response rule this log satisfies', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='fisheries.fisheriesdisasterresponserule'),
        ),
        migrations.AlterField(
            model_name='stockingrecord',
            name='status',
            field=models.CharField(choices=[('Stocked', 'Stocked'), ('Near Harvest', 'Near Harvest'), ('Harvested', 'Harvested'), ('Total Loss', 'Total Loss')], default='Stocked', max_length=20),
        ),
        migrations.AddField(
            model_name='fisheriesdisasterreport',
            name='is_total_loss',
            field=models.BooleanField(default=False, help_text='Stock completely destroyed — ends the production cycle'),
        ),
    ]
