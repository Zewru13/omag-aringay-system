"""
Batch 1: rename Association -> Organization throughout. Pure RenameModel/
RenameField/AlterUniqueTogether operations only — no drop-and-recreate,
data is preserved (Django's Rename* operations issue ALTER TABLE ... RENAME
under the hood, not DROP+CREATE).
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('associations', '0012_associationofficer_farmer_and_more'),
    ]

    operations = [
        migrations.RenameModel('AssociationOfficer', 'OrganizationOfficer'),
        migrations.RenameModel('FarmersAssociation', 'FarmersOrganization'),
        migrations.RenameModel('FarmersAssociationMember', 'FarmersOrganizationMember'),
        migrations.RenameModel('FarmersAssociationEquipment', 'FarmersOrganizationEquipment'),
        migrations.RenameModel('FisherfolkAssociation', 'FisherfolkOrganization'),
        migrations.RenameModel('FisherfolkAssociationOfficer', 'FisherfolkOrganizationOfficer'),
        migrations.RenameModel('FisherfolkAssociationMember', 'FisherfolkOrganizationMember'),
        migrations.RenameModel('FisherfolkAssociationEquipment', 'FisherfolkOrganizationEquipment'),

        migrations.RenameField('OrganizationOfficer', 'association', 'organization'),
        migrations.RenameField('FarmersOrganizationMember', 'association', 'organization'),
        migrations.RenameField('FarmersOrganizationEquipment', 'association', 'organization'),
        migrations.RenameField('FisherfolkOrganizationOfficer', 'association', 'organization'),
        migrations.RenameField('FisherfolkOrganizationMember', 'association', 'organization'),
        migrations.RenameField('FisherfolkOrganizationEquipment', 'association', 'organization'),

        migrations.AlterUniqueTogether(
            name='organizationofficer',
            unique_together={('organization', 'position')},
        ),
        migrations.AlterUniqueTogether(
            name='farmersorganizationmember',
            unique_together={('organization', 'farmer')},
        ),
        migrations.AlterUniqueTogether(
            name='fisherfolkorganizationofficer',
            unique_together={('organization', 'position')},
        ),
        migrations.AlterUniqueTogether(
            name='fisherfolkorganizationmember',
            unique_together={('organization', 'fisherfolk')},
        ),
    ]
