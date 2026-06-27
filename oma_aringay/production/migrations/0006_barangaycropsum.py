import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0005_croptype_seed'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='BarangayCropSummary',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('barangay', models.CharField(max_length=100, choices=[('Alaska', 'Alaska'), ('Basca', 'Basca'), ('Dulao', 'Dulao'), ('Gallano', 'Gallano'), ('Macabato', 'Macabato'), ('Manga', 'Manga'), ('Pangao-aoan East', 'Pangao-aoan East'), ('Pangao-aoan West', 'Pangao-aoan West'), ('Poblacion', 'Poblacion'), ('Samara', 'Samara'), ('San Antonio', 'San Antonio'), ('San Benito Norte', 'San Benito Norte'), ('San Benito Sur', 'San Benito Sur'), ('San Eugenio', 'San Eugenio'), ('San Juan East', 'San Juan East'), ('San Juan West', 'San Juan West'), ('San Simon East', 'San Simon East'), ('San Simon West', 'San Simon West'), ('Santa Cecilia', 'Santa Cecilia'), ('Santa Lucia', 'Santa Lucia'), ('Santa Rita East', 'Santa Rita East'), ('Santa Rita West', 'Santa Rita West'), ('Santo Rosario East', 'Santo Rosario East'), ('Santo Rosario West', 'Santo Rosario West')])),
                ('crop_name', models.CharField(max_length=100, choices=[('Palay (Rice)', 'Palay (Rice)'), ('Corn (Mais)', 'Corn (Mais)'), ('Onion', 'Onion'), ('Garlic', 'Garlic'), ('Tomato', 'Tomato'), ('Eggplant (Talong)', 'Eggplant (Talong)'), ('Bitter Gourd (Ampalaya)', 'Bitter Gourd (Ampalaya)'), ('String Beans (Sitaw)', 'String Beans (Sitaw)'), ('Pechay', 'Pechay'), ('Cabbage', 'Cabbage'), ('Mango', 'Mango'), ('Cacao (Kakaw)', 'Cacao (Kakaw)'), ('Banana (Saging)', 'Banana (Saging)'), ('Coffee (Kape)', 'Coffee (Kape)'), ('Cassava', 'Cassava'), ('Sweet Potato (Kamote)', 'Sweet Potato (Kamote)'), ('Other Vegetables', 'Other Vegetables'), ('Other Fruits', 'Other Fruits'), ('Other Root Crops', 'Other Root Crops'), ('Cash Crops', 'Cash Crops'), ('Other', 'Other')])),
                ('season', models.CharField(max_length=10, choices=[('Dry', 'Dry Season'), ('Wet', 'Wet Season')])),
                ('year', models.IntegerField()),
                ('area_planted_ha', models.DecimalField(decimal_places=4, default=0, max_digits=10)),
                ('number_of_farmers', models.IntegerField(default=0)),
                ('planting_date_start', models.DateField(blank=True, null=True)),
                ('planting_date_end', models.DateField(blank=True, null=True)),
                ('expected_harvest_start', models.DateField(blank=True, null=True)),
                ('expected_harvest_end', models.DateField(blank=True, null=True)),
                ('current_growth_stage', models.CharField(blank=True, max_length=20, choices=[('Land Preparation', 'Land Preparation'), ('Planted', 'Planted'), ('Vegetative', 'Vegetative'), ('Reproductive', 'Reproductive'), ('Maturity', 'Maturity'), ('Near Harvest', 'Near Harvest'), ('Harvested', 'Harvested')])),
                ('observed_problems', models.TextField(blank=True)),
                ('alert_level', models.CharField(default='None', max_length=10, choices=[('None', 'None'), ('Low', 'Low — Monitor'), ('Medium', 'Medium — Attention Required'), ('High', 'High — Immediate Action')])),
                ('estimated_yield_kg', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('actual_yield_kg', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('yield_variance_kg', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('yield_variance_pct', models.DecimalField(blank=True, decimal_places=2, max_digits=6, null=True)),
                ('causal_factor', models.CharField(blank=True, max_length=20, choices=[('None', 'None / Normal Season'), ('Typhoon-Flooding', 'Typhoon / Flooding'), ('Drought', 'Drought / Dry Spell'), ('Pest', 'Pest Infestation'), ('Disease', 'Crop Disease'), ('Poor Soil', 'Poor Soil Condition'), ('Delayed Input', 'Delayed Farm Inputs'), ('Other', 'Other')])),
                ('submission_status', models.CharField(default='Draft', max_length=10, choices=[('Draft', 'Draft — In Progress'), ('Submitted', 'Submitted — Awaiting Verification'), ('Verified', 'Verified — Final')])),
                ('date_created', models.DateTimeField(auto_now_add=True)),
                ('date_updated', models.DateTimeField(auto_now=True)),
                ('causal_damage_report', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='related_summaries', to='production.damagereport')),
                ('linked_monitoring_records', models.ManyToManyField(blank=True, related_name='barangay_summaries', to='production.cropmonitoringrecord')),
                ('recorded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='recorded_barangay_summaries', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'unique_together': {('barangay', 'crop_name', 'season', 'year')},
            },
        ),
    ]
