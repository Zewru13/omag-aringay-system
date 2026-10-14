import logging
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.hashers import UNUSABLE_PASSWORD_PREFIX, check_password, make_password
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from core.validators import validate_uploaded_image

from .authentication import OptionalJWTAuthentication
from .permissions import IsAdmin, IsAdminOrEvaluator
from .serializers import (
    ChangePasswordSerializer,
    MeUpdateSerializer,
    ResendVerificationSerializer,
    UserCreateSerializer,
    UserListSerializer,
    UserSerializer,
    UserUpdateSerializer,
    VerifyEmailSerializer,
)
from .models import UserLinkedRecord
from .utils import (
    build_verification_link,
    generate_default_password,
    generate_verification_token,
    issue_temporary_password,
    issue_temporary_password,
    send_new_password_email,
    send_welcome_email,
    temp_password_expired,
)


User = get_user_model()

logger = logging.getLogger(__name__)


def _blacklist_outstanding_tokens(user):
    """Blacklist every outstanding refresh token for this user, so any
    session started before now (including its derived access tokens, via
    SIMPLE_JWT's CHECK_REVOKE_TOKEN) stops working on its next request."""
    from rest_framework_simplejwt.token_blacklist.models import (
        BlacklistedToken,
        OutstandingToken,
    )
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


def _deactivate_other_admins(exclude_user_id=None):
    """Deactivate every OTHER active admin and blacklist their outstanding
    refresh tokens. Only one admin may be active at a time."""
    qs = User.objects.filter(role=User.Roles.ADMIN, is_active=True)
    if exclude_user_id:
        qs = qs.exclude(pk=exclude_user_id)
    deactivated = list(qs)
    for admin in deactivated:
        admin.is_active = False
        admin.save(update_fields=['is_active'])
        _blacklist_outstanding_tokens(admin)
    return deactivated


def _linked_user_for(record_type, record_id):
    # Switchable-identity Phase 2: query through UserLinkedRecord — a
    # database .filter() can't be satisfied by a Python property, which is
    # what linked_record_type/id remain for every other (attribute-read)
    # caller. Restricted to the active link, so an RSBSA/registration-number
    # login always resolves to whichever domain a dual-linked citizen
    # currently has active, never a dormant second one.
    return User.objects.filter(
        linked_records__record_type=record_type, linked_records__record_id=record_id,
        linked_records__is_active=True,
    ).first()


def _resolve_login_identifier(identifier):
    """
    Batch 10: sequential lookup chain, same pattern the original
    email/username fallback already used — extended with the CITIZEN
    login identifiers (RSBSA number for Farmer/Fisherfolk, registration
    number for either organization type). Each of these resolves to a
    User indirectly, via linked_record_type/linked_record_id — not by
    matching the identifier against a field on User itself, since User has
    no RSBSA/registration-number column (see accounts.models.User.get_linked_record).
    Returns the matching User, or None if nothing matched at all.
    """
    from associations.models import FarmersOrganization, FisherfolkOrganization
    from farmers.models import Farmer
    from fisheries.models import Fisherfolk

    try:
        return User.objects.get(email__iexact=identifier)
    except User.DoesNotExist:
        pass

    try:
        return User.objects.get(username__iexact=identifier)
    except User.DoesNotExist:
        pass

    farmer = Farmer.objects.filter(rsbsa_number__iexact=identifier).first()
    if farmer:
        linked = _linked_user_for(User.LinkedRecordType.FARMER, farmer.id)
        if linked:
            return linked

    fisherfolk = Fisherfolk.objects.filter(rsbsa_number__iexact=identifier).first()
    if fisherfolk:
        linked = _linked_user_for(User.LinkedRecordType.FISHERFOLK, fisherfolk.id)
        if linked:
            return linked

    farmers_org = FarmersOrganization.objects.filter(registration_number__iexact=identifier).first()
    if farmers_org:
        linked = _linked_user_for(User.LinkedRecordType.FARMERS_ORG, farmers_org.id)
        if linked:
            return linked

    fisherfolk_org = FisherfolkOrganization.objects.filter(registration_number__iexact=identifier).first()
    if fisherfolk_org:
        linked = _linked_user_for(User.LinkedRecordType.FISHERFOLK_ORG, fisherfolk_org.id)
        if linked:
            return linked

    return None


