import logging

from django.contrib.auth import get_user_model

from .models import Notification

logger = logging.getLogger(__name__)


def notify_all_except(actor, verb, record_type, record_id, record_label, detail=''):
    """
    Fan out a Notification to every active user except `actor`. Small office,
    everyone sees everyone's activity.

    This must never be able to break the caller: any failure here is logged
    and swallowed, not raised, so it can't roll back or block the real
    log/disaster/harvest save it's reporting on. Call this AFTER that save
    has already committed.
    """
    try:
        User = get_user_model()
        recipients = User.objects.filter(is_active=True)
        if actor is not None:
            recipients = recipients.exclude(pk=actor.pk)

        notifications = [
            Notification(
                recipient=user,
                actor=actor,
                verb=verb,
                record_type=record_type,
                record_id=record_id,
                record_label=record_label,
                detail=detail,
            )
            for user in recipients
        ]
        Notification.objects.bulk_create(notifications)
    except Exception:
        logger.exception(
            'Notification fan-out failed (non-fatal): verb=%r record=%s:%s',
            verb, record_type, record_id,
        )


def _safe_bulk(notifications, context):
    """Shared failure policy with notify_all_except: a notification problem
    must never roll back or block the real save it is reporting on."""
    try:
        Notification.objects.bulk_create(notifications)
    except Exception:
        logger.exception('Notification create failed (non-fatal): %s', context)


def notify_staff(actor, verb, record_type, record_id, record_label, detail=''):
    """
    Fan out to ADMIN/EVALUATOR only.

    Deliberately not notify_all_except(): that one goes to every active
    user, which now includes every CITIZEN account. Using it for a profile
    change request would tell every farmer and fisherfolk in the
    municipality that some stranger asked to change their surname.
    """
    try:
        User = get_user_model()
        recipients = User.objects.filter(is_active=True, role__in=('ADMIN', 'EVALUATOR'))
        if actor is not None:
            recipients = recipients.exclude(pk=actor.pk)
        _safe_bulk(
            [
                Notification(
                    recipient=user, actor=actor, verb=verb,
                    record_type=record_type, record_id=record_id,
                    record_label=record_label, detail=detail,
                )
                for user in recipients
            ],
            f'notify_staff verb={verb!r} record={record_type}:{record_id}',
        )
    except Exception:
        logger.exception('notify_staff failed (non-fatal): verb=%r', verb)


def notify_user(recipient, actor, verb, record_type, record_id, record_label, detail=''):
    """Notify exactly ONE user — used to tell a citizen the outcome of their
    own request. No fan-out: nobody else has any business seeing it."""
    if recipient is None:
        return
    _safe_bulk(
        [
            Notification(
                recipient=recipient, actor=actor, verb=verb,
                record_type=record_type, record_id=record_id,
                record_label=record_label, detail=detail,
            )
        ],
        f'notify_user recipient={recipient.pk} verb={verb!r}',
    )


def resolve_owner_user(farmer_id=None, farmers_organization_id=None, fisherfolk_id=None):
    """
    Resolve the single CITIZEN account that is the most relevant recipient
    for a Farmer / FarmersOrganization / Fisherfolk record, for use with
    notify_user(). A crop record can carry both farmer_id and
    farmers_organization_id — when it does, the individual farmer's own
    citizen account (if any, and active) is always preferred over the
    organization's; the org account is only used when no individual owner
    can be resolved. Returns None if nothing resolves (the record has no
    activated citizen account at all), which notify_user() already treats
    as a no-op.
    """
    User = get_user_model()

    if farmer_id:
        user = User.objects.filter(
            linked_record_type=User.LinkedRecordType.FARMER,
            linked_record_id=farmer_id,
            is_active=True,
        ).first()
        if user is not None:
            return user

    if farmers_organization_id:
        user = User.objects.filter(
            linked_record_type=User.LinkedRecordType.FARMERS_ORG,
            linked_record_id=farmers_organization_id,
            is_active=True,
        ).first()
        if user is not None:
            return user

    if fisherfolk_id:
        return User.objects.filter(
            linked_record_type=User.LinkedRecordType.FISHERFOLK,
            linked_record_id=fisherfolk_id,
            is_active=True,
        ).first()

    return None
