"""
Schema-drift fix: Fisherfolk.civil_status is declared on the model and was
supposed to be added by migration 0010, which is marked applied — but the
actual column was missing from the live fisheries_fisherfolk table (confirmed
via DESCRIBE). Discovered because it breaks every StockingRecord create/update
(the fisherfolk FK lookup does a full-row SELECT, touching every column).

This is a narrow, additive AddField only — matches the model's existing
declaration exactly. No other drift found in this table during investigation.

Phase 2 discovery: replaying the *entire* migration chain from scratch against
a genuinely empty database (done while verifying 0033/0034 for the Postgres
migration) surfaced a second, independent bug here — 0010 already adds this
exact same column, so on a database that was never drifted (i.e. one built
fresh from this migration history, rather than the specific already-drifted
real database this fix was written for) the plain AddField below raises a
duplicate-column error before it ever reaches 0033/0034. Real production is
unaffected either way: 0031 is already marked applied there, so this code
path never re-runs against it. But a from-scratch build — which is exactly
what stands up the new Postgres test database in this same phase — hits it
every time, so it has to be fixed here too.

Fix: keep the model-state AddField exactly as it was (harmless — Django's
state tracking just overwrites the same field definition 0010 already put
there), but make the actual database operation idempotent by checking
information_schema for the column first. Works identically on MySQL and
Postgres (both expose information_schema.columns).
"""
from django.db import migrations, models


def _add_civil_status_if_missing(apps, schema_editor):
    table = 'fisheries_fisherfolk'
    column = 'civil_status'
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
            ('Single', 'Single'),
            ('Married', 'Married'),
            ('Widowed', 'Widowed'),
            ('Separated', 'Separated'),
        ],
    )
    field.set_attributes_from_name(column)
    schema_editor.add_field(apps.get_model('fisheries', 'Fisherfolk'), field)


def _remove_civil_status_if_present(apps, schema_editor):
    table = 'fisheries_fisherfolk'
    column = 'civil_status'
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
        ('fisheries', '0030_stockingrecord_culture_phase_and_more'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='fisherfolk',
                    name='civil_status',
                    field=models.CharField(
                        max_length=20, blank=True, default='',
                        choices=[
                            ('Single', 'Single'),
                            ('Married', 'Married'),
                            ('Widowed', 'Widowed'),
                            ('Separated', 'Separated'),
                        ],
                    ),
                ),
            ],
            database_operations=[
                migrations.RunPython(
                    _add_civil_status_if_missing,
                    _remove_civil_status_if_present,
                    atomic=False,
                ),
            ],
        ),
    ]
