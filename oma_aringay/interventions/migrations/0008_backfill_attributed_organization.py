# Batch 7 backfill: re-saves every existing BeneficiaryRecord and
# FisherfolkBeneficiaryRecord so attributed_organization /
# attributed_fisherfolk_organization (added in 0007, both null on existing
# rows since AddField can't compute values) get resolved via the real
# model save() logic. Uses the concrete model classes (not
# apps.get_model's historical/frozen models) because the resolution
# algorithm lives in Python on the model, not in the schema — the usual
# tradeoff for a one-off backfill that depends on business logic.

from django.db import migrations


def backfill_attributed_organization(apps, schema_editor):
    from interventions.models import BeneficiaryRecord, FisherfolkBeneficiaryRecord

    for rec in BeneficiaryRecord.objects.select_related('farmer').all():
        rec.save(update_fields=None)

    for rec in FisherfolkBeneficiaryRecord.objects.select_related('fisherfolk').all():
        rec.save(update_fields=None)


class Migration(migrations.Migration):

    dependencies = [
        ('interventions', '0007_add_attributed_organization'),
    ]

    operations = [
        migrations.RunPython(backfill_attributed_organization, migrations.RunPython.noop),
    ]