class LoginRateThrottle(ScopedRateThrottle):
    """
    Batch 10: throttles by the submitted login identifier (email/username/
    RSBSA number/org registration number), not by request IP — DRF's stock
    ScopedRateThrottle.get_cache_key() falls back to IP for anonymous
    requests (LoginView has no authentication_classes, so request.user is
    always anonymous here), which isn't what "5 attempts per identifier per
    minute" asks for: a shared office/LAN IP with several different real
    people logging in shouldn't throttle them against each other.

    This does NOT stop an attacker rotating through many different
    identifiers from one IP (that's a different, IP-keyed threat model) —
    deliberately out of scope here; flagged for a possible follow-up.
    """
    scope = 'login'

    def get_cache_key(self, request, view):
        identifier = (
            request.data.get('email')
            or request.data.get('username')
            or ''
        ).strip().lower()
        if not identifier:
            # No identifier submitted at all — nothing meaningful to key on;
            # let the request through to LoginView, which will 401 anyway
            # ('' matches no user).
            return None
        return self.cache_format % {
            'scope': self.scope,
            'ident': identifier,
        }


class LoginIpRateThrottle(SimpleRateThrottle):
    """Caps login attempts per network address, whatever account names are tried. LoginRateThrottle counts per account
    name, which a script that moves on to a new name after every guess never runs into. The default is generous (an
    office full of people signing in at 8 a.m. must not lock each other out) but stops a script cold.

    The address comes from REMOTE_ADDR unless REST_FRAMEWORK['NUM_PROXIES'] says trusted proxies sit in front, so a
    visitor cannot reset the count by inventing an X-Forwarded-For header."""
    scope = 'login_ip'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


# The one answer for "no such account" and "wrong password", so the login form cannot be used to find out who is
# registered. (Account states that need a human to act, such as "not activated yet", are only revealed after the
# correct password has been given.)
LOGIN_FAILED = 'Incorrect login details. Check your email, username, RSBSA number or registration number, and your password.'
_DUMMY_PASSWORD_HASH = None


def _spend_password_time(password):
    """Do the same slow password hashing a real check would, for an account that does not exist (or has no password to
    check), so the answer does not arrive suspiciously fast."""
    global _DUMMY_PASSWORD_HASH
    if _DUMMY_PASSWORD_HASH is None:
        _DUMMY_PASSWORD_HASH = make_password('a-password-nobody-has')
    check_password(password if isinstance(password, str) else '', _DUMMY_PASSWORD_HASH)


