from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0003_redesign_damagereport'),
        ('farmers', '0005_alter_farmcrop_crop_name_choices'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # CropType master table
        migrations.CreateModel(
            name='CropType',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100, unique=True)),
                ('days_to_harvest', models.IntegerField()),
                ('yield_per_ha_kg', models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
            ],
        ),
        # CropMonitoringRecord
        migrations.CreateModel(
            name='CropMonitoringRecord',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('season', models.CharField(max_length=10, choices=[('Dry', 'Dry'), ('Wet', 'Wet')])),
                ('year', models.PositiveIntegerField()),
                ('date_planted', models.DateField()),
                ('area_planted_ha', models.DecimalField(decimal_places=2, max_digits=10)),
                ('expected_harvest_date', models.DateField(blank=True, null=True)),
                ('actual_harvest_date', models.DateField(blank=True, null=True)),
                ('status', models.CharField(
                    max_length=20,
                    choices=[('Active', 'Active'), ('Harvested', 'Harvested'), ('Damaged', 'Damaged'), ('Abandoned', 'Abandoned')],
                    default='Active',
                )),
                ('estimated_yield_kg', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('actual_yield_kg', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('yield_variance_kg', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('yield_variance_pct', models.DecimalField(blank=True, decimal_places=2, max_digits=7, null=True)),
                ('notes', models.TextField(blank=True)),
                ('date_recorded', models.DateTimeField(auto_now_add=True)),
                ('farm_parcel', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='monitoring_records',
                    to='farmers.farmparcel',
                )),
                ('crop_type', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='monitoring_records',
                    to='production.croptype',
                )),
                ('recorded_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='monitoring_records',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
        # CropActivityLog
        migrations.CreateModel(
            name='CropActivityLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('activity_type', models.CharField(max_length=100)),
                ('activity_date', models.DateField()),
                ('notes', models.TextField(blank=True)),
                ('monitoring_record', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='activity_logs',
                    to='production.cropmonitoringrecord',
                )),
                ('recorded_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='crop_activity_logs',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
        # HarvestRecord: add causal_factor, causal_damage_report, monitoring_record
        migrations.AddField(
            model_name='harvestrecord',
            name='causal_factor',
            field=models.CharField(blank=True, max_length=150),
        ),
        migrations.AddField(
            model_name='harvestrecord',
            name='causal_damage_report',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='caused_harvests',
                to='production.damagereport',
            ),
        ),
        migrations.AddField(
            model_name='harvestrecord',
            name='monitoring_record',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='harvest_records',
                to='production.cropmonitoringrecord',
            ),
        ),
        # DamageReport: add affected_monitoring_records M2M
        migrations.AddField(
            model_name='damagereport',
            name='affected_monitoring_records',
            field=models.ManyToManyField(
                blank=True,
                related_name='damage_reports',
                to='production.cropmonitoringrecord',
            ),
        ),
    ]
