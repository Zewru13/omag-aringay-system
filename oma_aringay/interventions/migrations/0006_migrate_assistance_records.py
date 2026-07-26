# Batch 6 data migration: copies every production.CropAssistanceRecord row
# into interventions.BeneficiaryRecord (program=null), and every
# fisheries.FisheriesAssistanceRecord row into
# interventions.FisherfolkBeneficiaryRecord (program=null). Run BEFORE the
# source tables are dropped (see 0007_retire_source_assistance_tables, which
# depends on this migration). A full SQL backup of both source tables was
# taken first: db_backups/pre_assistance_unification_20260726_191158.sql.
#
# Field mapping (crop -> BeneficiaryRecord):
#   farmer -> farmer, assistance_type -> assistance_type,
#   description -> remarks, quantity -> quantity, date_received -> date_given,
#   source_agency -> source_agency, season -> season, year -> year,
#   logged_by -> recorded_by
# Field mapping (fisheries -> FisherfolkBeneficiaryRecord):
#   fisherfolk -> fisherfolk, assistance_type -> assistance_type,
#   description -> description (kept distinct from remarks — the source model
#   had both, holding different data), quantity -> quantity,
#   date_received -> date_given, source_agency -> source_agency,
#   season -> season, year -> year, remarks -> remarks,
#   recorded_by -> recorded_by
#
# Reverse is a no-op: an exact inverse would require re-splitting merged rows
# back into two separate app tables and is not meaningful once program-based
# ad-hoc rows created after this migration are indistinguishable from
# migrated ones. Roll back via the SQL backup above if ever needed.

from django.db import migrations


def migrate_assistance_records(apps, schema_editor):
    CropAssistanceRecord = apps.get_model('production', 'CropAssistanceRecord')
    FisheriesAssistanceRecord = apps.get_model('fisheries', 'FisheriesAssistanceRecord')
    BeneficiaryRecord = apps.get_model('interventions', 'BeneficiaryRecord')
    FisherfolkBeneficiaryRecord = apps.get_model('interventions', 'FisherfolkBeneficiaryRecord')

    for rec in CropAssistanceRecord.objects.all():
        BeneficiaryRecord.objects.create(
            program=None,
            farmer_id=rec.farmer_id,
            assistance_type=rec.assistance_type,
            source_agency=rec.source_agency,
            quantity=rec.quantity,
            date_given=rec.date_received,
            season=rec.season,
            year=rec.year,
            remarks=rec.description,
            recorded_by_id=rec.logged_by_id,
        )

    for rec in FisheriesAssistanceRecord.objects.all():
        FisherfolkBeneficiaryRecord.objects.create(
            program=None,
            fisherfolk_id=rec.fisherfolk_id,
            assistance_type=rec.assistance_type,
            source_agency=rec.source_agency,
            quantity=rec.quantity,
            date_given=rec.date_received,
            season=rec.season,
            year=rec.year,
            description=rec.description,
            remarks=rec.remarks,
            recorded_by_id=rec.recorded_by_id,
        )


class Migration(migrations.Migration):

    dependencies = [
        ('interventions', '0005_extend_beneficiary_records_adhoc'),
        ('production', '0044_add_crop_assistance_record'),
        ('fisheries', '0041_seed_feed_types'),
    ]

    operations = [
        migrations.RunPython(migrate_assistance_records, migrations.RunPython.noop),
    ]
