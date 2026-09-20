import logging

from django.conf import settings
from django.contrib.auth import get_user_model

from .models import Notification

logger = logging.getLogger(__name__)

# Hardening batch: the four free-text fields _safe_bulk checks before every
# insert, and their OWN real max_length — not assumed to share one number
# (record_type=50 as of this batch, verb=100, record_label=detail=255; see
# Notification's own field definitions, which remain the single source of
# truth this reads from directly rather than duplicating the numbers here).
_NOTIFICATION_TEXT_FIELDS = ['record_type', 'verb', 'record_label', 'detail']


def notify_all_except(actor, verb, record_type, record_id, record_label, detail=''):
    """
    Fan out a Notification to every active user except `actor`. Small office,
    everyone sees everyone's activity.

    This must never be able to break the caller: any failure here is logged
    and swallowed, not raised, so it can't roll back or block the real
    log/disaster/harvest save it's reporting on. Call this AFTER that save
    has already committed.

    Hardening batch: routed through _safe_bulk (see notify_staff's own
    comment for the identical reasoning) instead of doing its own separate
    bulk_create + try/except — this was previously a THIRD, independently-
    unguarded failure mode for the exact same field-length problem
    _safe_bulk now catches for notify_staff/notify_user. The try/except
    here wraps ONLY recipient resolution/list-building; _safe_bulk owns the
    insert itself and its own complete failure policy.
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
    except Exception:
        logger.exception(
            'Notification fan-out failed (non-fatal): verb=%r record=%s:%s',
            verb, record_type, record_id,
        )
        return
    _safe_bulk(notifications, f'notify_all_except verb={verb!r} record={record_type}:{record_id}')


def _overlong_notification_field(notifications):
    """
    First (field_name, value, limit) among `notifications` whose value
    exceeds that field's own real max_length, or None if all fit. Checks
    record_type/verb/record_label/detail individually — each field's limit
    is read straight off Notification's own field definition, not assumed
    to match any other field's, since they genuinely differ (record_type=50,
    verb=100, record_label=detail=255).

    Hardening batch: added after Notification.record_type's old 20-char
    ceiling silently swallowed a real notification twice — once originally,
    and again despite the warning comment that first occurrence left behind.
    A pre-check here, run unconditionally before every bulk_create, is what
    makes a third silent occurrence structurally hard: see _safe_bulk below
    for what happens with the result.
    """
    limits = {name: Notification._meta.get_field(name).max_length for name in _NOTIFICATION_TEXT_FIELDS}
    for n in notifications:
        for field_name in _NOTIFICATION_TEXT_FIELDS:
            value = getattr(n, field_name) or ''
            limit = limits[field_name]
            if len(value) > limit:
                return field_name, value, limit
    return None


def _safe_bulk(notifications, context):
    """
    Shared failure policy with notify_all_except: a notification problem
    must never roll back or block the real save it is reporting on.

    Hardening batch: checks every notification's text fields against their
    real max_length before attempting the insert (see
    _overlong_notification_field). In DEBUG, an overflow raises immediately,
    naming the exact field, offending value, its length, and the limit —
    caught the moment a developer runs the offending call site, rather than
    silently logged and missed. Outside DEBUG (real production), the
    failure policy is unchanged: non-fatal, logged, never raised — but the
    log message now carries that same field/value/length detail, so a real
    occurrence is diagnosable from the log alone, without needing to
    reproduce it.
    """
    overflow = _overlong_notification_field(notifications)
    if overflow:
        field_name, value, limit = overflow
        message = (
            f'Notification field {field_name!r} is {len(value)} chars, exceeds '
            f'max_length={limit}: {value!r} ({context})'
        )
        if settings.DEBUG:
            raise ValueError(message)
        logger.error('Notification create failed (non-fatal): %s — %s', context, message)
        return

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

    Hardening batch: the try/except here now wraps ONLY recipient
    resolution/list-building, not the _safe_bulk() call — _safe_bulk already
    owns its own complete failure policy (non-fatal+logged outside DEBUG,
    a deliberate raise on a field-length overflow inside DEBUG), and a
    second blanket `except Exception` wrapped around it here would silently
    re-swallow that deliberate raise before it ever reached the caller,
    defeating the whole point of the hardening — confirmed happening
    exactly that way when this was live-tested.
    """
    try:
        User = get_user_model()
        recipients = User.objects.filter(is_active=True, role__in=('ADMIN', 'EVALUATOR'))
        if actor is not None:
            recipients = recipients.exclude(pk=actor.pk)
        notifications = [
            Notification(
                recipient=user, actor=actor, verb=verb,
                record_type=record_type, record_id=record_id,
                record_label=record_label, detail=detail,
            )
            for user in recipients
        ]
    except Exception:
        logger.exception('notify_staff failed (non-fatal): verb=%r', verb)
        return
    _safe_bulk(notifications, f'notify_staff verb={verb!r} record={record_type}:{record_id}')


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


def resolve_owner_user(farmer_id=None, farmers_organization_id=None, fisherfolk_id=None, fisherfolk_organization_id=None):
    """
    Resolve the single CITIZEN account that is the most relevant recipient
    for a Farmer / FarmersOrganization / Fisherfolk / FisherfolkOrganization
    record, for use with notify_user(). A crop record can carry both
    farmer_id and farmers_organization_id — when it does, the individual
    farmer's own citizen account (if any, and active) is always preferred
    over the organization's; the org account is only used when no
    individual owner can be resolved. Same priority for fisherfolk_id vs
    fisherfolk_organization_id. Returns None if nothing resolves (the
    record has no activated citizen account at all), which notify_user()
    already treats as a no-op.
    """
    User = get_user_model()

    # Switchable-identity Phase 2: each block below queries through
    # UserLinkedRecord (linked_records__...) rather than the old columns —
    # a database .filter() can't be satisfied by a Python property. Two
    # DIFFERENT "is_active" concepts collide here on purpose, kept as two
    # separate conditions: User.is_active (the account itself has been
    # activated — unchanged, this gate already existed) and
    # linked_records__is_active (THIS is the record the user currently has
    # active — new). A dual-linked citizen must only be notified about a
    # domain's event while that domain is the one they're actually using.
    if farmer_id:
        user = User.objects.filter(
            linked_records__record_type=User.LinkedRecordType.FARMER,
            linked_records__record_id=farmer_id,
            linked_records__is_active=True,
            is_active=True,
        ).first()
        if user is not None:
            return user

    if farmers_organization_id:
        user = User.objects.filter(
            linked_records__record_type=User.LinkedRecordType.FARMERS_ORG,
            linked_records__record_id=farmers_organization_id,
            linked_records__is_active=True,
            is_active=True,
        ).first()
        if user is not None:
            return user

    if fisherfolk_id:
        user = User.objects.filter(
            linked_records__record_type=User.LinkedRecordType.FISHERFOLK,
            linked_records__record_id=fisherfolk_id,
            linked_records__is_active=True,
            is_active=True,
        ).first()
        if user is not None:
            return user

    if fisherfolk_organization_id:
        return User.objects.filter(
            linked_records__record_type=User.LinkedRecordType.FISHERFOLK_ORG,
            linked_records__record_id=fisherfolk_organization_id,
            linked_records__is_active=True,
            is_active=True,
        ).first()

    return None
