from django.db import migrations

# Real data migration, not just schema: every existing single source_agency
# string becomes a one-item source_agencies list (blank string -> empty
# list, not [""]) on both models. Reversible — the reverse direction takes
# the first list item back into the single string field, for any rollback.


def populate_source_agencies(apps, schema_editor):
    BeneficiaryRecord = apps.get_model('interventions', 'BeneficiaryRecord')
    FisherfolkBeneficiaryRecord = apps.get_model('interventions', 'FisherfolkBeneficiaryRecord')
    for model in (BeneficiaryRecord, FisherfolkBeneficiaryRecord):
        for record in model.objects.exclude(source_agency='').only('id', 'source_agency'):
            record.source_agencies = [record.source_agency]
            record.save(update_fields=['source_agencies'])


def revert_source_agencies(apps, schema_editor):
    BeneficiaryRecord = apps.get_model('interventions', 'BeneficiaryRecord')
    FisherfolkBeneficiaryRecord = apps.get_model('interventions', 'FisherfolkBeneficiaryRecord')
    for model in (BeneficiaryRecord, FisherfolkBeneficiaryRecord):
        for record in model.objects.exclude(source_agencies=[]).only('id', 'source_agencies'):
            record.source_agency = record.source_agencies[0] if record.source_agencies else ''
            record.save(update_fields=['source_agency'])


class Migration(migrations.Migration):

    dependencies = [
        ('interventions', '0014_add_source_agencies_and_type_fields'),
    ]

    operations = [
        migrations.RunPython(populate_source_agencies, revert_source_agencies),
    ]
