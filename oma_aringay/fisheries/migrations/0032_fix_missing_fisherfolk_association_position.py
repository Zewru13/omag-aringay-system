"""
Schema-drift fix, same root cause as 0031: Fisherfolk.association_position is
declared on the model and was supposed to be added by migration 0010 (a plain
AddField, not a rename) — but the actual column was missing from the live
table (confirmed by diffing Fisherfolk._meta.get_fields() against DESCRIBE).

Note: the live table also has an orphan association_affiliation column that
no migration file references and the model doesn't declare. It isn't a known
rename target for this field, so it's left untouched here rather than guessed
at — flagged separately for manual review, not modified by this migration.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0031_fix_missing_fisherfolk_civil_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='fisherfolk',
            name='association_position',
            field=models.CharField(
                max_length=20, blank=True, default='',
                choices=[
                    ('President', 'President'),
                    ('Chairperson', 'Chairperson'),
                    ('Vice President', 'Vice President'),
                    ('Vice Chairperson', 'Vice Chairperson'),
                    ('Secretary', 'Secretary'),
                    ('Treasurer', 'Treasurer'),
                    ('Auditor', 'Auditor'),
                    ('Board Member', 'Board Member'),
                    ('Manager', 'Manager'),
                    ('Member', 'Member'),
                ],
            ),
        ),
    ]
