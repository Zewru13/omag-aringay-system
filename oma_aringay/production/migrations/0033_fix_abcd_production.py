from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0032_disaster_resolution_lifecycle'),
    ]

    operations = [
        migrations.RenameField(
            model_name='cropactivitylog',
            old_name='activity_date',
            new_name='date_of_activity',
        ),
        migrations.AddField(
            model_name='cropactivitylog',
            name='date_logged',
            field=models.DateTimeField(auto_now_add=True, blank=True, null=True, help_text='When OMAg staff encoded this log'),
        ),
        migrations.AddField(
            model_name='cropactivitylog',
            name='disaster_report',
            field=models.ForeignKey(blank=True, help_text='Set when this log was created from a disaster response rule card', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='production.cropdisasterreport'),
        ),
        migrations.AddField(
            model_name='cropactivitylog',
            name='disaster_rule',
            field=models.ForeignKey(blank=True, help_text='The specific disaster response rule this log satisfies', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='production.disasterresponserule'),
        ),
        migrations.AlterField(
            model_name='cropmonitoringrecord',
            name='status',
            field=models.CharField(choices=[('Planted', 'Planted'), ('Near Harvest', 'Near Harvest'), ('Harvested', 'Harvested'), ('Total Loss', 'Total Loss')], default='Planted', max_length=20),
        ),
        migrations.AddField(
            model_name='cropdisasterreport',
            name='is_total_loss',
            field=models.BooleanField(default=False, help_text='Crop completely destroyed — ends the production cycle'),
        ),
        migrations.AddField(
            model_name='disasterresponserule',
            name='activity_name',
            field=models.CharField(default='Other', help_text='Activity log value this rule fills when clicked.', max_length=150),
        ),
        migrations.AddField(
            model_name='disasterresponserule',
            name='recommendation',
            field=models.TextField(blank=True, help_text='Plain text copied into the log Notes field.'),
        ),
    ]
