# Batch 7 backfill: re-saves every existing BeneficiaryRecord and
# FisherfolkBeneficiaryRecord so attributed_organization /
# attributed_fisherfolk_organization (added in 0007, both null on existing
# rows since AddField can't compute values) get resolved via the real
# model save() logic. Uses the concrete model classes (not
# apps.get_model's historical/frozen models) because the resolution
# algorithm lives in Python on the model, not in the schema — the usual
# tradeoff for a one-off backfill that depends on business logic.
#
# Phase 2 fix: update_fields is now explicit rather than None, and the read
# side is restricted with .only() too. Both models' save() only ever mutates
# attributed_organization / attributed_fisherfolk_organization on this update
# path (the status field it also sets is guarded by `if self._state.adding`,
# which is always False for these pre-existing rows) — so this is a no-op
# behavior change today. It matters for a from-scratch replay: later
# migration 0010 adds a `status` column that doesn't exist yet at this point
# in migration history. update_fields=None told the ORM to UPDATE every
# current field (including status); separately, .all() without .only() told
# it to SELECT every current field too — both referenced a column that
# wasn't there yet. Restricting both the read and the write to the two
# fields this migration actually touches avoids that regardless of what the
# model has grown since.
from django.db import migrations


def backfill_attributed_organization(apps, schema_editor):
    from interventions.models import BeneficiaryRecord, FisherfolkBeneficiaryRecord

    for rec in BeneficiaryRecord.objects.select_related('farmer').only('id', 'farmer'):
        rec.save(update_fields=['attributed_organization'])

    for rec in FisherfolkBeneficiaryRecord.objects.select_related('fisherfolk').only('id', 'fisherfolk'):
        rec.save(update_fields=['attributed_fisherfolk_organization'])


class Migration(migrations.Migration):

    dependencies = [
        ('interventions', '0007_add_attributed_organization'),
    ]

    operations = [
        migrations.RunPython(backfill_attributed_organization, migrations.RunPython.noop),
    ]
