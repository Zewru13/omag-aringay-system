from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from auditlog.middleware import get_current_user
from auditlog.models import AuditLogEntry

from accounts.models import User
from farmers.models import Farmer, FarmParcel
from fisheries.models import Fisherfolk
from interventions.models import (
    BeneficiaryRecord,
    FisherfolkBeneficiaryRecord,
    InterventionProgram,
)
from production.models import HarvestRecord


def _log(action, model_name, object_repr):
    user = get_current_user()
    if user is None:
        return
    AuditLogEntry.objects.create(
        user=user,
        action=action,
        model_name=model_name,
        object_repr=object_repr,
    )


# ── accounts.User ─────────────────────────────────────────────────────────────

@receiver(post_save, sender=User)
def on_user_save(sender, instance, created, **kwargs):
    action = AuditLogEntry.Action.CREATE if created else AuditLogEntry.Action.UPDATE
    _log(action, 'User', f'{instance.full_name} ({instance.email})')


@receiver(post_delete, sender=User)
def on_user_delete(sender, instance, **kwargs):
    _log(AuditLogEntry.Action.DELETE, 'User', f'{instance.full_name} ({instance.email})')


# ── farmers.Farmer ────────────────────────────────────────────────────────────

@receiver(post_save, sender=Farmer)
def on_farmer_save(sender, instance, created, **kwargs):
    action = AuditLogEntry.Action.CREATE if created else AuditLogEntry.Action.UPDATE
    _log(action, 'Farmer', f'{instance.first_name} {instance.last_name} (RSBSA: {instance.rsbsa_number})')


@receiver(post_delete, sender=Farmer)
def on_farmer_delete(sender, instance, **kwargs):
    _log(AuditLogEntry.Action.DELETE, 'Farmer', f'{instance.first_name} {instance.last_name} (RSBSA: {instance.rsbsa_number})')


# ── farmers.FarmParcel ────────────────────────────────────────────────────────

@receiver(post_save, sender=FarmParcel)
def on_farm_parcel_save(sender, instance, created, **kwargs):
    action = AuditLogEntry.Action.CREATE if created else AuditLogEntry.Action.UPDATE
    _log(action, 'FarmParcel', f'Parcel {instance.parcel_number} (Farmer ID: {instance.farmer_id})')


@receiver(post_delete, sender=FarmParcel)
def on_farm_parcel_delete(sender, instance, **kwargs):
    _log(AuditLogEntry.Action.DELETE, 'FarmParcel', f'Parcel {instance.parcel_number} (Farmer ID: {instance.farmer_id})')


# ── fisheries.Fisherfolk ──────────────────────────────────────────────────────

@receiver(post_save, sender=Fisherfolk)
def on_fisherfolk_save(sender, instance, created, **kwargs):
    action = AuditLogEntry.Action.CREATE if created else AuditLogEntry.Action.UPDATE
    _log(action, 'Fisherfolk', f'{instance.first_name} {instance.last_name} (LGU: {instance.lgu_registration_number})')


@receiver(post_delete, sender=Fisherfolk)
def on_fisherfolk_delete(sender, instance, **kwargs):
    _log(AuditLogEntry.Action.DELETE, 'Fisherfolk', f'{instance.first_name} {instance.last_name} (LGU: {instance.lgu_registration_number})')


# ── interventions.InterventionProgram ─────────────────────────────────────────

@receiver(post_save, sender=InterventionProgram)
def on_intervention_program_save(sender, instance, created, **kwargs):
    action = AuditLogEntry.Action.CREATE if created else AuditLogEntry.Action.UPDATE
    _log(action, 'InterventionProgram', f'{instance.program_name} ({instance.year} {instance.season})')


@receiver(post_delete, sender=InterventionProgram)
def on_intervention_program_delete(sender, instance, **kwargs):
    _log(AuditLogEntry.Action.DELETE, 'InterventionProgram', f'{instance.program_name} ({instance.year} {instance.season})')


# ── interventions.BeneficiaryRecord ──────────────────────────────────────────

@receiver(post_save, sender=BeneficiaryRecord)
def on_beneficiary_record_save(sender, instance, created, **kwargs):
    action = AuditLogEntry.Action.CREATE if created else AuditLogEntry.Action.UPDATE
    _log(action, 'BeneficiaryRecord', f'Beneficiary record (Farmer ID: {instance.farmer_id}, Program ID: {instance.program_id})')


@receiver(post_delete, sender=BeneficiaryRecord)
def on_beneficiary_record_delete(sender, instance, **kwargs):
    _log(AuditLogEntry.Action.DELETE, 'BeneficiaryRecord', f'Beneficiary record (Farmer ID: {instance.farmer_id}, Program ID: {instance.program_id})')


# ── interventions.FisherfolkBeneficiaryRecord ─────────────────────────────────

@receiver(post_save, sender=FisherfolkBeneficiaryRecord)
def on_fisherfolk_beneficiary_save(sender, instance, created, **kwargs):
    action = AuditLogEntry.Action.CREATE if created else AuditLogEntry.Action.UPDATE
    _log(action, 'FisherfolkBeneficiaryRecord', f'Fisherfolk beneficiary record (Fisherfolk ID: {instance.fisherfolk_id}, Program ID: {instance.program_id})')


@receiver(post_delete, sender=FisherfolkBeneficiaryRecord)
def on_fisherfolk_beneficiary_delete(sender, instance, **kwargs):
    _log(AuditLogEntry.Action.DELETE, 'FisherfolkBeneficiaryRecord', f'Fisherfolk beneficiary record (Fisherfolk ID: {instance.fisherfolk_id}, Program ID: {instance.program_id})')


# ── production.HarvestRecord ──────────────────────────────────────────────────

@receiver(post_save, sender=HarvestRecord)
def on_harvest_record_save(sender, instance, created, **kwargs):
    action = AuditLogEntry.Action.CREATE if created else AuditLogEntry.Action.UPDATE
    _log(action, 'HarvestRecord', f'Harvest record (Parcel ID: {instance.farm_parcel_id}, {instance.season} {instance.year})')


@receiver(post_delete, sender=HarvestRecord)
def on_harvest_record_delete(sender, instance, **kwargs):
    _log(AuditLogEntry.Action.DELETE, 'HarvestRecord', f'Harvest record (Parcel ID: {instance.farm_parcel_id}, {instance.season} {instance.year})')
