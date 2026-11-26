"""Farmers, fisherfolk and organizations also get their notifications by e-mail. Staff read theirs in the system."""
import logging

from django.conf import settings
from django.core.mail import send_mass_mail
from django.db import transaction

from accounts.login_email import is_deliverable

from .mailer import in_background

logger = logging.getLogger(__name__)


def _message(notification):
    user = notification.recipient
    lines = [f'Hello {user.full_name or user.email},', '', f'{notification.verb}: {notification.record_label}']
    if notification.detail:
        lines.append(notification.detail)
    if settings.FRONTEND_BASE_URL:
        lines += ['', f'Sign in to see it: {settings.FRONTEND_BASE_URL}']
    lines += ['', 'Office of the Municipal Agriculturist, Aringay, La Union']
    subject = ' '.join(f'OMAg Aringay: {notification.verb} {notification.record_label}'.split())[:150]
    return subject, '\n'.join(lines), settings.DEFAULT_FROM_EMAIL, [user.email]


def _send(messages):
    send_mass_mail(messages, fail_silently=False)


def email_citizen_notifications(notifications):
    """E-mail each of these saved notifications whose recipient is a citizen with a real address, once the surrounding
    transaction has committed. Never raises: a mail problem must not undo or block what is being reported."""
    if not settings.SMTP_CONFIGURED:
        return
    try:
        messages = tuple(
            _message(n) for n in notifications
            if n.recipient.role == 'CITIZEN' and n.recipient.is_active and is_deliverable(n.recipient.email))
    except Exception:
        logger.exception('Preparing notification e-mails failed (non-fatal)')
        return
    if messages:
        transaction.on_commit(lambda: in_background(_send, messages))
