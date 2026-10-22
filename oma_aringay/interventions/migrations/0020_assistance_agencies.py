from django.db import migrations, models

AGENCIES = [
    'LGU - Aringay',
    'Office of the Provincial Agriculturist',
    'Department of Agriculture (DA)',
    'Department of Agrarian Reform (DAR)',
    'Non-Government Organization (NGO)',
]


def seed(apps, schema_editor):
    Agency = apps.get_model('interventions', 'AssistanceAgency')
    for name in AGENCIES:
        Agency.objects.get_or_create(name=name)


class Migration(migrations.Migration):

    dependencies = [
        ('interventions', '0019_assistance_distributions'),
    ]

    operations = [
        migrations.CreateModel(
            name='AssistanceAgency',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=150, unique=True)),
                ('is_active', models.BooleanField(default=True)),
            ],
            options={'verbose_name_plural': 'assistance agencies', 'ordering': ['name']},
        ),
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
