from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    ChangePasswordView,
    LoginView,
    LogoutView,
    MeView,
    MyProfileImageUploadView,
    RegenerateCitizenPasswordView,
    RegenerateStaffPasswordView,
    ResendVerificationView,
    SetCitizenPasswordView,
    UserCreateView,
    UserListView,
    UserReactivateView,
    UserUpdateView,
    VerifyEmailView,
)


urlpatterns = [
    path('login/', LoginView.as_view(), name='accounts-login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='accounts-token-refresh'),
    path('logout/', LogoutView.as_view(), name='accounts-logout'),
    path('me/', MeView.as_view(), name='accounts-me'),
    path('me/photo/', MyProfileImageUploadView.as_view(), name='accounts-me-photo'),
    path('change-password/', ChangePasswordView.as_view(), name='accounts-change-password'),
    path('verify-email/', VerifyEmailView.as_view(), name='accounts-verify-email'),
    path('resend-verification/', ResendVerificationView.as_view(), name='accounts-resend-verification'),
    path('users/', UserListView.as_view(), name='accounts-users'),
    path('users/create/', UserCreateView.as_view(), name='accounts-users-create'),
    path('users/<int:id>/', UserUpdateView.as_view(), name='accounts-users-update'),
    path('users/<int:id>/reactivate/', UserReactivateView.as_view(), name='accounts-users-reactivate'),
    path('users/<int:id>/regenerate-password/', RegenerateStaffPasswordView.as_view(), name='accounts-users-regenerate-password'),
    path('users/<int:id>/set-citizen-password/', SetCitizenPasswordView.as_view(), name='accounts-users-set-citizen-password'),
    path('users/<int:id>/regenerate-citizen-password/', RegenerateCitizenPasswordView.as_view(), name='accounts-users-regenerate-citizen-password'),
]
