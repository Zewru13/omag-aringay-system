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

    Password-reveal batch: last_login added — the frontend's sessionStorage
    password reveal uses it as the real "has this citizen actually logged
    in yet" signal (see LoginView, which now actually sets it — it was
    previously never populated anywhere in this app) to clear a stored
    reveal the moment it's genuinely obsolete, rather than only on its own
    time-based expiry.
    """
    from accounts.models import User
    account = User.objects.filter(
        linked_record_type=linked_record_type, linked_record_id=record_id,
    ).only('id', 'is_active', 'last_login').first()
    if account is None:
        return None
    return {
        'id': account.id,
        'is_active': account.is_active,
        'last_login': account.last_login.isoformat() if account.last_login else None,
    }


def generate_default_password():
    """~22 url-safe characters — well over the 15-char policy minimum, and
    random enough to never collide with the common-password or local
    denylists, so it always passes AUTH_PASSWORD_VALIDATORS untouched. Used
    for ADMIN/EVALUATOR account creation (UserCreateView), the
    reset_admin_password command, and CITIZEN account activation
    (accounts.views.SetCitizenPasswordView) — every one of those flows has
    staff relay the password to the account's owner in person or by email,
    never the person typing it into a form themselves."""
    return secrets.token_urlsafe(16)


def existing_citizen_shell_for_rsbsa(rsbsa_number, exclude_record_type=None):
    """
    Dual-registration support: a real person can legitimately hold both a
    Farmer and a Fisherfolk record under the exact same RSBSA number (e.g.
    someone who genuinely farms AND fishes) — confirmed real cases: Edmar
    Picar, Christopher Villanueva, Venerando Obra, each already registered
    as Fisherfolk before also turning up as Farmer/Farmworker in the crop
    registry under the same number. That is NOT a data error and the second
    domain's record is real and should be created. What must never happen
    is a SECOND citizen login for the same person, for a structural reason
    that has nothing to do with database uniqueness: create_inactive_citizen_
    shell()'s username is '{record_type}-{record.id}' (e.g. 'farmer-4020' vs
    'fisherfolk-654'), so two shells for the same person would never collide
    at the database level — no IntegrityError would ever be raised. The real
    risk is in accounts.views._resolve_login_identifier, which resolves an
    RSBSA-number login by checking Farmer before Fisherfolk, UNCONDITIONALLY,
    regardless of which shell is older or already active. A second shell
    would either become permanently unreachable by RSBSA-number login, or —
    worse, if the newer shell happens to be the one checked first — silently
    steal the login route away from the person's real, possibly already-
    activated existing account. Either way, the person must end up with
    exactly one reachable citizen login, no matter how many domain records
    they hold.

    Returns the existing User already linked to a Farmer or Fisherfolk
    record with this exact rsbsa_number, checking both domains (skipping
    `exclude_record_type`'s table, since a brand-new record being created
    right now is by definition the only row for its own rsbsa_number in its
    own table — nothing there yet to find), or None if neither domain has a
    shell for it. General by construction: keyed purely on rsbsa_number, so
    it applies identically to any future person found via this same pattern,
    not just the three named above.
    """
    from accounts.models import User
    from farmers.models import Farmer
    from fisheries.models import Fisherfolk

    for model, rtype in (
        (Farmer, User.LinkedRecordType.FARMER),
        (Fisherfolk, User.LinkedRecordType.FISHERFOLK),
    ):
        if rtype == exclude_record_type:
            continue
        other = model.objects.filter(rsbsa_number=rsbsa_number).first()
        if other is None:
            continue
        shell = User.objects.filter(linked_record_type=rtype, linked_record_id=other.id).first()
        if shell is not None:
            return shell
    return None


def create_inactive_citizen_shell(record_type, record, email=None):
    """
    Creates an inactive, unusable-password CITIZEN account shell for a
    Farmer/Fisherfolk/FarmersOrganization/FisherfolkOrganization record —
    the same shape create_citizen_accounts' bulk backfill produces, so a
    record enrolled today and one enrolled two years ago both end up
    waiting on the same in-person "Set Up Account" visit
    (accounts.views.SetCitizenPasswordView), which generates the real
    password and activates the account. Used by both that command and
    Farmer/FisherfolkListView.perform_create at enrollment time.

    `record` is the Farmer/Fisherfolk/FarmersOrganization/
    FisherfolkOrganization instance; its display name is read the same way
    create_citizen_accounts does (full_name for people, name for orgs).
    `email` is optional — these accounts still have no required email
    (RSBSA/registration number is the login identifier either way), but if
    the person gave one during enrollment it's worth keeping on the account.

    Returns the new User, or None if no shell was created — which happens
    only for FARMER/FISHERFOLK records whose rsbsa_number already has a
    reachable citizen shell under the other domain (see
    existing_citizen_shell_for_rsbsa's own docstring for exactly why a
    second one is unsafe, not just redundant). Every existing caller treats
    this as a bare statement and never used the return value, so returning
    None here is not a breaking change for any of them; a caller that DOES
    want to report "no new login" (e.g. the RSBSA/crop importers' dual-
    registration commit paths) can now check it explicitly.
    """
    from accounts.models import User

    rsbsa_number = getattr(record, 'rsbsa_number', None)
    if rsbsa_number and record_type in (User.LinkedRecordType.FARMER, User.LinkedRecordType.FISHERFOLK):
        if existing_citizen_shell_for_rsbsa(rsbsa_number, exclude_record_type=record_type) is not None:
            return None

    full_name = getattr(record, 'full_name', None) or getattr(record, 'name', '')
    user = User(
        username=f'{record_type.lower()}-{record.id}',
        email=email or None,
        full_name=full_name,
        role=User.Roles.CITIZEN,
        is_active=False,
        must_change_password=False,
        linked_record_type=record_type,
        linked_record_id=record.id,
    )
    user.set_unusable_password()
    user.save()
    return user


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
