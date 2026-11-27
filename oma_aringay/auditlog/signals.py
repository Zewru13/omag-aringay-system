from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from auditlog.capture import actor_of, current, request_being_recorded
from auditlog.middleware import get_current_user
from auditlog.models import AuditLogEntry
from auditlog.system_user import get_system_user

from accounts.models import User
from farmers.models import Farmer, FarmParcel
from fisheries.models import Fisherfolk
from interventions.models import (
    BeneficiaryRecord,
    FisherfolkBeneficiaryRecord,
)
from production.models import HarvestRecord


def _log(action, model_name, object_repr):
    # A signed-in account's request gets ONE entry for the whole action (auditlog.recorder), so nothing is added per record here.
    # This per-record entry is for the rest: scripts, management commands and requests made while signed out.
    if request_being_recorded():
        return
    # Outside a real HTTP request (a management command, a shell script, a
    # one-off investigation script) there's no thread-local user to read —
    # this used to just return here, silently losing the entry entirely.
    # Falling back to the shared system account instead means every save
    # this signal covers gets a real entry, always correctly attributed
    # either to who actually did it (a real request) or to the fact that
    # it happened outside the app (the system account) — never neither.
    collector = current()
    user = (actor_of(collector.request) if collector is not None else get_current_user()) or get_system_user()
    AuditLogEntry.objects.create(
        user=user,
        action=action,
        model_name=model_name,
        object_repr=object_repr,
    )


RESET_BY_LINK = {'password', 'must_change_password', 'temp_password_expires_at'}


# ── accounts.User ─────────────────────────────────────────────────────────────

@receiver(post_save, sender=User)
def on_user_save(sender, instance, created, update_fields=None, **kwargs):
    if update_fields and set(update_fields) == {'last_login'}:
        return   # signing in changes nothing about the account; staff sign-ins have their own entry
    if update_fields and set(update_fields) == RESET_BY_LINK:
        return   # a password reset from the e-mail link has its own entry, in the person's name (accounts.password_reset)
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
    _log(action, 'Fisherfolk', f'{instance.first_name} {instance.last_name} (RSBSA: {instance.rsbsa_number})')


@receiver(post_delete, sender=Fisherfolk)
def on_fisherfolk_delete(sender, instance, **kwargs):
    _log(AuditLogEntry.Action.DELETE, 'Fisherfolk', f'{instance.first_name} {instance.last_name} (RSBSA: {instance.rsbsa_number})')


# ── interventions.BeneficiaryRecord ──────────────────────────────────────────

@receiver(post_save, sender=BeneficiaryRecord)
def on_beneficiary_record_save(sender, instance, created, **kwargs):
    action = AuditLogEntry.Action.CREATE if created else AuditLogEntry.Action.UPDATE
    _log(action, 'BeneficiaryRecord', f'Beneficiary record (Farmer ID: {instance.farmer_id})')


@receiver(post_delete, sender=BeneficiaryRecord)
def on_beneficiary_record_delete(sender, instance, **kwargs):
    _log(AuditLogEntry.Action.DELETE, 'BeneficiaryRecord', f'Beneficiary record (Farmer ID: {instance.farmer_id})')


# ── interventions.FisherfolkBeneficiaryRecord ─────────────────────────────────

@receiver(post_save, sender=FisherfolkBeneficiaryRecord)
def on_fisherfolk_beneficiary_save(sender, instance, created, **kwargs):
    action = AuditLogEntry.Action.CREATE if created else AuditLogEntry.Action.UPDATE
    _log(action, 'FisherfolkBeneficiaryRecord', f'Fisherfolk beneficiary record (Fisherfolk ID: {instance.fisherfolk_id})')


@receiver(post_delete, sender=FisherfolkBeneficiaryRecord)
def on_fisherfolk_beneficiary_delete(sender, instance, **kwargs):
    _log(AuditLogEntry.Action.DELETE, 'FisherfolkBeneficiaryRecord', f'Fisherfolk beneficiary record (Fisherfolk ID: {instance.fisherfolk_id})')


# ── production.HarvestRecord ──────────────────────────────────────────────────

@receiver(post_save, sender=HarvestRecord)
def on_harvest_record_save(sender, instance, created, **kwargs):
    action = AuditLogEntry.Action.CREATE if created else AuditLogEntry.Action.UPDATE
    _log(action, 'HarvestRecord', f'Harvest record (Parcel ID: {instance.farm_parcel_id}, {instance.season} {instance.year})')


@receiver(post_delete, sender=HarvestRecord)
def on_harvest_record_delete(sender, instance, **kwargs):
    _log(AuditLogEntry.Action.DELETE, 'HarvestRecord', f'Harvest record (Parcel ID: {instance.farm_parcel_id}, {instance.season} {instance.year})')
