import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """Schema only: a new table for per-unit actual harvest kg. Existing harvest records, their
    quantity_kg and their production_units links are not read or changed, and no rows are backfilled."""

    dependencies = [
        ('monitoring', '0023_aquaculturehealthlog_production_unit'),
        ('fisheries', '0068_fisheriesharvestrecord_is_force_harvest'),
    ]

    operations = [
        migrations.CreateModel(
            name='FisheriesHarvestUnit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity_kg', models.DecimalField(decimal_places=2, max_digits=12)),
                ('harvest', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='unit_harvests', to='fisheries.fisheriesharvestrecord')),
                ('production_unit', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='harvest_quantities', to='monitoring.aquacultureproductionunit')),
            ],
            options={
                'ordering': ['production_unit__unit_number'],
            },
        ),
        migrations.AddConstraint(
            model_name='fisheriesharvestunit',
            constraint=models.UniqueConstraint(fields=('harvest', 'production_unit'), name='unique_unit_per_fisheries_harvest'),
        ),
        migrations.AddConstraint(
            model_name='fisheriesharvestunit',
            constraint=models.CheckConstraint(check=models.Q(('quantity_kg__gt', 0)), name='fisheries_harvest_unit_kg_positive'),
        ),
    ]
