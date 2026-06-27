from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('monitoring', '0005_aquacultureproductioncycle_area_cage_harvested_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='FishActivityTemplate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('species_name', models.CharField(max_length=100)),
                ('activity_name', models.CharField(max_length=200)),
                ('days_from_stocking', models.PositiveIntegerField()),
                ('category', models.CharField(blank=True, default='', max_length=100)),
                ('description', models.TextField(blank=True)),
                ('materials_needed', models.TextField(blank=True)),
                ('is_critical', models.BooleanField(default=False)),
                ('days_window', models.PositiveIntegerField(default=3)),
            ],
            options={
                'ordering': ['species_name', 'days_from_stocking'],
            },
        ),
        migrations.CreateModel(
            name='FishActivitySchedule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('activity_name', models.CharField(max_length=200)),
                ('scheduled_date', models.DateField()),
                ('completed', models.BooleanField(default=False)),
                ('actual_date', models.DateField(blank=True, null=True)),
                ('materials_used', models.TextField(blank=True)),
                ('skipped', models.BooleanField(default=False)),
                ('notes', models.TextField(blank=True)),
                ('production_cycle', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='activity_schedules',
                    to='monitoring.aquacultureproductioncycle',
                )),
                ('template', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='schedules',
                    to='monitoring.fishactivitytemplate',
                )),
                ('completed_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='completed_fish_activities',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['scheduled_date'],
            },
        ),
    ]
