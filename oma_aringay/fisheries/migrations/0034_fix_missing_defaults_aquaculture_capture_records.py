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
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0033_fix_missing_association_affiliation_default'),
    ]

    operations = [
        migrations.RunSQL(
            sql=(
                "ALTER TABLE fisheries_aquaculturerecord "
                "MODIFY average_size_of_fingerlings varchar(100) NOT NULL DEFAULT '', "
                "MODIFY fingerling_source varchar(150) NOT NULL DEFAULT '', "
                "MODIFY location varchar(150) NOT NULL DEFAULT '', "
                "MODIFY production_cycle varchar(100) NOT NULL DEFAULT '', "
                "MODIFY stocking_density varchar(100) NOT NULL DEFAULT '', "
                "MODIFY water_source varchar(100) NOT NULL DEFAULT ''"
            ),
            reverse_sql=(
                "ALTER TABLE fisheries_aquaculturerecord "
                "MODIFY average_size_of_fingerlings varchar(100) NOT NULL, "
                "MODIFY fingerling_source varchar(150) NOT NULL, "
                "MODIFY location varchar(150) NOT NULL, "
                "MODIFY production_cycle varchar(100) NOT NULL, "
                "MODIFY stocking_density varchar(100) NOT NULL, "
                "MODIFY water_source varchar(100) NOT NULL"
            ),
        ),
        migrations.RunSQL(
            sql=(
                "ALTER TABLE fisheries_capturerecord "
                "MODIFY boat_name varchar(150) NOT NULL DEFAULT '', "
                "MODIFY boat_operator varchar(150) NOT NULL DEFAULT '', "
                "MODIFY species_caught varchar(150) NOT NULL DEFAULT ''"
            ),
            reverse_sql=(
                "ALTER TABLE fisheries_capturerecord "
                "MODIFY boat_name varchar(150) NOT NULL, "
                "MODIFY boat_operator varchar(150) NOT NULL, "
                "MODIFY species_caught varchar(150) NOT NULL"
            ),
        ),
    ]
