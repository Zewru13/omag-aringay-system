import secrets
import smtplib
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone


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
    # Switchable-identity Phase 2: queries THROUGH UserLinkedRecord rather
    # than the old linked_record_type/id columns directly — those columns
    # are a Python-level property shim wherever the majority of this app
    # still reads them, but this is a database-level .filter(), which a
    # property can never satisfy (Django can't turn a Python property into
    # a SQL WHERE clause). Restricted to the ACTIVE link specifically, so a
    # dual-linked citizen's inactive domain never surfaces here.
    account = User.objects.filter(
        linked_records__record_type=linked_record_type,
        linked_records__record_id=record_id,
        linked_records__is_active=True,
    ).only('id', 'is_active', 'last_login').first()
    if account is None:
        return None
    return {
        'id': account.id,
        'is_active': account.is_active,
        'last_login': account.last_login.isoformat() if account.last_login else None,
    }


def accountless_or_unactivated_ids(linked_record_type, record_ids):
    """
    Subset of `record_ids` (Farmer or Fisherfolk pks, per `linked_record_type`)
    that have NO working citizen account — no linked shell at all, or one that
    exists but has never been activated (User.is_active False). This is the
    exact eligibility signal for an organization's on-behalf-of assistance
    confirmation (interventions.models.BeneficiaryConfirmationRequest /
    FisherfolkBeneficiaryConfirmationRequest): a beneficiary with a real,
    active account can always self-confirm through BeneficiaryConfirmReceivedView
    and must never be offered this path instead.

    Same "active UserLinkedRecord" scoping citizen_account_info() already
    uses for the single-record "Activate Account" button — batched into one
    query here instead of one query per record, for list views.
    """
    from accounts.models import User

    record_ids = set(record_ids)
    if not record_ids:
        return set()
    active_account_ids = set(
        User.objects.filter(
            linked_records__record_type=linked_record_type,
            linked_records__record_id__in=record_ids,
            linked_records__is_active=True,
            is_active=True,
        ).values_list('linked_records__record_id', flat=True)
    )
    return record_ids - active_account_ids


# Short fish and crop names (4-6 letters) for the readable temporary password. None contains a term from
# accounts.validators.LOCAL_DENYLIST_TERMS (checked by a test).
_WORDS = (
    'Bangus', 'Dalag', 'Hipon', 'Tahong', 'Palay', 'Mais', 'Saging', 'Kamote', 'Mangga', 'Okra',
    'Sitaw', 'Talong', 'Pechay', 'Luya', 'Bawang', 'Tulya', 'Ulang', 'Isda', 'Sugpo', 'Dilis',
    'Pusit', 'Kuhol', 'Santol', 'Papaya', 'Atis', 'Durian', 'Gabi', 'Mani', 'Munggo', 'Camote',
    'Sayote', 'Lemon',
)
_SPECIALS = '#@!$%'


def generate_default_password():
    """A short, readable temporary password such as 'Bangus#48271536': a fish or crop word, one special
    character and eight digits (about 34 bits, tried against a throttled login). It always satisfies the password policy (1 capital, 1 special character,
    3 numbers, at least 8 characters), is easy to read aloud, and is only ever a temporary password: it
    must be changed at first login and expires (see issue_temporary_password). Used for ADMIN/EVALUATOR
    account creation, CITIZEN account activation and regeneration, and organization activation."""
    digits = ''.join(secrets.choice('0123456789') for _ in range(8))
    return f'{secrets.choice(_WORDS)}{secrets.choice(_SPECIALS)}{digits}'


def issue_temporary_password(user):
    """Give `user` a new temporary password that must be changed at the next login and stops working after
    settings.TEMP_PASSWORD_VALID_DAYS. Saves the user (it does not touch is_active) and returns the plain
    password, which the caller must hand over once and never store or log."""
    password = generate_default_password()
    user.set_password(password)
    user.must_change_password = True
    user.temp_password_expires_at = timezone.now() + timedelta(days=settings.TEMP_PASSWORD_VALID_DAYS)
    user.save()
    return password


def temp_password_expired(user):
    return bool(user.must_change_password and user.temp_password_expires_at
                and user.temp_password_expires_at < timezone.now())


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
        # Switchable-identity Phase 2: query through UserLinkedRecord, not
        # the old columns — same reasoning as citizen_account_info() above
        # (a database .filter() can't be satisfied by a Python property).
        shell = User.objects.filter(
            linked_records__record_type=rtype, linked_records__record_id=other.id,
            linked_records__is_active=True,
        ).first()
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
    from accounts.models import User, UserLinkedRecord

    rsbsa_number = getattr(record, 'rsbsa_number', None)
    if rsbsa_number and record_type in (User.LinkedRecordType.FARMER, User.LinkedRecordType.FISHERFOLK):
        if existing_citizen_shell_for_rsbsa(rsbsa_number, exclude_record_type=record_type) is not None:
            return None

    full_name = getattr(record, 'full_name', None) or getattr(record, 'name', '')
    # Phase 3: linked_record_type/linked_record_id are no longer real
    # constructor kwargs — they're read-only properties now (see
    # accounts.models.User), so they're never passed here. The
    # UserLinkedRecord row created below is the ONLY place this link is
    # established; it's what those properties read.
    user = User(
        username=f'{record_type.lower()}-{record.id}',
        email=email or None,
        full_name=full_name,
        role=User.Roles.CITIZEN,
        is_active=False,
        must_change_password=False,
    )
    user.set_unusable_password()
    user.save()
    UserLinkedRecord.objects.create(
        user=user, record_type=record_type, record_id=record.id, is_active=True,
    )
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


