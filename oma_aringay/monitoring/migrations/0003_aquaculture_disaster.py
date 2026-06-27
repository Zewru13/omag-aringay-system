import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('monitoring', '0002_tripspeciesentry_fishingtriplog'),
        ('fisheries', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # Add capture fishing fields to FishingTripLog
        migrations.AddField(
            model_name='fishingtriplog',
            name='hours_at_sea',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True),
        ),
        migrations.AddField(
            model_name='fishingtriplog',
            name='fuel_consumption_liters',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True),
        ),
        migrations.AddField(
            model_name='fishingtriplog',
            name='fuel_cost_php',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        # Create AquacultureProductionCycle
        migrations.CreateModel(
            name='AquacultureProductionCycle',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('cycle_name', models.CharField(max_length=150)),
                ('species_farmed', models.CharField(max_length=100)),
                ('culture_system', models.CharField(choices=[('Fishpond', 'Fishpond'), ('Fishcage', 'Fishcage'), ('Fishpen', 'Fishpen'), ('Oyster', 'Oyster Culture'), ('Mussel', 'Mussel Culture'), ('Seaweed', 'Seaweed Farming'), ('Other', 'Other')], max_length=20)),
                ('stocking_date', models.DateField()),
                ('stocking_count', models.PositiveIntegerField(blank=True, null=True)),
                ('stocking_density', models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('area_sqm', models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('target_harvest_date', models.DateField(blank=True, null=True)),
                ('actual_harvest_date', models.DateField(blank=True, null=True)),
                ('harvest_volume_kg', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('price_per_kg', models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('revenue_php', models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ('seed_cost_php', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('feed_cost_php', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('labor_cost_php', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('other_cost_php', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('status', models.CharField(choices=[('Active', 'Active'), ('Harvested', 'Harvested'), ('Failed', 'Failed'), ('Abandoned', 'Abandoned')], default='Active', max_length=15)),
                ('notes', models.TextField(blank=True)),
                ('date_recorded', models.DateTimeField(auto_now_add=True)),
                ('fisherfolk', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='production_cycles', to='fisheries.fisherfolk')),
                ('recorded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='recorded_production_cycles', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        # Create AquacultureFeedingLog
        migrations.CreateModel(
            name='AquacultureFeedingLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('feeding_date', models.DateField()),
                ('feed_type', models.CharField(max_length=100)),
                ('quantity_kg', models.DecimalField(decimal_places=2, max_digits=8)),
                ('notes', models.CharField(blank=True, max_length=200)),
                ('production_cycle', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='feeding_logs', to='monitoring.aquacultureproductioncycle')),
            ],
        ),
        # Create AquacultureHealthLog
        migrations.CreateModel(
            name='AquacultureHealthLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('log_date', models.DateField()),
                ('observation', models.CharField(max_length=200)),
                ('mortality_count', models.PositiveIntegerField(default=0)),
                ('treatment_applied', models.CharField(blank=True, max_length=200)),
                ('vet_consulted', models.BooleanField(default=False)),
                ('notes', models.TextField(blank=True)),
                ('production_cycle', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='health_logs', to='monitoring.aquacultureproductioncycle')),
            ],
        ),
        # Create FisheriesDisasterReport
        migrations.CreateModel(
            name='FisheriesDisasterReport',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('report_date', models.DateField()),
                ('disaster_type', models.CharField(choices=[('Typhoon', 'Typhoon'), ('Flooding', 'Flooding'), ('Storm Surge', 'Storm Surge'), ('El Nino Drought', 'El Niño / Drought'), ('Red Tide', 'Red Tide'), ('Disease Outbreak', 'Disease Outbreak'), ('Other', 'Other')], max_length=30)),
                ('affected_barangay', models.CharField(max_length=100)),
                ('description', models.TextField()),
                ('estimated_loss_php', models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ('volume_lost_kg', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('equipment_damaged', models.TextField(blank=True)),
                ('status', models.CharField(choices=[('Reported', 'Reported'), ('Verified', 'Verified'), ('Closed', 'Closed')], default='Reported', max_length=10)),
                ('date_recorded', models.DateTimeField(auto_now_add=True)),
                ('fisherfolk', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='disaster_reports', to='fisheries.fisherfolk')),
                ('recorded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='recorded_fisheries_disasters', to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
