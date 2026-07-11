import secrets

from django.conf import settings
from django.core.mail import send_mail


def generate_default_password():
    """~22 url-safe characters — well over the 15-char policy minimum, and
    random enough to never collide with the common-password or local
    denylists, so it always passes AUTH_PASSWORD_VALIDATORS untouched."""
    return secrets.token_urlsafe(16)


def send_welcome_email(user, plain_password):
    """Send the new user their login email + temporary password.
    Returns True on success, False if sending failed (caller decides how to
    relay the password to the admin instead)."""
    subject = 'Your OMA Aringay account has been created'
    message = (
        f'Hello {user.full_name or user.email},\n\n'
        f'An account has been created for you on the OMA Aringay Integrated '
        f'Agricultural Monitoring and Production Management System.\n\n'
        f'Login email: {user.email}\n'
        f'Temporary password: {plain_password}\n\n'
        f'Please log in and change this password immediately. You will be '
        f'required to set a new password before you can use the system.\n\n'
        f'If you did not expect this account, please contact the Office of '
        f'the Municipal Agriculturist, Aringay, La Union.\n'
    )
    try:
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
            fail_silently=False,
        )
        return True
    except Exception:
        return False
