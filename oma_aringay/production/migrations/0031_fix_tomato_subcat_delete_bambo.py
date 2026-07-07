from django.db import migrations


def fix_tomato_subcategory_and_delete_bambo(apps, schema_editor):
    CropType = apps.get_model('production', 'CropType')
    CropSubcategory = apps.get_model('production', 'CropSubcategory')
    CropMonitoringRecord = apps.get_model('production', 'CropMonitoringRecord')
    CropActivityStage = apps.get_model('production', 'CropActivityStage')
    CropRemark = apps.get_model('production', 'CropRemark')
    DisasterResponseRule = apps.get_model('production', 'DisasterResponseRule')

    # ── Task 1: Fix Tomato subcategory to Vegetables ─────────────────────
    veg_sub = CropSubcategory.objects.filter(name='Vegetables').first()
    if veg_sub:
        CropType.objects.filter(id=3).update(subcategory=veg_sub)

    # ── Task 2: Delete Bambo Root (id=17) after confirming 0 records ────
    bambo = CropType.objects.filter(id=17).first()
    if bambo:
        record_count = (
            CropMonitoringRecord.objects.filter(crop_type=bambo).count()
            + CropActivityStage.objects.filter(crop_type=bambo).count()
            + CropRemark.objects.filter(crop_type=bambo).count()
            + DisasterResponseRule.objects.filter(crop_type=bambo).count()
        )
        if record_count == 0:
            bambo.delete()


def reverse_migration(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0030_merge_duplicate_crop_types'),
    ]

    operations = [
        migrations.RunPython(fix_tomato_subcategory_and_delete_bambo, reverse_migration),
    ]
