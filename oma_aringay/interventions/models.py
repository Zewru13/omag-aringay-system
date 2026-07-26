from django.conf import settings
from django.db import models

from associations.models import FarmersOrganization, FisherfolkOrganization, FisherfolkOrganizationMember
from farmers.models import Farmer
from fisheries.models import Fisherfolk


def _resolve_attributed_organization(candidates, own_barangay):
    """
    Batch 7: shared resolution algorithm for BOTH BeneficiaryRecord and
    FisherfolkBeneficiaryRecord, applied to whichever list of organizations
    is that person's actual live membership set:
      - farmers: [Farmer.farmers_organization] if set, else [] — a farmer
        can never have more than one entry here (single direct FK is the
        only live membership mechanism; FarmersOrganizationMember, the join
        table, is confirmed dormant — see its model docstring). The 2+
        branches below are therefore unreachable for farmers today, but are
        shared rather than special-cased away so both domains run one
        tested code path.
      - fisherfolk: every FisherfolkOrganization from that fisherfolk's
        FisherfolkOrganizationMember rows — this IS the live, unconstrained
        multi-membership mechanism (OrganizationDetailPage's manual
        add/remove), so 2+ is a real possibility here even though current
        data has none.
    Resolution:
      0 candidates       -> None
      1 candidate        -> that one (barangay irrelevant)
      2+, exactly 1 match -> the matching one
      2+, 0 matches       -> None (don't guess)
      2+, 2+ matches      -> None (data-quality anomaly — organizations are
                              meant to be barangay-exclusive; caller should
                              treat this as worth a manual look, not silence)
    """
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]
    matches = [org for org in candidates if org.barangay == own_barangay]
    if len(matches) == 1:
        return matches[0]
    return None


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


# Batch 6: BeneficiaryRecord now serves two modes:
#   - Program-based (original): program set, quantity_given/unit set, the six
#     ad-hoc-only fields below left blank. Created via
#     /interventions/programs/<id>/beneficiaries/ (AddBeneficiaryModal), tied
#     to a formal InterventionProgram campaign.
#   - Ad-hoc (absorbed from production.CropAssistanceRecord): program=null,
#     assistance_type/source_agency/quantity/season/year set, quantity_given/
#     unit left blank. This is a standalone assistance log entry with no
#     campaign — what CropAssistancePage.jsx represents.
# unique_together=[['program','farmer']] still holds: SQL/MySQL treats every
# NULL as distinct for uniqueness purposes, so multiple program=null rows for
# the same farmer are correctly allowed (ad-hoc assistance isn't one-time-
# ever), while duplicate (program, farmer) pairs for a real program still
# correctly reject.
class BeneficiaryRecord(models.Model):
    class AssistanceType(models.TextChoices):
        # Mirrors production.models.CropAssistanceRecord.ASSISTANCE_TYPE_CHOICES exactly.
        FERTILIZER = 'Fertilizer', 'Fertilizer'
        SEEDS = 'Seeds', 'Seeds'
        EQUIPMENT = 'Equipment', 'Equipment'
        CASH_ASSISTANCE = 'Cash Assistance', 'Cash Assistance'
        TRAINING = 'Training', 'Training'
        OTHER = 'Other', 'Other'

    class Season(models.TextChoices):
        DRY = 'Dry', 'Dry'
        WET = 'Wet', 'Wet'

    program = models.ForeignKey(
        InterventionProgram,
        on_delete=models.CASCADE,
        related_name='beneficiary_records',
        null=True,
        blank=True,
    )
    farmer = models.ForeignKey(
        Farmer,
        on_delete=models.CASCADE,
        related_name='beneficiary_records',
    )
    quantity_given = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    unit = models.CharField(max_length=50, blank=True)
    date_given = models.DateField()
    remarks = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_beneficiary_records',
    )

    # Ad-hoc-only fields (blank when program is set) — absorbed from
    # production.models.CropAssistanceRecord (Batch 6).
    assistance_type = models.CharField(max_length=30, choices=AssistanceType.choices, blank=True)
    source_agency = models.CharField(max_length=150, blank=True)
    quantity = models.CharField(max_length=100, blank=True)
    season = models.CharField(max_length=10, choices=Season.choices, blank=True)
    year = models.PositiveIntegerField(null=True, blank=True)

    # Batch 7: computed at save() time, not exposed as a writable API field —
    # see _resolve_attributed_organization's docstring above for the algorithm.
    attributed_organization = models.ForeignKey(
        FarmersOrganization,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='attributed_beneficiary_records',
    )

    class Meta:
        unique_together = [['program', 'farmer']]

    def save(self, *args, **kwargs):
        if self.farmer_id:
            farmer = self.farmer
            candidates = [farmer.farmers_organization] if farmer.farmers_organization_id else []
            self.attributed_organization = _resolve_attributed_organization(candidates, farmer.barangay)
        else:
            self.attributed_organization = None
        super().save(*args, **kwargs)

    def __str__(self):
        label = self.program.program_name if self.program else (self.assistance_type or 'Ad-hoc')
        return f'{label} - {self.farmer.full_name}'


