import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0006_barangaycropsum'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # Add plant_condition to CropActivityLog
        migrations.AddField(
            model_name='cropactivitylog',
            name='plant_condition',
            field=models.CharField(blank=True, choices=[('Good', 'Good'), ('Fair', 'Fair'), ('Poor', 'Poor')], max_length=10),
        ),
        # Add variety/seed fields to PlantingRecord
        migrations.AddField(
            model_name='plantingrecord',
            name='variety_used',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='plantingrecord',
            name='seed_source',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='plantingrecord',
            name='quantity_of_seeds_kg',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        # Create FarmInputLog
        migrations.CreateModel(
            name='FarmInputLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('input_type', models.CharField(choices=[('Fertilizer', 'Fertilizer'), ('Pesticide', 'Pesticide'), ('Herbicide', 'Herbicide'), ('Fungicide', 'Fungicide'), ('Other', 'Other')], max_length=20)),
                ('product_name', models.CharField(max_length=150)),
                ('quantity', models.DecimalField(decimal_places=2, max_digits=10)),
                ('unit', models.CharField(max_length=30)),
                ('application_date', models.DateField()),
                ('application_method', models.CharField(blank=True, max_length=100)),
                ('cost_php', models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('notes', models.TextField(blank=True)),
                ('monitoring_record', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='input_logs', to='production.cropmonitoringrecord')),
                ('recorded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='recorded_farm_inputs', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        # Create PestDiseaseReport
        migrations.CreateModel(
            name='PestDiseaseReport',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('report_date', models.DateField()),
                ('pest_disease_name', models.CharField(max_length=150)),
                ('category', models.CharField(choices=[('Pest', 'Pest'), ('Disease', 'Disease')], max_length=10)),
                ('severity', models.CharField(choices=[('Low', 'Low'), ('Moderate', 'Moderate'), ('High', 'High'), ('Critical', 'Critical')], max_length=10)),
                ('affected_area_pct', models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
                ('symptoms_description', models.TextField(blank=True)),
                ('recommended_action', models.TextField(blank=True)),
                ('action_taken', models.TextField(blank=True)),
                ('monitoring_record', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pest_disease_reports', to='production.cropmonitoringrecord')),
                ('recorded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='recorded_pest_disease_reports', to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
