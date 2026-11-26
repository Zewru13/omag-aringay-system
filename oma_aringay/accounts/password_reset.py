"""Forgot password: a link e-mailed to the sign-in address.

The link is Django's own reset token: signed with SECRET_KEY, tied to the current password and last sign-in (so it works
once and dies if the person signs in), and expiring after settings.PASSWORD_RESET_TIMEOUT. Nothing is stored."""
import logging

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from core.mailer import in_background

from .login_email import normalize
from .models import User
from .setup_window import cancel_if_overdue
from .utils import send_password_changed_email, send_password_reset_email

logger = logging.getLogger(__name__)

# The one answer to every request, so the page cannot be used to find out who is registered.
REQUEST_ANSWER = {'detail': 'If that email has an account, we sent it a link to set a new password.'}
INVALID_LINK = {'detail': 'This reset link is invalid or has expired. Ask for a new one.', 'code': 'invalid_link'}


class _ResetEmailThrottle(SimpleRateThrottle):
    scope = 'reset_email'

    def get_cache_key(self, request, view):
        email = normalize(request.data.get('email'))
        return self.cache_format % {'scope': self.scope, 'ident': email} if email else None


class _ResetIpThrottle(SimpleRateThrottle):
    scope = 'reset_ip'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


class _ResetConfirmIpThrottle(_ResetIpThrottle):
    scope = 'reset_confirm_ip'


def _may_reset(user):
    """Only accounts that can sign in today. A reset never activates an account or skips e-mail verification, and it does
    not revive a setup that ran out."""
    cancel_if_overdue(user)
    return bool(user and user.is_active and user.has_usable_password()
                and (user.role == User.Roles.CITIZEN or user.is_email_verified))


def _website(request):
    """The website the link opens. Never taken from the request on a live server: whoever sends the request chooses its
    Host header, and a reset link must not point where they say."""
    if settings.FRONTEND_BASE_URL:
        return settings.FRONTEND_BASE_URL
    return f'{request.scheme}://{request.get_host()}' if settings.DEBUG else ''


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [_ResetEmailThrottle, _ResetIpThrottle]

    def post(self, request):
        email = normalize(request.data.get('email'))
        if not email:
            return Response({'email': ['Enter your email address.']}, status=status.HTTP_400_BAD_REQUEST)
        user = User.objects.filter(email__iexact=email).first()
        if _may_reset(user):
            website = _website(request)
            if website:
                uid = urlsafe_base64_encode(force_bytes(user.pk))
                # After '#', so the token is never sent to a web server and never lands in its logs.
                link = f'{website}/reset-password#uid={uid}&token={default_token_generator.make_token(user)}'
                # In the background, so an existing account does not answer noticeably slower than an unknown one.
                in_background(send_password_reset_email, user, link)
            else:
                logger.error('Password reset e-mail not sent: FRONTEND_BASE_URL is not set.')
        return Response(REQUEST_ANSWER)


class _NewPasswordSerializer(serializers.Serializer):
    uid = serializers.CharField(allow_blank=True)
    token = serializers.CharField(allow_blank=True)
    new_password = serializers.CharField(trim_whitespace=False)
    confirm_new_password = serializers.CharField(trim_whitespace=False)


def _user_for(uid):
    try:
        return User.objects.filter(pk=int(urlsafe_base64_decode(uid).decode())).first()
    except (ValueError, TypeError, OverflowError):
        return None


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [_ResetConfirmIpThrottle]

    def post(self, request):
        serializer = _NewPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = _user_for(data['uid'])
        if not _may_reset(user) or not default_token_generator.check_token(user, data['token']):
            return Response(INVALID_LINK, status=status.HTTP_400_BAD_REQUEST)

        password = data['new_password']
        if password != data['confirm_new_password']:
            return Response({'confirm_new_password': ['New password and confirmation do not match.']},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(password, user=user)
        except ValidationError as exc:
            return Response({'new_password': list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
        if user.check_password(password):
            return Response({'new_password': ['Choose a new password that is different from the current one.']},
                            status=status.HTTP_400_BAD_REQUEST)

        user.set_password(password)
        user.must_change_password = False
        user.temp_password_expires_at = None
        user.save(update_fields=['password', 'must_change_password', 'temp_password_expires_at'])
        try:
            from .views import _blacklist_outstanding_tokens
            _blacklist_outstanding_tokens(user)
        except Exception:
            logger.exception('Token blacklist failed after password reset (non-fatal): user_id=%s', user.pk)
        in_background(send_password_changed_email, user)
        return Response({'detail': 'Your password has been changed. Sign in with your new password.'})
