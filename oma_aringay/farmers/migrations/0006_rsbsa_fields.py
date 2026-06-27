from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('farmers', '0005_alter_farmcrop_crop_name_choices'),
    ]

    operations = [
        # Farmer RSBSA fields
        migrations.AddField(
            model_name='farmer',
            name='philsys_number',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name='farmer',
            name='is_pwd',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='farmer',
            name='is_4ps_beneficiary',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='farmer',
            name='is_icc_ip_member',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='farmer',
            name='icc_ip_name',
            field=models.CharField(blank=True, max_length=150),
        ),
        # FarmParcel RSBSA fields
        migrations.AddField(
            model_name='farmparcel',
            name='farm_type',
            field=models.CharField(blank=True, choices=[('Irrigated', 'Irrigated'), ('Rainfed', 'Rainfed'), ('Upland', 'Upland'), ('Lowland', 'Lowland')], max_length=20),
        ),
        migrations.AddField(
            model_name='farmparcel',
            name='is_organic',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='farmparcel',
            name='within_ancestral_domain',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='farmparcel',
            name='is_agrarian_reform_beneficiary',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='farmparcel',
            name='cropping_schedule',
            field=models.CharField(blank=True, choices=[('Single Cropping', 'Single Cropping'), ('Double Cropping', 'Double Cropping'), ('Triple Cropping', 'Triple Cropping')], max_length=20),
        ),
        # FarmCrop seed/variety fields
        migrations.AddField(
            model_name='farmcrop',
            name='number_of_trees',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='farmcrop',
            name='variety_used',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='farmcrop',
            name='seed_source',
            field=models.CharField(blank=True, choices=[('Certified Seed', 'Certified Seed'), ('Farmer-saved Seed', 'Farmer-saved Seed'), ('Hybrid Seed', 'Hybrid Seed'), ('OPV Seed', 'OPV (Open-Pollinated Variety)'), ('Other', 'Other')], max_length=30),
        ),
        migrations.AddField(
            model_name='farmcrop',
            name='quantity_of_seeds_used',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name='farmcrop',
            name='seeds_unit',
            field=models.CharField(blank=True, choices=[('kg', 'kg'), ('bag', 'bag (50kg)'), ('piece', 'piece (seedling)')], max_length=10),
        ),
    ]
