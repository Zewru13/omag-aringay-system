# Batch D: "Resolved" -> "Recovered" terminology + manual-recovery note +
# pre-planting activity date exception.

from django.db import migrations, models


PRE_PLANTING_ACTIVITY_NAMES = [
    'Pond Preparation',
]


def convert_resolved_to_recovered(apps, schema_editor):
    FisheriesDisasterReport = apps.get_model('fisheries', 'FisheriesDisasterReport')
    converted = FisheriesDisasterReport.objects.filter(status='Resolved').update(status='Recovered')
    print(f'[0029] Converted {converted} FisheriesDisasterReport row(s) from status=Resolved to status=Recovered.')


def revert_recovered_to_resolved(apps, schema_editor):
    FisheriesDisasterReport = apps.get_model('fisheries', 'FisheriesDisasterReport')
    FisheriesDisasterReport.objects.filter(status='Recovered').update(status='Resolved')


def flag_pre_planting_stages(apps, schema_editor):
    SpeciesActivityStage = apps.get_model('fisheries', 'SpeciesActivityStage')
    updated = SpeciesActivityStage.objects.filter(activity_name__in=PRE_PLANTING_ACTIVITY_NAMES).update(allows_pre_planting=True)
    print(f'[0029] Flagged {updated} SpeciesActivityStage row(s) as allows_pre_planting=True: {PRE_PLANTING_ACTIVITY_NAMES}')


def unflag_pre_planting_stages(apps, schema_editor):
    SpeciesActivityStage = apps.get_model('fisheries', 'SpeciesActivityStage')
    SpeciesActivityStage.objects.filter(activity_name__in=PRE_PLANTING_ACTIVITY_NAMES).update(allows_pre_planting=False)


class Migration(migrations.Migration):

    dependencies = [
        ('fisheries', '0028_fishingtriplog_vesselinspection_tripspeciesentry_and_more'),
    ]

    operations = [
        # ── Change 1: Resolved -> Recovered ─────────────────────────────────
        migrations.RenameField(
            model_name='fisheriesdisasterreport',
            old_name='resolved_date',
            new_name='recovered_date',
        ),
        migrations.RenameField(
            model_name='fisheriesdisasterreport',
            old_name='resolved_by',
            new_name='recovered_by',
        ),
        migrations.AlterField(
            model_name='fisheriesdisasterreport',
            name='status',
            field=models.CharField(
                choices=[('Active', 'Active'), ('Recovered', 'Recovered')],
                default='Active', max_length=20,
            ),
        ),
        migrations.RunPython(convert_resolved_to_recovered, revert_recovered_to_resolved),

        # ── Change 2: recovery_note ──────────────────────────────────────────
        migrations.AddField(
            model_name='fisheriesdisasterreport',
            name='recovery_note',
            field=models.TextField(
                blank=True,
                help_text='Required when marked Recovered without all recommended response rules logged — '
                           'documents why/how it recovered without them (e.g. natural recovery, fisherfolk '
                           'used their own method).',
            ),
        ),

        # ── Change 3: allows_pre_planting ────────────────────────────────────
        migrations.AddField(
            model_name='speciesactivitystage',
            name='allows_pre_planting',
            field=models.BooleanField(
                default=False,
                help_text='If set, this activity may be logged with a date earlier than date_stocked '
                           '(e.g. Pond Preparation). Everything else must be logged on/after date_stocked.',
            ),
        ),
        migrations.RunPython(flag_pre_planting_stages, unflag_pre_planting_stages),
    ]
