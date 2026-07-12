from django.db import migrations, transaction

# Three CropType pairs left over from an earlier duplicate-merge pass
# (migration 0030) that missed these. In each pair the "survivor" (parent-
# name row) holds the varieties/records, but the "orphan" (short-name row)
# turned out to still hold CropActivityStage rows seeded against the
# approved short crop name — so this is a real FK reference, not the "should
# be none" case originally assumed. Those stages are reassigned to the
# survivor before the orphan is deleted, then the survivor is renamed to the
# short approved name.
#
# (survivor_id, survivor_name, orphan_id, orphan_name, final_name)
PAIRS = [
    (13, 'Sweet Potato (Kamote)', 17, 'Kamote', 'Kamote'),
    (15, 'String Beans (Sitaw)',  20, 'Sitaw',  'Sitaw'),
    (7,  'Cacao (Kakaw)',         21, 'Cacao',  'Cacao'),
]


def merge_forward(apps, schema_editor):
    CropType = apps.get_model('production', 'CropType')
    CropMonitoringRecord = apps.get_model('production', 'CropMonitoringRecord')
    CropVariety = apps.get_model('production', 'CropVariety')
    CropActivityStage = apps.get_model('production', 'CropActivityStage')
    CropRemark = apps.get_model('production', 'CropRemark')
    DisasterResponseRule = apps.get_model('production', 'DisasterResponseRule')

    with transaction.atomic():
        for survivor_id, survivor_name, orphan_id, orphan_name, final_name in PAIRS:
            survivor = CropType.objects.filter(pk=survivor_id, name=survivor_name).first()
            orphan = CropType.objects.filter(pk=orphan_id, name=orphan_name).first()

            if survivor is None or orphan is None:
                # Already merged, or data has moved since this migration was
                # written — don't guess, leave it alone.
                continue

            # Re-confirm live, right before deleting: guard against anything
            # having been added to the orphan since this migration was drafted.
            leftover_records = CropMonitoringRecord.objects.filter(crop_type_id=orphan.id).count()
            leftover_varieties = CropVariety.objects.filter(crop_type_id=orphan.id).count()
            leftover_remarks = CropRemark.objects.filter(crop_type_id=orphan.id).count()
            leftover_rules = DisasterResponseRule.objects.filter(crop_type_id=orphan.id).count()
            if leftover_records or leftover_varieties or leftover_remarks or leftover_rules:
                raise RuntimeError(
                    f'Refusing to delete CropType {orphan.id} ({orphan_name}): '
                    f'found {leftover_records} monitoring record(s), {leftover_varieties} '
                    f'variet(y/ies), {leftover_remarks} remark(s), {leftover_rules} disaster '
                    f'rule(s) still pointing at it. Investigate before re-running.'
                )

            # The orphan DOES hold CropActivityStage rows (seeded against the
            # short crop name) — reassign rather than let on_delete=CASCADE
            # silently destroy them.
            CropActivityStage.objects.filter(crop_type_id=orphan.id).update(crop_type_id=survivor.id)

            # Delete the now-empty orphan before renaming the survivor, so the
            # unique constraint on CropType.name never sees two rows with the
            # same name at once.
            orphan.delete()

            survivor.name = final_name
            survivor.save(update_fields=['name'])


def merge_reverse(apps, schema_editor):
    # Not reconstructible — the orphan rows are gone. No-op, matching the
    # precedent set by migration 0031's irreversible cleanup.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0038_seed_crop_varieties_batch1'),
    ]

    operations = [
        migrations.RunPython(merge_forward, reverse_code=merge_reverse),
    ]
