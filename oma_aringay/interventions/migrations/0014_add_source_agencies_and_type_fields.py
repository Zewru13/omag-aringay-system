import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('interventions', '0013_fisherfolkbeneficiaryconfirmationrequest_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='beneficiaryrecord',
            name='source_agencies',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='beneficiaryrecord',
            name='training_duration_days',
            field=models.PositiveSmallIntegerField(
                blank=True, null=True,
                validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(3)],
            ),
        ),
        migrations.AddField(
            model_name='beneficiaryrecord',
            name='equipment_type',
            field=models.CharField(blank=True, max_length=150),
        ),
        migrations.AddField(
            model_name='beneficiaryrecord',
            name='seed_type',
            field=models.CharField(blank=True, max_length=150),
        ),
        migrations.AddField(
            model_name='beneficiaryrecord',
            name='fertilizer_type',
            field=models.CharField(blank=True, max_length=150),
        ),
        migrations.AddField(
            model_name='fisherfolkbeneficiaryrecord',
            name='source_agencies',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='fisherfolkbeneficiaryrecord',
            name='training_duration_days',
            field=models.PositiveSmallIntegerField(
                blank=True, null=True,
                validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(3)],
            ),
        ),
        migrations.AddField(
            model_name='fisherfolkbeneficiaryrecord',
            name='equipment_type',
            field=models.CharField(blank=True, max_length=150),
        ),
    ]
