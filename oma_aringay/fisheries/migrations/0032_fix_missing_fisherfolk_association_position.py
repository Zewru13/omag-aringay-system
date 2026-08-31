"""
Schema-drift fix, same root cause as 0031: Fisherfolk.association_position is
declared on the model and was supposed to be added by migration 0010 (a plain
AddField, not a rename) — but the actual column was missing from the live
table (confirmed by diffing Fisherfolk._meta.get_fields() against DESCRIBE).

Note: the live table also has an orphan association_affiliation column that
no migration file references and the model doesn't declare. It isn't a known
rename target for this field, so it's left untouched here rather than guessed
at — flagged separately for manual review, not modified by this migration.

Phase 2 discovery: same fresh-database duplicate-column bug found and fixed
in 0031 for civil_status also applies here — 0010 already adds this exact
column, so a truly fresh database (as opposed to the specific already-drifted
real database this fix was written for) hits a duplicate-column error on the
plain AddField below. See 0031's docstring for the full explanation; same
fix applied here (idempotent database operation via information_schema
check, model state left untouched).
"""
from django.db import migrations, models


def _add_association_position_if_missing(apps, schema_editor):
    table = 'fisheries_fisherfolk'
    column = 'association_position'
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_name = %s AND column_name = %s "
            "AND table_schema = "
            + ("DATABASE()" if schema_editor.connection.vendor == 'mysql' else "current_schema()"),
            [table, column],
        )
        exists = cursor.fetchone()[0] > 0
    if exists:
        return
    field = models.CharField(
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
    )
    field.set_attributes_from_name(column)
    schema_editor.add_field(apps.get_model('fisheries', 'Fisherfolk'), field)


def _remove_association_position_if_present(apps, schema_editor):
    table = 'fisheries_fisherfolk'
    column = 'association_position'
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_name = %s AND column_name = %s "
            "AND table_schema = "
            + ("DATABASE()" if schema_editor.connection.vendor == 'mysql' else "current_schema()"),
            [table, column],
        )
        exists = cursor.fetchone()[0] > 0
    if not exists:
        return
    field = apps.get_model('fisheries', 'Fisherfolk')._meta.get_field(column)
    schema_editor.remove_field(apps.get_model('fisheries', 'Fisherfolk'), field)


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0031_fix_missing_fisherfolk_civil_status'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
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
            ],
            database_operations=[
                migrations.RunPython(
                    _add_association_position_if_missing,
                    _remove_association_position_if_present,
                    atomic=False,
                ),
            ],
        ),
    ]
