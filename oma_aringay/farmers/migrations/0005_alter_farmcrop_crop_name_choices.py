from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('farmers', '0004_farmcrop_is_main_crop_alter_farmcrop_crop_name'),
    ]

    operations = [
        migrations.AlterField(
            model_name='farmcrop',
            name='crop_name',
            field=models.CharField(
                max_length=100,
                choices=[
                    ('Palay (Rice)', 'Palay (Rice)'),
                    ('Corn (Mais)', 'Corn (Mais)'),
                    ('Onion', 'Onion'),
                    ('Garlic', 'Garlic'),
                    ('Tomato', 'Tomato'),
                    ('Eggplant (Talong)', 'Eggplant (Talong)'),
                    ('Bitter Gourd (Ampalaya)', 'Bitter Gourd (Ampalaya)'),
                    ('String Beans (Sitaw)', 'String Beans (Sitaw)'),
                    ('Pechay', 'Pechay'),
                    ('Cabbage', 'Cabbage'),
                    ('Mango', 'Mango'),
                    ('Cacao (Kakaw)', 'Cacao (Kakaw)'),
                    ('Banana (Saging)', 'Banana (Saging)'),
                    ('Coffee (Kape)', 'Coffee (Kape)'),
                    ('Cassava', 'Cassava'),
                    ('Sweet Potato (Kamote)', 'Sweet Potato (Kamote)'),
                    ('Other Vegetables', 'Other Vegetables'),
                    ('Other Fruits', 'Other Fruits'),
                    ('Other Root Crops', 'Other Root Crops'),
                    ('Cash Crops', 'Cash Crops'),
                    ('Other', 'Other'),
                ],
            ),
        ),
    ]
