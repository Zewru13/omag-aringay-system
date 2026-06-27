from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('farmers', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='farmer',
            name='prefix',
            field=models.CharField(
                blank=True,
                choices=[
                    ('Mr.', 'Mr.'),
                    ('Mrs.', 'Mrs.'),
                    ('Ms.', 'Ms.'),
                    ('Engr.', 'Engr.'),
                    ('Dr.', 'Dr.'),
                    ('Hon.', 'Hon.'),
                ],
                default='',
                max_length=10,
            ),
        ),
        migrations.AlterField(
            model_name='farmparcel',
            name='commodity_type',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AlterField(
            model_name='farmparcel',
            name='commodity_name',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.CreateModel(
            name='FarmCrop',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('crop_name', models.CharField(
                    choices=[
                        ('Rice', 'Rice'),
                        ('Corn', 'Corn'),
                        ('Vegetables', 'Vegetables'),
                        ('Root Crops', 'Root Crops'),
                        ('Fruits/High-Value Crops', 'Fruits/High-Value Crops'),
                        ('Cash Crops', 'Cash Crops'),
                        ('Other', 'Other'),
                    ],
                    max_length=50,
                )),
                ('crop_name_other', models.CharField(blank=True, max_length=100)),
                ('area_hectares', models.DecimalField(decimal_places=4, max_digits=10)),
                ('farm_parcel', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='crops',
                    to='farmers.farmparcel',
                )),
            ],
        ),
        migrations.CreateModel(
            name='FarmLivestock',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('livestock_type', models.CharField(
                    choices=[
                        ('Carabao', 'Carabao'),
                        ('Cattle', 'Cattle'),
                        ('Goat', 'Goat'),
                        ('Swine', 'Swine'),
                        ('Chicken', 'Chicken'),
                        ('Duck', 'Duck'),
                        ('Other', 'Other'),
                    ],
                    max_length=20,
                )),
                ('livestock_type_other', models.CharField(blank=True, max_length=100)),
                ('head_count', models.PositiveIntegerField()),
                ('farm_parcel', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='livestock',
                    to='farmers.farmparcel',
                )),
            ],
        ),
        migrations.CreateModel(
            name='FarmMachinery',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('machinery_type', models.CharField(
                    choices=[
                        ('Hand Tractor', 'Hand Tractor'),
                        ('Four-Wheel Tractor', 'Four-Wheel Tractor'),
                        ('Thresher', 'Thresher'),
                        ('Water Pump', 'Water Pump'),
                        ('Sprayer', 'Sprayer'),
                        ('Harvester', 'Harvester'),
                        ('Rice Mill', 'Rice Mill'),
                        ('Other', 'Other'),
                    ],
                    max_length=30,
                )),
                ('machinery_type_other', models.CharField(blank=True, max_length=100)),
                ('quantity', models.PositiveIntegerField(default=1)),
                ('ownership', models.CharField(
                    choices=[
                        ('Owned', 'Owned'),
                        ('Borrowed', 'Borrowed'),
                        ('Rented', 'Rented'),
                        ('Association-Owned', 'Association-Owned'),
                    ],
                    max_length=20,
                )),
                ('farm_parcel', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='machinery',
                    to='farmers.farmparcel',
                )),
            ],
        ),
    ]
