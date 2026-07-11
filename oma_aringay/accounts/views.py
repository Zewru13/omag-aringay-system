from django.contrib.auth import authenticate, get_user_model
from django.db import transaction
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .permissions import IsAdmin
from .serializers import (
    ChangePasswordSerializer,
    MeUpdateSerializer,
    UserCreateSerializer,
    UserSerializer,
    UserUpdateSerializer,
)
from .utils import generate_default_password, send_welcome_email


User = get_user_model()


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


class LoginView(APIView):
    permission_classes = []
    authentication_classes = []

    def post(self, request):
        identifier = (
            request.data.get('email')
            or request.data.get('username')
            or ''
        ).strip()
        password = request.data.get('password')

        try:
            db_user = User.objects.get(email__iexact=identifier)
        except User.DoesNotExist:
            try:
                db_user = User.objects.get(username__iexact=identifier)
            except User.DoesNotExist:
                return Response(
                    {'detail': 'No account found with that email or username.'},
                    status=status.HTTP_401_UNAUTHORIZED,
                )

        user = authenticate(
            request=request,
            username=db_user.username,
            password=password,
        )

        if user is None:
            return Response(
                {'detail': 'Incorrect password.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not user.is_active:
            return Response(
                {'detail': 'This account is inactive.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        refresh = RefreshToken.for_user(user)

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
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = MeUpdateSerializer(
            request.user,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        updated_user = serializer.save()
        return Response(UserSerializer(updated_user).data)


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

        request.user.set_password(new_password)
        request.user.must_change_password = False
        request.user.save()

        # The password just changed — every token issued before now (this
        # request's own access token included, via CHECK_REVOKE_TOKEN) must
        # stop working. The user has to log in again with the new password.
        _blacklist_outstanding_tokens(request.user)

        return Response({
            'detail': 'Password updated successfully. Please log in again with your new password.',
            'relogin_required': True,
        })


class UserListView(generics.ListAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, IsAdmin]

    def get_queryset(self):
        qs = User.objects.all().order_by('-date_joined')
        role = self.request.query_params.get('role')
        is_active = self.request.query_params.get('is_active')
        if role:
            qs = qs.filter(role=role)
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        return qs


class UserCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = serializer.validated_data.get('role') or User.Roles.EVALUATOR
        default_password = generate_default_password()

        with transaction.atomic():
            if role == User.Roles.ADMIN:
                _deactivate_other_admins()
            user = serializer.save()
            user.set_password(default_password)
            user.must_change_password = True
            user.save()

        email_sent = send_welcome_email(user, default_password)

        response_data = {
            'user': UserSerializer(user).data,
            'email_sent': email_sent,
        }
        if not email_sent:
            response_data['default_password'] = default_password
            response_data['warning'] = (
                'User created, but the notification email could not be sent. '
                'Share this temporary password with the user directly.'
            )
        return Response(response_data, status=status.HTTP_201_CREATED)


class UserUpdateView(generics.UpdateAPIView):
    queryset = User.objects.all()
    serializer_class = UserUpdateSerializer
    permission_classes = [IsAuthenticated, IsAdmin]
    http_method_names = ['patch']
    lookup_field = 'id'