class LoginView(APIView):
    permission_classes = []
    authentication_classes = []
    throttle_scope = 'login'
    throttle_classes = [LoginRateThrottle, LoginIpRateThrottle]

    def post(self, request):
        identifier = (
            request.data.get('email')
            or request.data.get('username')
            or ''
        ).strip()
        password = request.data.get('password')

        db_user = _resolve_login_identifier(identifier)
        if db_user is None:
            _spend_password_time(password)
            return Response({'detail': LOGIN_FAILED}, status=status.HTTP_401_UNAUTHORIZED)

        # Check the password directly, BEFORE calling authenticate(). Django's
        # ModelBackend.authenticate() silently returns None for any
        # is_active=False user even with the correct password (it calls
        # user_can_authenticate() internally) — which would collapse
        # "unverified account" into the same generic wrong-login answer
        # response as a genuinely wrong password. Checking the password
        # ourselves first lets us tell the two apart.
        if not db_user.has_usable_password():
            _spend_password_time(password)
        if not db_user.check_password(password):
            return Response({'detail': LOGIN_FAILED}, status=status.HTTP_401_UNAUTHORIZED)

        # A temporary password past its expiry no longer works. Checked only after the password itself
        # is right, so a wrong guess never learns whether the account's password has expired.
        if temp_password_expired(db_user):
            return Response(
                {
                    'detail': 'This temporary password has expired. Ask the Office of the Municipal Agriculturist for a new one.',
                    'code': 'temp_password_expired',
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Email verification is an ADMIN/EVALUATOR-only concept — CITIZEN
        # accounts have no email at all (is_email_verified stays at its
        # default False forever for this role by design; see
        # create_citizen_accounts and ActivateCitizenAccountView). Gating
        # this check on role, not touching it for the two existing roles.
        if db_user.role != User.Roles.CITIZEN and not db_user.is_email_verified:
            return Response(
                {
                    'detail': 'Please verify your email first. Check your inbox for the verification link.',
                    'code': 'email_not_verified',
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if not db_user.is_active:
            if db_user.role == User.Roles.CITIZEN:
                return Response(
                    {
                        'detail': 'This account has not been activated yet. Please visit the Office of the Municipal Agriculturist to have your identity verified and your account activated.',
                        'code': 'citizen_not_activated',
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            return Response(
                {'detail': 'This account is inactive.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        user = authenticate(
            request=request,
            username=db_user.username,
            password=password,
        )
        if user is None:
            return Response({'detail': LOGIN_FAILED}, status=status.HTTP_401_UNAUTHORIZED)

        refresh = RefreshToken.for_user(user)

        # Password-reveal batch: this app is JWT-only and never calls
        # django.contrib.auth.login(), so AbstractBaseUser.last_login —
        # normally kept current by Django's own user_logged_in signal — was
        # never being set anywhere, for any role. Set it explicitly here so
        # it becomes a real, general-purpose "has this account ever
        # actually logged in" signal — the staff-facing password reveal
        # reads it via citizen_account_info() to know when a CITIZEN's
        # stored one-time reveal is genuinely obsolete.
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])

        return Response({
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': UserSerializer(user).data,
        })


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get('refresh')

        if not refresh_token:
            return Response(
                {'detail': 'Refresh token is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except Exception:
            return Response(
                {'detail': 'Invalid refresh token.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {'detail': 'Successfully logged out.'},
            status=status.HTTP_200_OK,
        )


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Lazy scheduled-distribution status transition — see
        # interventions.lifecycle.advance_due_distributions' own docstring
        # for why this endpoint (the session-bootstrap call every citizen
        # screen loads through) is one of its two call sites. Deferred
        # import: interventions is a downstream app, accounts is not one of
        # its dependencies, so this avoids adding a reverse import at
        # module load time for the sake of one method.
        from interventions.lifecycle import advance_due_distributions
        advance_due_distributions(request.user)
        # Officer-term lazy transition — same no-job-scheduler pattern,
        # global rather than per-user (organization officer terms aren't
        # owned by the session's own user), so it's unconditional and cheap
        # (indexed .update() with nothing due most calls).
        from associations.lifecycle import expire_due_officer_terms
        expire_due_officer_terms()
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        # Staff self-service profile popup batch: changing email or
        # username now goes through this same-account endpoint (previously
        # both were read-only here), so a lightweight safeguard is added —
        # confirm the caller's current password before either takes effect.
        # Not required for full_name/contact_number, which carry no
        # account-identity or verification/reset consequence.
        if 'email' in request.data or 'username' in request.data:
            current_password = request.data.get('current_password')
            if not current_password:
                return Response(
                    {'current_password': ['Current password is required to change email or username.']},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not request.user.check_password(current_password):
                return Response(
                    {'current_password': ['Current password is incorrect.']},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        serializer = MeUpdateSerializer(
            request.user,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        updated_user = serializer.save()
        return Response(UserSerializer(updated_user).data)


class MyProfileImageUploadView(APIView):
    """
    POST multipart with `image`. Replaces the caller's OWN profile_picture.

    Staff/Admin equivalent of core.profile_self_service.ProfileImageUploadView
    (which only ever operates on a CITIZEN's linked Farmer/Fisherfolk/
    Organization record). ADMIN/EVALUATOR accounts have no linked record —
    the picture lives directly on the User row — so this is a separate view
    rather than a branch of that one, but reuses the same validator so the
    two accept identical files by the identical rule.
    """
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        upload = request.FILES.get('image')
        if upload is None:
            return Response({'image': ['No file was submitted.']},
                             status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_uploaded_image(upload)
        except Exception as exc:
            msgs = getattr(exc, 'messages', None) or [str(exc)]
            return Response({'image': msgs}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        if user.profile_picture:
            user.profile_picture.delete(save=False)
        user.profile_picture = upload
        user.save(update_fields=['profile_picture'])

        return Response({
            'image_url': user.profile_picture.url if user.profile_picture else None,
        })

    def delete(self, request):
        user = request.user
        if user.profile_picture:
            user.profile_picture.delete(save=False)
            user.profile_picture = None
            user.save(update_fields=['profile_picture'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'user': request.user})
        serializer.is_valid(raise_exception=True)

        current_password = serializer.validated_data['current_password']
        new_password = serializer.validated_data['new_password']

        if not request.user.check_password(current_password):
            return Response(
                {'detail': 'Current password is incorrect.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if request.user.check_password(new_password):
            # Otherwise the emailed temporary password could be "changed" to itself and kept for good.
            return Response(
                {'new_password': ['Choose a new password that is different from the current one.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        request.user.set_password(new_password)
        request.user.must_change_password = False
        request.user.temp_password_expires_at = None
        request.user.save()

        # The password just changed — every token issued before now (this
        # request's own access token included, via CHECK_REVOKE_TOKEN) must
        # stop working. The user has to log in again with the new password.
        # Same failure policy as core.notifications.notify_all_except: this
        # is a secondary cleanup step that must never be able to break the
        # caller. The password save above already committed and is the sole
        # source of truth for whether this request succeeded — a failure
        # here must not turn a successful password change into a 500 that
        # leaves the user unsure whether their password actually changed.
        # Still logged (not silently swallowed): a failed blacklist means
        # old tokens stay valid longer than intended, which is worth knowing
        # even though it shouldn't block the response.
        try:
            _blacklist_outstanding_tokens(request.user)
        except Exception:
            logger.exception(
                'Token blacklist failed after password change (non-fatal): user_id=%s',
                request.user.pk,
            )

        return Response({
            'detail': 'Password updated successfully. Please log in again with your new password.',
            'relogin_required': True,
        })


class UserListView(generics.ListAPIView):
    """User Management. Every account type lives on this one User table,
    but "role" alone can't tell Admin/Focal Person apart from Farmer/
    Fisherfolk/Organization — all three of the latter share role=CITIZEN,
    distinguished only by UserLinkedRecord.record_type on their currently
    ACTIVE link (a citizen can hold more than one; is_active marks which
    one a request resolves against — see UserLinkedRecord's own docstring).
    `?role=` here accepts 5 real, human-facing categories, not just the
    3 raw role values: ADMIN and EVALUATOR filter role directly; FARMER
    and FISHERFOLK filter role=CITIZEN + the matching active link type;
    ORGANIZATION filters role=CITIZEN + an active link type of EITHER org
    kind (FARMERS_ORG or FISHERFOLK_ORG) — one filter option, not two,
    matching how the frontend offers a single "Organization" choice.

    No `role` param at all (the frontend's own initial landing state,
    before the user has touched the filter) defaults to staff-only —
    same as the app's original single-purpose "manage staff accounts"
    intent, without re-introducing the wall of 4,671 citizen rows on
    first load. `?role=All` is the one explicit, real way to ask for
    every account regardless of type — distinct from the param being
    absent, not the same request.
    """
    serializer_class = UserListSerializer
    permission_classes = [IsAuthenticated, IsAdmin]

    CITIZEN_TYPE_FILTERS = {
        'FARMER': [User.LinkedRecordType.FARMER],
        'FISHERFOLK': [User.LinkedRecordType.FISHERFOLK],
        'ORGANIZATION': [User.LinkedRecordType.FARMERS_ORG, User.LinkedRecordType.FISHERFOLK_ORG],
    }

    def get_queryset(self):
        # Never-activated CITIZEN accounts (an unusable-password shell
        # nobody has ever run through "Set Up Account" /
        # SetCitizenPasswordView) are hidden here entirely — this table
        # manages usable accounts, activation itself happens on the
        # Farmer/Fisherfolk/Organization detail page. Deliberately keyed
        # on password usability, not is_active: is_active=False also
        # covers a citizen who WAS active and got deactivated
        # (UserUpdateView never touches password on deactivation), and
        # hiding those rows too would make Reactivate unreachable from
        # this exact table. Gated to role=CITIZEN specifically (not every
        # row) — real data has ADMIN accounts with an unusable password by
        # design (auditlog.system_user.get_system_user(), the RSBSA/BFAR
        # import's own system account), which must stay visible under
        # Admin/All exactly as today; only a citizen shell nobody has
        # activated is the thing this is meant to hide. One exclude at the
        # base queryset (rather than duplicated per role branch below)
        # so it applies consistently whether the request asks for one
        # specific citizen type or role=All.
        qs = User.objects.exclude(
            Q(role=User.Roles.CITIZEN) & Q(password__startswith=UNUSABLE_PASSWORD_PREFIX)
        ).order_by('-date_joined')
        role = self.request.query_params.get('role')
        is_active = self.request.query_params.get('is_active')
        search = self.request.query_params.get('search')
        if role in (User.Roles.ADMIN, User.Roles.EVALUATOR):
            qs = qs.filter(role=role)
        elif role in self.CITIZEN_TYPE_FILTERS:
            link_types = list(self.CITIZEN_TYPE_FILTERS[role])
            link = {'linked_records__is_active': True}
            params = self.request.query_params
            # One more narrowing per kind of account, all on the SAME active link (one filter() call, so one join):
            #   Fisherfolk: ?fisherfolk_type=   Farmer: ?farmer_type=laborer|operator   Organization: ?organization_type=farmers|fisherfolk
            if role == 'FISHERFOLK' and params.get('fisherfolk_type'):
                from fisheries.models import Fisherfolk
                link['linked_records__record_id__in'] = Fisherfolk.objects.filter(
                    fisherfolk_type=params['fisherfolk_type']).values('id')
            elif role == 'FARMER' and params.get('farmer_type') in ('laborer', 'operator'):
                from farmers.models import Farmer
                link['linked_records__record_id__in'] = Farmer.objects.filter(
                    is_farm_laborer=params['farmer_type'] == 'laborer').values('id')
            elif role == 'ORGANIZATION' and params.get('organization_type') in ('farmers', 'fisherfolk'):
                link_types = [User.LinkedRecordType.FARMERS_ORG if params['organization_type'] == 'farmers'
                              else User.LinkedRecordType.FISHERFOLK_ORG]
            qs = qs.filter(role=User.Roles.CITIZEN, linked_records__record_type__in=link_types, **link)
        elif not role:
            qs = qs.filter(role__in=[User.Roles.ADMIN, User.Roles.EVALUATOR])
        # role == 'All': no further filtering — every account, explicitly requested.
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        # Account status (the staff table's filter): active, deactivated (switched off after verifying), unverified
        # (never clicked the e-mail link; citizens have no e-mail, so they are never "unverified"), or all.
        status = self.request.query_params.get('status')
        if status == 'active':
            qs = qs.filter(is_active=True)
        elif status == 'deactivated':
            qs = qs.filter(is_active=False).filter(Q(is_email_verified=True) | Q(role=User.Roles.CITIZEN))
        elif status == 'unverified':
            qs = qs.filter(is_email_verified=False).exclude(role=User.Roles.CITIZEN)
        if search:
            qs = qs.filter(Q(full_name__icontains=search) | Q(email__icontains=search))
        return qs.prefetch_related('linked_records')


class UserCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = serializer.validated_data.get('role') or User.Roles.EVALUATOR
        default_password = generate_default_password()
        verification_token = generate_verification_token()

        with transaction.atomic():
            if role == User.Roles.ADMIN:
                _deactivate_other_admins()
            user = serializer.save()
            user.set_password(default_password)
            user.must_change_password = True
            # Inactive + unverified until the user clicks the link in their
            # email. A genuinely fake/mistyped address means that link never
            # gets clicked and the account simply stays inactive forever —
            # that's the intended safeguard, not a bug. We deliberately don't
            # pre-check deliverability (unreliable); clicking the link IS the
            # proof the address is real and reachable by its owner.
            user.is_active = False
            user.is_email_verified = False
            user.email_verification_token = verification_token
            user.email_verification_sent_at = timezone.now()
            user.save()

        verification_link = build_verification_link(verification_token, request)
        email_sent, reason = send_welcome_email(user, default_password, verification_link)

        response_data = {
            'user': UserSerializer(user).data,
            'email_sent': email_sent,
        }
        if not email_sent:
            response_data['reason'] = reason
            response_data['default_password'] = default_password
            response_data['verification_link'] = verification_link
            response_data['verification_token'] = verification_token
            response_data['warning'] = (
                'User created, but the verification email could not be sent. '
                'Share the temporary password and verification link with the user directly.'
            )
        return Response(response_data, status=status.HTTP_201_CREATED)


class UserUpdateView(generics.UpdateAPIView):
    queryset = User.objects.all()
    serializer_class = UserUpdateSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    http_method_names = ['patch']
    lookup_field = 'id'

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if not instance.is_active:
            return Response(
                {'detail': 'This account is deactivated and cannot be edited.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().update(request, *args, **kwargs)


class UserReactivateView(APIView):
    """
    Dedicated reactivation action, deliberately separate from UserUpdateView
    (which now rejects every edit to a deactivated user). This is the only
    UI-reachable way to flip a deactivated user's is_active back on, short
    of the rescue_admin / reset_admin_password terminal commands.
    """
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, id):
        user = get_object_or_404(User, pk=id)
        if user.is_active:
            return Response(
                {'detail': 'This account is already active.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            # Reactivating an admin must not create a second simultaneously
            # active admin — same single-admin invariant UserCreateView enforces.
            if user.role == User.Roles.ADMIN:
                _deactivate_other_admins(exclude_user_id=user.id)
            user.is_active = True
            user.save(update_fields=['is_active'])
        return Response(UserSerializer(user).data)


class SetCitizenPasswordView(APIView):
    """
    Staff-witnessed "Set Up Account" for a CITIZEN account — either
    bulk-backfilled by create_citizen_accounts, or auto-created inactive at
    enrollment by Farmer/FisherfolkListView.perform_create
    (accounts.utils.create_inactive_citizen_shell). The person is
    physically present, staff have already confirmed their identity the
    same way enrollment does. Generates a strong random password
    server-side, activates the account with it immediately, and returns it
    once for staff to read aloud — never typed by the citizen, never
    stored or relayed any other way.

    must_change_password is set True here — same forced-change-on-first-
    login flow ADMIN/EVALUATOR accounts already get from UserCreateView,
    now applied uniformly to every CITIZEN account type (Farmer, Fisherfolk,
    FarmersOrganization, FisherfolkOrganization all go through this one
    view). This only ever runs once per account: the is_active guard right
    below means this exact code path can never execute a second time for
    the same account, so this is genuinely a one-time "first login ever"
    gate, not something that re-fires on a later credential reissue —
    RegenerateCitizenPasswordView (below) is the deliberately separate path
    for that (e.g. an Organization's officer handoff, or a citizen who lost
    the one-time password reveal), and does NOT set this flag, so it does
    not force another change-password screen.
    """
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def post(self, request, id):
        user = get_object_or_404(User, pk=id, role=User.Roles.CITIZEN)
        if user.is_active:
            return Response(
                {'detail': 'This account is already active.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.is_active = True
        generated_password = issue_temporary_password(user)

        return Response({
            'user': UserSerializer(user).data,
            'generated_password': generated_password,
            'detail': 'Account is now active. Read the password aloud to the person and relay it in person.',
        })


class RegenerateCitizenPasswordView(APIView):
    """
    Password-reveal batch: companion to SetCitizenPasswordView for when
    staff genuinely can't recover the original one-time reveal (the
    frontend's sessionStorage window expired, they're on a different
    device, whatever the reason) — same generator, same relay-in-person
    contract, but the mirror-image guard: this account must ALREADY be
    active, since it isn't a first activation. Immediately invalidates
    whatever password the account currently has; reusable any number of
    times, same as the original flow, until the account leaves this
    already-active state (it never does, short of deactivation
    elsewhere — there's no time limit on staff needing this).
    """
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def post(self, request, id):
        user = get_object_or_404(User, pk=id, role=User.Roles.CITIZEN)
        if not user.is_active:
            return Response(
                {'detail': 'This account has not been activated yet — use Set Up Account first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        generated_password = issue_temporary_password(user)
        # The old password is gone, so every session started with it must stop working too (same policy
        # as ChangePasswordView: a failure here is logged and never turns the reissue into an error).
        try:
            _blacklist_outstanding_tokens(user)
        except Exception:
            logger.exception('Token blacklist failed after password regeneration (non-fatal): user_id=%s', user.pk)

        return Response({
            'user': UserSerializer(user).data,
            'generated_password': generated_password,
            'detail': 'Password regenerated. Read it aloud to the person and relay it in person.',
        })


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = VerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = serializer.validated_data['token']

        try:
            # A cleared token (None) never matches a non-empty `token` string,
            # which is what makes this single-use: a replayed token 400s here
            # exactly like one that never existed.
            user = User.objects.get(email_verification_token=token)
        except User.DoesNotExist:
            return Response(
                {'detail': 'This verification link is invalid or has already been used.', 'code': 'invalid_token'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        expiry_cutoff = user.email_verification_sent_at + timedelta(hours=settings.EMAIL_VERIFICATION_TOKEN_HOURS)
        if timezone.now() > expiry_cutoff:
            return Response(
                {
                    'detail': 'This verification link has expired. Request a new one below.',
                    'code': 'expired_token',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.is_email_verified = True
        user.is_active = True
        user.email_verification_token = None
        user.save(update_fields=['is_email_verified', 'is_active', 'email_verification_token'])

        return Response({
            'detail': 'Email verified successfully. You can now log in with the temporary password from your email.',
        })


class _ResendEmailThrottle(SimpleRateThrottle):
    """A few new links per hour for any one address - enough for a lost e-mail, too few to flood somebody's inbox."""
    scope = 'resend_email'

    def allow_request(self, request, view):
        if _is_admin(request.user):
            return True
        return super().allow_request(request, view)

    def get_cache_key(self, request, view):
        email = str(request.data.get('email') or '').strip().lower()
        return self.cache_format % {'scope': self.scope, 'ident': email} if email else None


class _ResendIpThrottle(SimpleRateThrottle):
    scope = 'resend_ip'

    def allow_request(self, request, view):
        if _is_admin(request.user):
            return True
        return super().allow_request(request, view)

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


def _is_admin(user):
    return bool(user and user.is_authenticated and getattr(user, 'role', None) == User.Roles.ADMIN)


RESEND_GENERIC = {'detail': 'If that e-mail belongs to an account that still needs verifying, a new link has been sent to it.'}


class ResendVerificationView(APIView):
    """
    Regenerates and resends the verification link. Callable both by the
    (not-yet-logged-in) user themselves from the login page, and by an admin
    from User Management.

    A visitor gets the same short answer whether or not the e-mail exists, is already verified, or could not be
    sent: the page must not reveal who is registered, and the link itself is only ever e-mailed. A signed-in admin
    still gets the detailed answer (404 for an unknown e-mail, and the link on screen when the mail server fails) -
    that is what User Management shows.
    """
    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTAuthentication]
    throttle_classes = [_ResendEmailThrottle, _ResendIpThrottle]

    def post(self, request):
        serializer = ResendVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email'].strip()
        detailed = _is_admin(request.user)

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            if detailed:
                return Response(
                    {'detail': 'No account found with that email address.'},
                    status=status.HTTP_404_NOT_FOUND,
                )
            return Response(RESEND_GENERIC)

        if user.is_email_verified:
            if not detailed:
                return Response(RESEND_GENERIC)
            return Response({'detail': 'This account is already verified. Please log in.', 'already_verified': True})

        email_sent, reason, link, token, password = _resend_credentials(user, request)

        if not detailed:
            if not email_sent:
                logger.warning('Verification e-mail for user %s was not sent: %s', user.pk, reason)
            return Response(RESEND_GENERIC)

        response_data = {'email_sent': email_sent}
        if not email_sent:
            response_data['reason'] = reason
            response_data['verification_link'] = link
            response_data['verification_token'] = token
            response_data['temporary_password'] = password
        return Response(response_data)


def _resend_credentials(user, request):
    """For an account that has not verified its e-mail yet: a new verification link AND a new temporary password (the
    original cannot be looked up, and an earlier e-mail may never have arrived), sent together. Returns
    (email_sent, reason, link, token, password); the password is only ever put in the e-mail, or handed to an admin
    when the e-mail could not be sent."""
    token = generate_verification_token()
    user.email_verification_token = token
    user.email_verification_sent_at = timezone.now()
    password = issue_temporary_password(user)            # also saves the token fields above
    link = build_verification_link(token, request)
    email_sent, reason = send_welcome_email(user, password, link, resent=True)
    return email_sent, reason, link, token, password


class RegenerateStaffPasswordView(APIView):
    """An administrator issues a new temporary password to an Admin or Focal Person who lost theirs, and it is e-mailed
    to them like the first one. The old password stops working and their open sessions end. For someone who never
    verified their e-mail it sends the verification link too. If the e-mail cannot be sent, the administrator is given
    the password to pass on in person. (Citizen accounts have their own action on their record.)"""
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, id):
        user = get_object_or_404(User, pk=id)
        if user.role not in (User.Roles.ADMIN, User.Roles.EVALUATOR):
            return Response({'detail': 'This is for Admin and Focal Person accounts. Use the account actions on the record for a citizen.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if user.pk == request.user.pk:
            return Response({'detail': 'To change your own password use Change Password in your profile.'}, status=status.HTTP_400_BAD_REQUEST)
        if not user.email:
            return Response({'detail': 'This account has no e-mail address to send a password to.'}, status=status.HTTP_400_BAD_REQUEST)

        if not user.is_email_verified:
            email_sent, reason, link, token, password = _resend_credentials(user, request)
            data = {'user': UserListSerializer(user).data, 'email_sent': email_sent}
            if not email_sent:
                data.update(reason=reason, temporary_password=password, verification_link=link)
            return Response(data)

        if not user.is_active:
            return Response({'detail': 'This account is deactivated. Reactivate it first, then issue a new password.'},
                            status=status.HTTP_400_BAD_REQUEST)

        password = issue_temporary_password(user)
        try:
            _blacklist_outstanding_tokens(user)                # the old password is gone, so its sessions must end too
        except Exception:
            logger.exception('Token blacklist failed after staff password regeneration (non-fatal): user_id=%s', user.pk)
        email_sent, reason = send_new_password_email(user, password)
        data = {'user': UserListSerializer(user).data, 'email_sent': email_sent}
        if not email_sent:
            logger.warning('New temporary password e-mail for user %s was not sent: %s', user.pk, reason)
            data.update(reason=reason, temporary_password=password)
        return Response(data)