def send_welcome_email(user, plain_password, verification_link, resent=False):
    """
    Send a staff member their verification link + temporary password. Returns (success, reason) - see _send().
    The account is unusable until the link is clicked (see accounts.views.VerifyEmailView). `resent`: this is a
    re-send, which always carries a NEW temporary password (the original cannot be looked up), so any earlier one no
    longer works.
    """
    if resent:
        subject = 'Your OMA Aringay verification link and new temporary password'
        intro = (
            'Here is your new verification link and a new temporary password for the OMA Aringay Integrated '
            'Agricultural Monitoring and Production Management System. Any earlier link or password you were '
            'sent no longer works.\n\n'
        )
    else:
        subject = 'Verify your email — OMA Aringay account created'
        intro = (
            'An account has been created for you on the OMA Aringay Integrated '
            'Agricultural Monitoring and Production Management System.\n\n'
        )
    message = (
        f'Hello {user.full_name or user.email},\n\n'
        + intro
        + f'1) Click the link below to verify your email and activate your account:\n'
        f'{verification_link}\n\n'
        f'2) Then log in with the temporary password below and set your own:\n\n'
        f'Login email: {user.email}\n'
        f'Temporary password: {plain_password}\n\n'
        f'This verification link expires in {settings.EMAIL_VERIFICATION_TOKEN_HOURS} hours, and the temporary '
        f'password in {settings.TEMP_PASSWORD_VALID_DAYS} days.\n\n'
        f'If you did not expect this account, please contact the Office of '
        f'the Municipal Agriculturist, Aringay, La Union.\n'
    )
    return _send(subject, message, user.email)


def send_new_password_email(user, plain_password):
    """E-mail a staff member the new temporary password an administrator generated for them. Returns (success, reason)."""
    subject = 'Your OMA Aringay account: new temporary password'
    message = (
        f'Hello {user.full_name or user.email},\n\n'
        f'An administrator has issued a new temporary password for your OMA Aringay account. Your previous password '
        f'no longer works.\n\n'
        f'Login email: {user.email}\n'
        f'Temporary password: {plain_password}\n\n'
        f'Log in with it and you will be asked to set your own. It stops working after '
        f'{settings.TEMP_PASSWORD_VALID_DAYS} days.\n\n'
        f'If you did not ask for this, please contact the Office of the Municipal Agriculturist, Aringay, La Union.\n'
    )
    return _send(subject, message, user.email)


def send_organization_credentials_email(org, plain_password, expires_at):
    """Email an organization its login and temporary password. The password is IN the email, there is no
    link. Returns (success, reason) — see _send()."""
    subject = 'Your OMA Aringay account is ready'
    message = (
        f'Hello {org.contact_person or org.name},\n\n'
        f'An account for {org.name} has been created on the OMA Aringay Integrated Agricultural Monitoring '
        f'and Production Management System.\n\n'
        f'Log in with:\n'
        f'Login: {org.registration_number}\n'
        f'Temporary password: {plain_password}\n\n'
        f'You will be asked to choose your own password the first time you log in. This temporary password '
        f'stops working on {timezone.localtime(expires_at).strftime("%B %d, %Y")}; after that, ask the Office of the Municipal '
        f'Agriculturist for a new one.\n\n'
        f'If you did not expect this account, please contact the Office of the Municipal Agriculturist, '
        f'Aringay, La Union.\n'
    )
    return _send(subject, message, org.email_address)


def activate_organization_account(record_type, org):
    """Database half of organization activation: when `org` has an email address and its citizen account is
    still an inactive shell, make the account active with a new temporary password. Returns the pending
    hand-over `{'org', 'password', 'expires_at'}` (the plain password lives only in this dict), or None when
    there is nothing to activate (no email, or no inactive shell). Sends nothing, so an import can call it
    inside its transaction and deliver only after the transaction has committed."""
    from accounts.models import User

    if not org.email_address:
        return None
    user = User.objects.filter(
        linked_records__record_type=record_type,
        linked_records__record_id=org.id,
        linked_records__is_active=True,
        is_active=False,
    ).first()
    if user is None:
        return None
    user.is_active = True
    password = issue_temporary_password(user)
    return {'org': org, 'password': password, 'expires_at': user.temp_password_expires_at}


def deliver_organization_credentials(pending, skip_reason=None):
    """Email a pending activation (see activate_organization_account) and describe the outcome. A failed send
    never raises: the result then carries the password and the reason so staff can hand it over once; a
    successful send never carries the password. With `skip_reason` nothing is sent and that reason is reported
    (used when the mail server has already failed repeatedly)."""
    org = pending['org']
    if skip_reason:
        sent, reason = False, skip_reason
    else:
        sent, reason = send_organization_credentials_email(org, pending['password'], pending['expires_at'])
    result = {
        'activated': True,
        'email_sent': sent,
        'expires_at': pending['expires_at'].isoformat(),
        'login': org.registration_number,
    }
    if not sent:
        result['reason'] = reason
        result['default_password'] = pending['password']
    return result


def activate_and_email_organization(record_type, org):
    """Activate an organization's account and email its temporary password. Returns
    `{'activated': False}` when there is nothing to activate."""
    pending = activate_organization_account(record_type, org)
    if pending is None:
        return {'activated': False}
    return deliver_organization_credentials(pending)
