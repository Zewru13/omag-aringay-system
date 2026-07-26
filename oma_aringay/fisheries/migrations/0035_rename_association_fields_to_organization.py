"""Batch 1: rename Association -> Organization. Depends on the associations
app's own rename migration so FisherfolkOrganization already exists by the
time this FK's target is resolved."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0034_fix_missing_defaults_aquaculture_capture_records'),
        ('associations', '0013_rename_association_to_organization'),
    ]

    operations = [
        migrations.RenameField('Fisherfolk', 'fisherfolk_association', 'fisherfolk_organization'),
        migrations.RenameField('Fisherfolk', 'association_position', 'organization_position'),
    ]
