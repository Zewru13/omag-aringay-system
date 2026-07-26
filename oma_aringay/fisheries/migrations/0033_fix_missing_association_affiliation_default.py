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
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0032_fix_missing_fisherfolk_association_position'),
    ]

    operations = [
        migrations.RunSQL(
            sql="ALTER TABLE fisheries_fisherfolk MODIFY association_affiliation varchar(150) NOT NULL DEFAULT ''",
            reverse_sql="ALTER TABLE fisheries_fisherfolk MODIFY association_affiliation varchar(150) NOT NULL",
        ),
    ]
