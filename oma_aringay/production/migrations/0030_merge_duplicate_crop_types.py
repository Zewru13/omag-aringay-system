from django.db import migrations


MERGES = [
    (1, 25),    # Rice -> Palay (Rice)
    (2, 26),    # Corn -> Corn (Mais)
    (4, 27),    # Eggplant -> Eggplant (Talong)
    (8, 30),    # Caffee -> Coffee (Kape)
    (14, 20),   # Bitter Gourd -> Ampalaya (0 records, safe delete)
    (15, 29),   # String Beans -> Sitaw (0 records, safe delete)
]


def merge_crop_types(apps, schema_editor):
    CropType = apps.get_model('production', 'CropType')
    CropMonitoringRecord = apps.get_model('production', 'CropMonitoringRecord')
    CropActivityStage = apps.get_model('production', 'CropActivityStage')
    CropRemark = apps.get_model('production', 'CropRemark')
    DisasterResponseRule = apps.get_model('production', 'DisasterResponseRule')

    for bad_id, good_id in MERGES:
        try:
            good = CropType.objects.get(id=good_id)
        except CropType.DoesNotExist:
            continue

        CropMonitoringRecord.objects.filter(crop_type_id=bad_id).update(crop_type_id=good_id)
        CropActivityStage.objects.filter(crop_type_id=bad_id).update(crop_type_id=good_id)
        CropRemark.objects.filter(crop_type_id=bad_id).update(crop_type_id=good_id)
        DisasterResponseRule.objects.filter(crop_type_id=bad_id).update(crop_type_id=good_id)

        CropType.objects.filter(id=bad_id).delete()

    CropType.objects.filter(id=18).update(name='Watermelon')


def reverse_merge(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0029_correct_barangay_choices'),
    ]

    operations = [
        migrations.RunPython(merge_crop_types, reverse_merge),
    ]
