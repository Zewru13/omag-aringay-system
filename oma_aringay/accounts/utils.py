import secrets
import smtplib

from django.conf import settings
from django.core.mail import send_mail


def citizen_account_info(linked_record_type, record_id):
    """
    Batch 10: {'id': ..., 'is_active': ...} for the CITIZEN account linked
    to (linked_record_type, record_id), or None if no such account exists.
    Shared by the Farmer/Fisherfolk/FarmersOrganization/
    FisherfolkOrganization detail serializers to drive the staff-facing
    "Activate Account" button — deferred import avoids a module-level
    circular import (accounts.models itself lazily imports farmers/
    fisheries/associations inside User.get_linked_record for the same reason).
    """
    from accounts.models import User
    account = User.objects.filter(
        linked_record_type=linked_record_type, linked_record_id=record_id,
    ).only('id', 'is_active').first()
    if account is None:
        return None
    return {'id': account.id, 'is_active': account.is_active}


def generate_default_password():
    """~22 url-safe characters — well over the 15-char policy minimum, and
    random enough to never collide with the common-password or local
    denylists, so it always passes AUTH_PASSWORD_VALIDATORS untouched."""
    return secrets.token_urlsafe(16)


def generate_verification_token():
    """Random, single-use email-verification token. Cleared on successful
    verification, which is what makes it single-use — a replayed token no
    longer matches any user."""
    return secrets.token_urlsafe(32)


def resolve_frontend_base_url(request=None):
    """
    settings.FRONTEND_BASE_URL wins when set (e.g. local dev, where the
    frontend runs on a different port than the API). Otherwise derive
    scheme://host straight from the incoming request — on a LAN deployment
    that's whatever IP/hostname the admin is actually reaching this server
    at right now (http://192.168.x.x), never a hardcoded public domain.
    Falls back to localhost only when no request is available at all (there
    always should be one — every caller here is a live view).
    """
    if settings.FRONTEND_BASE_URL:
        return settings.FRONTEND_BASE_URL
    if request is not None:
        return f'{request.scheme}://{request.get_host()}'
    return 'http://localhost:5173'


def build_verification_link(token, request=None):
    base = resolve_frontend_base_url(request)
    return f'{base}/verify-email?token={token}'


def _send(subject, message, recipient_email):
    """
    Shared send wrapper. Returns (success, reason).

    This is the hybrid-fallback boundary: ANY failure here — SMTP not
    configured, auth error, connection refused, a recipient address the
    mail server rejects outright — is caught and reported as a reason
    string, never raised. The caller (UserCreateView) always proceeds with
    account creation either way; a failed send just means the admin-relay
    fallback takes over instead of email delivery.
    """
    if not settings.SMTP_CONFIGURED:
        # settings.py points EMAIL_BACKEND at the console backend when SMTP
        # is unconfigured, so this still prints the full email to stdout —
        # useful for local dev to eyeball the content — but printing to a
        # terminal is not the user receiving anything. Always report this as
        # unsent so the caller falls back to the admin-relay panel.
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [recipient_email], fail_silently=True)
        return False, 'SMTP is not configured on this server (EMAIL_HOST_USER / EMAIL_HOST_PASSWORD are blank in .env).'

    try:
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [recipient_email], fail_silently=False)
        return True, None
    except smtplib.SMTPAuthenticationError:
        return False, 'The configured SMTP account rejected the login (check EMAIL_HOST_USER / EMAIL_HOST_PASSWORD).'
    except smtplib.SMTPRecipientsRefused:
        return False, f'The mail server rejected the recipient address ({recipient_email}).'
    except (smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected, ConnectionRefusedError, OSError) as exc:
        return False, f'Could not connect to the mail server ({exc}).'
    except Exception as exc:
        return False, f'Email sending failed ({exc}).'


def send_welcome_email(user, plain_password, verification_link):
    """
    Send the new user their verification link + temporary password. Returns
    (success, reason) — see _send(). Account is unusable until the user
    clicks the verification link (see accounts.views.VerifyEmailView).
    """
    subject = 'Verify your email — OMA Aringay account created'
    message = (
        f'Hello {user.full_name or user.email},\n\n'
        f'An account has been created for you on the OMA Aringay Integrated '
        f'Agricultural Monitoring and Production Management System.\n\n'
        f'1) Click the link below to verify your email and activate your account:\n'
        f'{verification_link}\n\n'
        f'2) Then log in with the temporary password below and set your own:\n\n'
        f'Login email: {user.email}\n'
        f'Temporary password: {plain_password}\n\n'
        f'This verification link expires in {settings.EMAIL_VERIFICATION_TOKEN_HOURS} hours.\n\n'
        f'If you did not expect this account, please contact the Office of '
        f'the Municipal Agriculturist, Aringay, La Union.\n'
    )
    return _send(subject, message, user.email)


def send_verification_email(user, verification_link):
    """Resend-only email — just the link, no password (the original
    plaintext password can't be recovered once hashed; an admin can reset it
    via the reset_admin_password command or the User Management UI if the
    user has genuinely lost it). Returns (success, reason)."""
    subject = 'Your OMA Aringay verification link'
    message = (
        f'Hello {user.full_name or user.email},\n\n'
        f'Here is your new verification link — click it to verify your email '
        f'and activate your account:\n\n'
        f'{verification_link}\n\n'
        f'This link expires in {settings.EMAIL_VERIFICATION_TOKEN_HOURS} hours.\n\n'
        f"If you don't remember your temporary password, contact your "
        f'system administrator to have it reset.\n'
    )
    return _send(subject, message, user.email)
