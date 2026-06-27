from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0002_plantingrecord_damagereport'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.DeleteModel(
            name='DamageReport',
        ),
        migrations.CreateModel(
            name='DamageReport',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('barangay', models.CharField(max_length=100, choices=[
                    ('Alaska', 'Alaska'), ('Basca', 'Basca'), ('Dulao', 'Dulao'),
                    ('Gallano', 'Gallano'), ('Macabato', 'Macabato'), ('Manga', 'Manga'),
                    ('Pangao-aoan East', 'Pangao-aoan East'), ('Pangao-aoan West', 'Pangao-aoan West'),
                    ('Poblacion', 'Poblacion'), ('Samara', 'Samara'), ('San Antonio', 'San Antonio'),
                    ('San Benito Norte', 'San Benito Norte'), ('San Benito Sur', 'San Benito Sur'),
                    ('San Eugenio', 'San Eugenio'), ('San Juan East', 'San Juan East'),
                    ('San Juan West', 'San Juan West'), ('San Simon East', 'San Simon East'),
                    ('San Simon West', 'San Simon West'), ('Santa Cecilia', 'Santa Cecilia'),
                    ('Santa Lucia', 'Santa Lucia'), ('Santa Rita East', 'Santa Rita East'),
                    ('Santa Rita West', 'Santa Rita West'), ('Santo Rosario East', 'Santo Rosario East'),
                    ('Santo Rosario West', 'Santo Rosario West'),
                ])),
                ('calamity_name', models.CharField(max_length=150)),
                ('calamity_date', models.DateField()),
                ('season', models.CharField(max_length=10, choices=[('Dry', 'Dry'), ('Wet', 'Wet')])),
                ('year', models.PositiveIntegerField()),
                ('damaged_crops', models.TextField(blank=True)),
                ('crop_volume_damaged_kg', models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('damaged_livestock', models.TextField(blank=True)),
                ('livestock_head_count_affected', models.IntegerField(blank=True, null=True)),
                ('estimated_loss_php', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('remarks', models.TextField(blank=True)),
                ('date_recorded', models.DateTimeField(auto_now_add=True)),
                ('recorded_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='recorded_damage_reports',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
    ]
