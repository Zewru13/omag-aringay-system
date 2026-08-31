"""
Fix for a live, reproducible bug: registering a new Fisherfolk via the API
(FisherfolkListView POST) has been failing with a 500 DatabaseError —
(1364, "Field 'association_affiliation' doesn't have a default value").

Root cause: fisheries_fisherfolk.association_affiliation is a NOT NULL
varchar(150) column with no server-side default. It is an orphan column —
flagged but deliberately left untouched by 0032's docstring ("the live
table also has an orphan association_affiliation column that no migration
file references and the model doesn't declare... not a known rename
target for this field, so it's left untouched here rather than guessed
at — flagged separately for manual review"). The model still doesn't
declare this field, so Django's INSERT never supplies a value for it,
leaving MySQL to apply its own (nonexistent) default and reject the row —
this is what config strict-mode MySQL raises as a hard error today.

This does not resurface the field on the model (still no known rename
target/purpose) — it just gives the column a safe empty-string default so
ORM inserts that don't reference it stop failing, mirroring how
association_position (the sibling column fixed in 0032) already behaves.

Postgres migration (Phase 2): this was originally a bare RunSQL using
MySQL's ALTER TABLE ... MODIFY syntax, which Postgres doesn't have. Since
association_affiliation isn't a real Django model field (it's an orphan
column with no migration state to hang an AlterField off), the portable
fix is a RunPython that branches on connection.vendor — the MySQL branch
is the exact original SQL, byte for byte, so behavior against the real
MySQL database is unchanged; the Postgres branch is new, using
ALTER COLUMN ... TYPE / SET DEFAULT / SET NOT NULL.

RunPython wraps its body in a transaction by default; MySQL can't run DDL
inside one (can_rollback_ddl=False), so this needs atomic=False — otherwise
schema_editor.execute() raises TransactionManagementError on MySQL.

Second Phase 2 discovery: association_affiliation is a genuine orphan column
that no migration ever creates — it only exists on the specific already-
drifted real database this fix was written for. A from-scratch database (a
truly fresh MySQL replay, or the new Postgres test database from Step 4) has
no such column at all, so MODIFY/ALTER COLUMN on it fails outright — there's
also nothing to fix there, since a fresh DB was never missing this default in
the first place. Guarded with an information_schema existence check so this
is a no-op wherever the column doesn't exist, and behaves exactly as before
wherever it does.
"""
from django.db import migrations


def _column_exists(schema_editor, table, column):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_name = %s AND column_name = %s "
            "AND table_schema = "
            + ("DATABASE()" if schema_editor.connection.vendor == 'mysql' else "current_schema()"),
            [table, column],
        )
        return cursor.fetchone()[0] > 0


def _forwards(apps, schema_editor):
    if not _column_exists(schema_editor, 'fisheries_fisherfolk', 'association_affiliation'):
        return
    vendor = schema_editor.connection.vendor
    if vendor == 'mysql':
        schema_editor.execute(
            "ALTER TABLE fisheries_fisherfolk "
            "MODIFY association_affiliation varchar(150) NOT NULL DEFAULT ''"
        )
    elif vendor == 'postgresql':
        schema_editor.execute(
            "ALTER TABLE fisheries_fisherfolk "
            "ALTER COLUMN association_affiliation TYPE varchar(150), "
            "ALTER COLUMN association_affiliation SET DEFAULT '', "
            "ALTER COLUMN association_affiliation SET NOT NULL"
        )
    else:
        raise NotImplementedError(f'Unsupported database vendor: {vendor}')


def _backwards(apps, schema_editor):
    if not _column_exists(schema_editor, 'fisheries_fisherfolk', 'association_affiliation'):
        return
    vendor = schema_editor.connection.vendor
    if vendor == 'mysql':
        schema_editor.execute(
            "ALTER TABLE fisheries_fisherfolk "
            "MODIFY association_affiliation varchar(150) NOT NULL"
        )
    elif vendor == 'postgresql':
        schema_editor.execute(
            "ALTER TABLE fisheries_fisherfolk "
            "ALTER COLUMN association_affiliation TYPE varchar(150), "
            "ALTER COLUMN association_affiliation DROP DEFAULT, "
            "ALTER COLUMN association_affiliation SET NOT NULL"
        )
    else:
        raise NotImplementedError(f'Unsupported database vendor: {vendor}')


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0032_fix_missing_fisherfolk_association_position'),
    ]

    operations = [
        migrations.RunPython(_forwards, _backwards, atomic=False),
    ]
