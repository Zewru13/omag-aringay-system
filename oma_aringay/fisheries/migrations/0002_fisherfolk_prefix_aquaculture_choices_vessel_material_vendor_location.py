from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0001_initial'),
    ]

    operations = [
        # Task 1: Add prefix to Fisherfolk
        migrations.AddField(
            model_name='fisherfolk',
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
        # Task 2: Update AquacultureRecord culture_type choices
        migrations.AlterField(
            model_name='aquaculturerecord',
            name='culture_type',
            field=models.CharField(
                choices=[
                    ('Fish Cage', 'Fish Cage'),
                    ('Fish Pond', 'Fish Pond'),
                    ('Fish Pen', 'Fish Pen'),
                    ('Pond Cage', 'Pond Cage'),
                    ('Pen Tank', 'Pen Tank'),
                    ('Other', 'Other'),
                ],
                max_length=30,
            ),
        ),
        # Task 3: Add vessel_material to CaptureRecord
        migrations.AddField(
            model_name='capturerecord',
            name='vessel_material',
            field=models.CharField(
                blank=True,
                choices=[
                    ('Wooden', 'Wooden'),
                    ('Composite', 'Composite'),
                    ('Fiberglass', 'Fiberglass'),
                    ('Steel', 'Steel'),
                    ('Other', 'Other'),
                ],
                max_length=20,
                null=True,
            ),
        ),
        # Task 4: Add location_type to VendorRecord
        migrations.AddField(
            model_name='vendorrecord',
            name='location_type',
            field=models.CharField(
                choices=[
                    ('Fixed Stall', 'Fixed Stall'),
                    ('Market Stall', 'Market Stall'),
                    ('Ambulant / No Fixed Location', 'Ambulant / No Fixed Location'),
                    ('Other', 'Other'),
                ],
                default='Fixed Stall',
                max_length=30,
            ),
        ),
        # Task 4: Make stall_location optional
        migrations.AlterField(
            model_name='vendorrecord',
            name='stall_location',
            field=models.CharField(blank=True, max_length=150, null=True),
        ),
    ]
