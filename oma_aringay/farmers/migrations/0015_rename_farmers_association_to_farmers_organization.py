"""Batch 1: rename Association -> Organization. Depends on the associations
app's own rename migration so FarmersOrganization already exists by the time
this FK's target is resolved."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('farmers', '0014_alter_farmparcel_parcel_number_and_more'),
        ('associations', '0013_rename_association_to_organization'),
    ]

    operations = [
        migrations.RenameField('Farmer', 'farmers_association', 'farmers_organization'),
    ]
