"""A citizen account that staff set up must be verified within settings.CITIZEN_SETUP_VALID_DAYS days: the person signs
in and sets their own password (or sets it with a "forgot password" link). Otherwise the setup is cancelled: the account
goes back to "not set up" and staff set it up again.

A setup not yet verified is: an active citizen account with must_change_password and an expiry time. There is no
scheduler, so the rule is applied wherever it matters, just before the account is used or shown."""
from django.contrib.auth.hashers import make_password
from django.utils import timezone

from .models import User

CANCELLED = ('This account was not verified in time, so its setup was cancelled. Visit the Office of the Municipal '
             'Agriculturist to set it up again.')


def _overdue():
    return User.objects.filter(role=User.Roles.CITIZEN, is_active=True, must_change_password=True,
                               temp_password_expires_at__lt=timezone.now())


def _cancel(user_id):
    # One conditional UPDATE: someone who sets their password at the same moment is not cancelled.
    return _overdue().filter(pk=user_id).update(
        is_active=False, password=make_password(None), must_change_password=False, temp_password_expires_at=None)


def cancel_if_overdue(user):
    """True when `user`'s setup had run out and has now been cancelled."""
    if not (user and user.role == User.Roles.CITIZEN and user.must_change_password and user.temp_password_expires_at
            and user.temp_password_expires_at < timezone.now()):
        return False
    if not _cancel(user.pk):
        return False
    user.refresh_from_db(fields=['is_active', 'password', 'must_change_password', 'temp_password_expires_at'])
    return True


def cancel_overdue_setups():
    """Cancel every setup that has run out. Costs one query when there is none."""
    for user_id in list(_overdue().values_list('pk', flat=True)):
        _cancel(user_id)
