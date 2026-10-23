from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('farmers', '0032_parcel_classifications'),
    ]

    operations = [
        migrations.RemoveField(model_name='farmparcel', name='is_agrarian_reform_beneficiary'),
        migrations.RemoveField(model_name='farmparcel', name='is_organic'),
        migrations.RemoveField(model_name='farmparcel', name='within_ancestral_domain'),
    ]
