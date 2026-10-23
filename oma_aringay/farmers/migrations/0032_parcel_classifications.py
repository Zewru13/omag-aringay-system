from django.db import migrations, models

# The three fixed tick-boxes every parcel used to have become the first three entries of the managed list.
DEFAULTS = [
    ('is_organic', 'Organic Farm'),
    ('within_ancestral_domain', 'Within Ancestral Domain'),
    ('is_agrarian_reform_beneficiary', 'Agrarian Reform Beneficiary'),
]


def copy_ticks_to_names(apps, schema_editor):
    ParcelClassification = apps.get_model('farmers', 'ParcelClassification')
    FarmParcel = apps.get_model('farmers', 'FarmParcel')
    for _, name in DEFAULTS:
        ParcelClassification.objects.get_or_create(name=name)
    for parcel in FarmParcel.objects.all().only('id', *[field for field, _ in DEFAULTS]):
        names = [name for field, name in DEFAULTS if getattr(parcel, field)]
        if names:
            FarmParcel.objects.filter(pk=parcel.pk).update(classifications=names)


def copy_names_to_ticks(apps, schema_editor):
    FarmParcel = apps.get_model('farmers', 'FarmParcel')
    for parcel in FarmParcel.objects.exclude(classifications=[]).only('id', 'classifications'):
        names = set(parcel.classifications or [])
        FarmParcel.objects.filter(pk=parcel.pk).update(**{field: name in names for field, name in DEFAULTS})


class Migration(migrations.Migration):

    dependencies = [
        ('farmers', '0031_remove_farmer_is_active_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='ParcelClassification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=150, unique=True)),
                ('is_active', models.BooleanField(default=True)),
            ],
            options={'ordering': ['name']},
        ),
        migrations.AddField(
            model_name='farmparcel',
            name='classifications',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(copy_ticks_to_names, copy_names_to_ticks),
    ]
