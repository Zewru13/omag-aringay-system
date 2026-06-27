from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('farmers', '0005_alter_farmcrop_crop_name_choices'),
        ('fisheries', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='FarmVisit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('visit_date', models.DateField()),
                ('next_visit_date', models.DateField(blank=True, null=True)),
                ('purpose', models.CharField(max_length=200)),
                ('notes', models.TextField(blank=True)),
                ('date_recorded', models.DateTimeField(auto_now_add=True)),
                ('farmer', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='farm_visits',
                    to='farmers.farmer',
                )),
                ('conducted_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='conducted_farm_visits',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
        migrations.CreateModel(
            name='FishingTripLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('trip_date', models.DateField()),
                ('return_date', models.DateField(blank=True, null=True)),
                ('fishing_ground', models.CharField(max_length=150)),
                ('gear_used', models.CharField(max_length=150)),
                ('total_catch_kg', models.DecimalField(decimal_places=2, max_digits=10)),
                ('remarks', models.TextField(blank=True)),
                ('date_recorded', models.DateTimeField(auto_now_add=True)),
                ('fisherfolk', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='fishing_trips',
                    to='fisheries.fisherfolk',
                )),
                ('recorded_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='recorded_fishing_trips',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
        migrations.CreateModel(
            name='VesselInspection',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('inspection_date', models.DateField()),
                ('license_number', models.CharField(max_length=100)),
                ('license_expiry_date', models.DateField()),
                ('vessel_condition', models.CharField(
                    max_length=20,
                    choices=[('Good', 'Good'), ('Fair', 'Fair'), ('Poor', 'Poor'), ('For Repair', 'For Repair')],
                )),
                ('remarks', models.TextField(blank=True)),
                ('date_recorded', models.DateTimeField(auto_now_add=True)),
                ('fisherfolk', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='vessel_inspections',
                    to='fisheries.fisherfolk',
                )),
                ('inspected_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='conducted_vessel_inspections',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
    ]
