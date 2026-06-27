import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('monitoring', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='fishingtriplog',
            name='estimated_value_php',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
        migrations.AlterField(
            model_name='fishingtriplog',
            name='total_catch_kg',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.CreateModel(
            name='TripSpeciesEntry',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('species_name', models.CharField(max_length=100)),
                ('volume_kg', models.DecimalField(decimal_places=2, max_digits=10)),
                ('estimated_value_php', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('notes', models.CharField(blank=True, max_length=200)),
                ('fishing_trip', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='species_entries', to='monitoring.fishingtriplog')),
            ],
        ),
    ]
