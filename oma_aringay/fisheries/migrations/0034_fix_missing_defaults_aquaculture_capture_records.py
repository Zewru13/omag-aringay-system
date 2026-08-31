"""
Fix for the actual, currently-reproducible "fisherfolk registry is not
working" bug: registering ANY new Aquaculture or Capture-type fisherfolk
via the API failed with a 500 DatabaseError, one column at a time —
0033 fixed fisheries_fisherfolk.association_affiliation, but registering
an Aquaculture fisherfolk then hit fisheries_aquaculturerecord's
average_size_of_fingerlings the same way, and Capture-type hit
fisheries_capturerecord.boat_name next.

Root cause is identical and widespread on these two tables: several
NOT NULL varchar columns with no server-side default, none declared on
the AquacultureRecord/CaptureRecord models (same orphan-column class of
drift as 0031-0033). FisherfolkCreateSerializer's nested create() never
references these columns, so MySQL rejects the INSERT outright since it
has no default to fall back on.

Audited every model/table pair in the fisheries app (DESCRIBE vs.
model._meta fields) to confirm these are the only two tables affected —
fisheries_fisherfolk (already fixed in 0033) was the only other one.

As with 0033, this does not resurface these columns on the models (no
known rename target/purpose for any of them) — it just gives each a safe
empty-string default so ORM inserts that don't reference them stop
failing.

Postgres migration (Phase 2): same rewrite as 0033 and for the same
reason (orphan columns, no model field to hang an AlterField off) — a
RunPython branching on connection.vendor. The MySQL branch is the exact
original SQL, byte for byte, so behavior against the real MySQL database
is unchanged; the Postgres branch is new.

RunPython wraps its body in a transaction by default; MySQL can't run DDL
inside one (can_rollback_ddl=False), so this needs atomic=False — otherwise
schema_editor.execute() raises TransactionManagementError on MySQL.

Second Phase 2 discovery: all 9 columns here are genuine orphan columns that
no migration ever creates — they only exist on the specific already-drifted
real database this fix was written for. A from-scratch database (a truly
fresh MySQL replay, or the new Postgres test database from Step 4) has none
of them, so MODIFY/ALTER COLUMN fails outright — there's also nothing to fix
there, since a fresh DB was never missing these defaults in the first place.
Each column is now checked against information_schema first and only
included in the ALTER TABLE statement if present, so this is a no-op wherever
none of a table's columns exist, and behaves exactly as before wherever they
do (the generated SQL for the "all present" case is unchanged).
"""
from django.db import migrations

_AQUACULTURE_COLUMNS = [
    ('average_size_of_fingerlings', 'varchar(100)'),
    ('fingerling_source', 'varchar(150)'),
    ('location', 'varchar(150)'),
    ('production_cycle', 'varchar(100)'),
    ('stocking_density', 'varchar(100)'),
    ('water_source', 'varchar(100)'),
]

_CAPTURE_COLUMNS = [
    ('boat_name', 'varchar(150)'),
    ('boat_operator', 'varchar(150)'),
    ('species_caught', 'varchar(150)'),
]


def _existing_columns(schema_editor, table, columns):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = %s AND table_schema = "
            + ("DATABASE()" if schema_editor.connection.vendor == 'mysql' else "current_schema()"),
            [table],
        )
        present = {row[0] for row in cursor.fetchall()}
    return [(name, sql_type) for name, sql_type in columns if name in present]


def _alter_table(schema_editor, table, columns, mysql_clause, postgres_clauses):
    present = _existing_columns(schema_editor, table, columns)
    if not present:
        return
    vendor = schema_editor.connection.vendor
    if vendor == 'mysql':
        schema_editor.execute(
            f"ALTER TABLE {table} "
            + ", ".join(mysql_clause(name, sql_type) for name, sql_type in present)
        )
    elif vendor == 'postgresql':
        clauses = []
        for name, sql_type in present:
            clauses.extend(postgres_clauses(name, sql_type))
        schema_editor.execute(f"ALTER TABLE {table} " + ", ".join(clauses))
    else:
        raise NotImplementedError(f'Unsupported database vendor: {vendor}')


def _forwards(apps, schema_editor):
    _alter_table(
        schema_editor, 'fisheries_aquaculturerecord', _AQUACULTURE_COLUMNS,
        mysql_clause=lambda name, t: f"MODIFY {name} {t} NOT NULL DEFAULT ''",
        postgres_clauses=lambda name, t: [
            f"ALTER COLUMN {name} TYPE {t}",
            f"ALTER COLUMN {name} SET DEFAULT ''",
            f"ALTER COLUMN {name} SET NOT NULL",
        ],
    )
    _alter_table(
        schema_editor, 'fisheries_capturerecord', _CAPTURE_COLUMNS,
        mysql_clause=lambda name, t: f"MODIFY {name} {t} NOT NULL DEFAULT ''",
        postgres_clauses=lambda name, t: [
            f"ALTER COLUMN {name} TYPE {t}",
            f"ALTER COLUMN {name} SET DEFAULT ''",
            f"ALTER COLUMN {name} SET NOT NULL",
        ],
    )


def _backwards(apps, schema_editor):
    _alter_table(
        schema_editor, 'fisheries_aquaculturerecord', _AQUACULTURE_COLUMNS,
        mysql_clause=lambda name, t: f"MODIFY {name} {t} NOT NULL",
        postgres_clauses=lambda name, t: [
            f"ALTER COLUMN {name} TYPE {t}",
            f"ALTER COLUMN {name} DROP DEFAULT",
            f"ALTER COLUMN {name} SET NOT NULL",
        ],
    )
    _alter_table(
        schema_editor, 'fisheries_capturerecord', _CAPTURE_COLUMNS,
        mysql_clause=lambda name, t: f"MODIFY {name} {t} NOT NULL",
        postgres_clauses=lambda name, t: [
            f"ALTER COLUMN {name} TYPE {t}",
            f"ALTER COLUMN {name} DROP DEFAULT",
            f"ALTER COLUMN {name} SET NOT NULL",
        ],
    )


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0033_fix_missing_association_affiliation_default'),
    ]

    operations = [
        migrations.RunPython(_forwards, _backwards, atomic=False),
    ]
