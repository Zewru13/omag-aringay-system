from django.conf import settings
from django.db import models

from farmers.models import Farmer
from fisheries.models import Fisherfolk


class InterventionProgram(models.Model):
    class ProgramType(models.TextChoices):
        SEEDS = 'Seeds', 'Seeds'
        FERTILIZER = 'Fertilizer', 'Fertilizer'
        RFFA_CASH = 'RFFA Cash', 'RFFA Cash'
        EQUIPMENT = 'Equipment', 'Equipment'
        OTHER = 'Other', 'Other'

    class Season(models.TextChoices):
        DRY = 'Dry', 'Dry'
        WET = 'Wet', 'Wet'

    class SourceOfProgram(models.TextChoices):
        LGU = 'LGU - Aringay', 'LGU - Aringay'
        OPA = 'Office of the Provincial Agriculturist', 'Office of the Provincial Agriculturist'
        DA = 'Department of Agriculture (DA)', 'Department of Agriculture (DA)'
        DAR = 'Department of Agrarian Reform (DAR)', 'Department of Agrarian Reform (DAR)'
        NGO = 'Non-Government Organization (NGO)', 'Non-Government Organization (NGO)'
        OTHER = 'Other', 'Other'

    program_name = models.CharField(max_length=150)
    program_type = models.CharField(max_length=30, choices=ProgramType.choices)
    source_of_program = models.CharField(
        max_length=60,
        choices=SourceOfProgram.choices,
        default=SourceOfProgram.LGU,
    )
    source_other_specify = models.CharField(max_length=150, blank=True)
    season = models.CharField(max_length=10, choices=Season.choices)
    year = models.PositiveIntegerField()
    description = models.TextField(blank=True)
    target_beneficiaries = models.IntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_intervention_programs',
    )
    date_created = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.program_name} - {self.season} {self.year}'


class BeneficiaryRecord(models.Model):
    program = models.ForeignKey(
        InterventionProgram,
        on_delete=models.CASCADE,
        related_name='beneficiary_records',
    )
    farmer = models.ForeignKey(
        Farmer,
        on_delete=models.CASCADE,
        related_name='beneficiary_records',
    )
    quantity_given = models.DecimalField(max_digits=12, decimal_places=2)
    unit = models.CharField(max_length=50)
    date_given = models.DateField()
    remarks = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_beneficiary_records',
    )

    class Meta:
        unique_together = [['program', 'farmer']]

    def __str__(self):
        return f'{self.program.program_name} - {self.farmer.full_name}'


class FisherfolkBeneficiaryRecord(models.Model):
    program = models.ForeignKey(
        InterventionProgram,
        on_delete=models.CASCADE,
        related_name='fisherfolk_beneficiary_records',
    )
    fisherfolk = models.ForeignKey(
        Fisherfolk,
        on_delete=models.CASCADE,
        related_name='beneficiary_records',
    )
    quantity_given = models.DecimalField(max_digits=12, decimal_places=2)
    unit = models.CharField(max_length=50)
    date_given = models.DateField()
    remarks = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_fisherfolk_beneficiary_records',
    )

    class Meta:
        unique_together = [['program', 'fisherfolk']]

    def __str__(self):
        return f'{self.program.program_name} - {self.fisherfolk.full_name}'