# Batch 6: same program-based / ad-hoc duality as BeneficiaryRecord above.
# Ad-hoc rows (program=null) absorb fisheries.models.FisheriesAssistanceRecord
# — which is why this model additionally carries `description` as a field
# distinct from `remarks` (the retiring model had both, holding genuinely
# different data — description was a required summary, remarks was a free
# optional note — so both are preserved rather than collapsed into one).
class FisherfolkBeneficiaryRecord(models.Model):
    class AssistanceType(models.TextChoices):
        # Mirrors fisheries.models.FisheriesAssistanceRecord.ASSISTANCE_TYPE_CHOICES exactly.
        FISHING_GEAR = 'Fishing Gear', 'Fishing Gear'
        BOAT_VESSEL = 'Boat/Vessel', 'Boat/Vessel'
        FINGERLINGS_SEEDS = 'Fingerlings/Seeds', 'Fingerlings/Seeds'
        FEED = 'Feed', 'Feed'
        EQUIPMENT = 'Equipment', 'Equipment'
        CASH_ASSISTANCE = 'Cash Assistance', 'Cash Assistance'
        TRAINING = 'Training', 'Training'
        OTHER = 'Other', 'Other'

    program = models.ForeignKey(
        InterventionProgram,
        on_delete=models.CASCADE,
        related_name='fisherfolk_beneficiary_records',
        null=True,
        blank=True,
    )
    fisherfolk = models.ForeignKey(
        Fisherfolk,
        on_delete=models.CASCADE,
        related_name='beneficiary_records',
    )
    quantity_given = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    unit = models.CharField(max_length=50, blank=True)
    date_given = models.DateField()
    remarks = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_fisherfolk_beneficiary_records',
    )

    # Ad-hoc-only fields (blank when program is set) — absorbed from
    # fisheries.models.FisheriesAssistanceRecord (Batch 6).
    assistance_type = models.CharField(max_length=30, choices=AssistanceType.choices, blank=True)
    source_agency = models.CharField(max_length=150, blank=True)
    quantity = models.CharField(max_length=100, blank=True)
    description = models.CharField(max_length=300, blank=True)
    season = models.CharField(max_length=20, blank=True)
    year = models.PositiveIntegerField(null=True, blank=True)

    # Batch 7: computed at save() time from FisherfolkOrganizationMember —
    # the live, genuinely-multi-capable membership mechanism for fisherfolk
    # (unlike the farmer side, Fisherfolk.fisherfolk_organization is a
    # write-only direct FK set at registration but never read back anywhere
    # in the frontend, so it is NOT used as a resolution candidate here).
    attributed_fisherfolk_organization = models.ForeignKey(
        FisherfolkOrganization,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='attributed_beneficiary_records',
    )

    class Meta:
        unique_together = [['program', 'fisherfolk']]

    def save(self, *args, **kwargs):
        if self.fisherfolk_id:
            fisherfolk = self.fisherfolk
            candidates = [
                m.organization for m in
                FisherfolkOrganizationMember.objects.filter(fisherfolk_id=self.fisherfolk_id).select_related('organization')
            ]
            self.attributed_fisherfolk_organization = _resolve_attributed_organization(candidates, fisherfolk.barangay)
        else:
            self.attributed_fisherfolk_organization = None
        super().save(*args, **kwargs)

    def __str__(self):
        label = self.program.program_name if self.program else (self.assistance_type or 'Ad-hoc')
        return f'{label} - {self.fisherfolk.full_name}'
