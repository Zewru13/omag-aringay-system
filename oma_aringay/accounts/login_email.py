"""The one place that decides what a citizen account's sign-in e-mail may be.

A farmer, fisherfolk or organization signs in with their e-mail, and the same address gets the password reset link and
the notifications. It is stored on the account (User.email) and mirrored on their record (Farmer.email,
Fisherfolk.email, the organization's email_address). One address belongs to one account."""
from django.core.exceptions import ValidationError
from django.core.validators import validate_email

from accounts.models import User

TAKEN = 'This email is already used to sign in to another account.'
INVALID = 'Enter a valid email address.'
REQUIRED = 'An email address is required: it is how this account signs in.'


class LoginEmailError(Exception):
    pass


def normalize(email):
    return str(email or '').strip().lower()


def record_field(record_type):
    organization = record_type in (User.LinkedRecordType.FARMERS_ORG, User.LinkedRecordType.FISHERFOLK_ORG)
    return 'email_address' if organization else 'email'


def record_model(record_type):
    from associations.models import FarmersOrganization, FisherfolkOrganization
    from farmers.models import Farmer
    from fisheries.models import Fisherfolk
    return {
        User.LinkedRecordType.FARMER: Farmer,
        User.LinkedRecordType.FISHERFOLK: Fisherfolk,
        User.LinkedRecordType.FARMERS_ORG: FarmersOrganization,
        User.LinkedRecordType.FISHERFOLK_ORG: FisherfolkOrganization,
    }[record_type]


def account_for_record(record_type, record_id):
    return User.objects.filter(linked_records__record_type=record_type, linked_records__record_id=record_id,
                               linked_records__is_active=True).first()


def is_taken(email, exclude_user_id=None):
    email = normalize(email)
    if not email:
        return False
    others = User.objects.filter(email__iexact=email)
    if exclude_user_id:
        others = others.exclude(pk=exclude_user_id)
    return others.exists()


def is_deliverable(email):
    """False for the placeholder addresses that imports and sample data leave behind: nothing sent to them arrives."""
    domain = normalize(email).rpartition('@')[2]
    return bool(domain) and domain not in ('example.com', 'example.net', 'example.org') and not domain.endswith('.invalid')


def address_on_record(user):
    record = user.get_linked_record()
    return normalize(getattr(record, record_field(user.linked_record_type), '')) if record is not None else ''


def checked_login_email(user, email):
    """The normalized address `user` may sign in with: `email` if given, else the one they already have (on the account,
    then on their record). Raises LoginEmailError when there is none, or it is malformed or somebody else's."""
    email = normalize(email) or normalize(user.email) or address_on_record(user)
    if not email:
        raise LoginEmailError(REQUIRED)
    try:
        validate_email(email)
    except ValidationError:
        raise LoginEmailError(INVALID)
    if is_taken(email, exclude_user_id=user.pk):
        raise LoginEmailError(TAKEN)
    return email


def apply_login_email(user, email):
    """Save an already checked address on the account and mirror it on its record. The caller saves the rest of `user`."""
    user.email = email
    user.save(update_fields=['email'])
    if user.linked_record_type:
        # .update(): the record's own save signal must not run the sync back the other way.
        record_model(user.linked_record_type).objects.filter(pk=user.linked_record_id).update(
            **{record_field(user.linked_record_type): email})


def validate_record_email(value, record_type, instance=None):
    """For the record forms: refuse an address that another account signs in with. Unchanged values pass."""
    new = normalize(value)
    if not new:
        return value
    if instance is not None and new == normalize(getattr(instance, record_field(record_type), '')):
        return value
    account = account_for_record(record_type, instance.pk) if instance is not None else None
    if is_taken(new, exclude_user_id=account.pk if account else None):
        from rest_framework.serializers import ValidationError as SerializerValidationError
        raise SerializerValidationError(TAKEN)
    return value


def sync_from_record(record_type, record):
    """A record's e-mail was saved: the account signs in with it from now on. A blank never removes the sign-in e-mail,
    and an address that is another account's is left alone."""
    email = normalize(getattr(record, record_field(record_type), ''))
    if not email:
        return
    account = account_for_record(record_type, record.pk)
    if account is None or normalize(account.email) == email or is_taken(email, exclude_user_id=account.pk):
        return
    User.objects.filter(pk=account.pk).update(email=email)
