from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0011_add_crop_remark'),
    ]

    operations = [
        migrations.AddField(
            model_name='cropremark',
            name='custom_status',
            field=models.CharField(blank=True, max_length=100),
        ),
    ]
