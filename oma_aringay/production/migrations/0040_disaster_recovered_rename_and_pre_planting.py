# Batch D: "Resolved" -> "Recovered" terminology + manual-recovery note +
# pre-planting activity date exception.

from django.db import migrations, models


PRE_PLANTING_STAGE_NAMES = [
    'Land Preparation',
    'Seed Soaking',
    'Soil Preparation & Leveling',
    'Seed Bed Preparation',
    'Seed Sowing',
]


def convert_resolved_to_recovered(apps, schema_editor):
    CropDisasterReport = apps.get_model('production', 'CropDisasterReport')
    converted = CropDisasterReport.objects.filter(status='Resolved').update(status='Recovered')
    print(f'[0040] Converted {converted} CropDisasterReport row(s) from status=Resolved to status=Recovered.')


def revert_recovered_to_resolved(apps, schema_editor):
    CropDisasterReport = apps.get_model('production', 'CropDisasterReport')
    CropDisasterReport.objects.filter(status='Recovered').update(status='Resolved')


def flag_pre_planting_stages(apps, schema_editor):
    CropActivityStage = apps.get_model('production', 'CropActivityStage')
    updated = CropActivityStage.objects.filter(stage_name__in=PRE_PLANTING_STAGE_NAMES).update(allows_pre_planting=True)
    print(f'[0040] Flagged {updated} CropActivityStage row(s) as allows_pre_planting=True: {PRE_PLANTING_STAGE_NAMES}')


def unflag_pre_planting_stages(apps, schema_editor):
    CropActivityStage = apps.get_model('production', 'CropActivityStage')
    CropActivityStage.objects.filter(stage_name__in=PRE_PLANTING_STAGE_NAMES).update(allows_pre_planting=False)


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0039_merge_kamote_sitaw_cacao_duplicates'),
    ]

    operations = [
        # ── Change 1: Resolved -> Recovered ─────────────────────────────────
        migrations.RenameField(
            model_name='cropdisasterreport',
            old_name='resolved_date',
            new_name='recovered_date',
        ),
        migrations.RenameField(
            model_name='cropdisasterreport',
            old_name='resolved_by',
            new_name='recovered_by',
        ),
        migrations.AlterField(
            model_name='cropdisasterreport',
            name='status',
            field=models.CharField(
                choices=[('Active', 'Active'), ('Recovered', 'Recovered')],
                default='Active', max_length=20,
            ),
        ),
        migrations.RunPython(convert_resolved_to_recovered, revert_recovered_to_resolved),

        # ── Change 2: recovery_note ──────────────────────────────────────────
        migrations.AddField(
            model_name='cropdisasterreport',
            name='recovery_note',
            field=models.TextField(
                blank=True,
                help_text='Required when marked Recovered without all recommended response rules logged — '
                           'documents why/how it recovered without them (e.g. natural recovery, farmer '
                           'used their own method).',
            ),
        ),

        # ── Change 3: allows_pre_planting ────────────────────────────────────
        migrations.AddField(
            model_name='cropactivitystage',
            name='allows_pre_planting',
            field=models.BooleanField(
                default=False,
                help_text='If set, this activity may be logged with a date earlier than date_planted '
                           '(e.g. Land Preparation). Everything else must be logged on/after date_planted.',
            ),
        ),
        migrations.RunPython(flag_pre_planting_stages, unflag_pre_planting_stages),
    ]
