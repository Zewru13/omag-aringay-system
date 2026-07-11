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
