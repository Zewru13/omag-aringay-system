from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    ChangePasswordView,
    LoginView,
    LogoutView,
    MeView,
    UserCreateView,
    UserListView,
    UserUpdateView,
)


urlpatterns = [
    path('login/', LoginView.as_view(), name='accounts-login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='accounts-token-refresh'),
    path('logout/', LogoutView.as_view(), name='accounts-logout'),
    path('me/', MeView.as_view(), name='accounts-me'),
    path('change-password/', ChangePasswordView.as_view(), name='accounts-change-password'),
    path('users/', UserListView.as_view(), name='accounts-users'),
    path('users/create/', UserCreateView.as_view(), name='accounts-users-create'),
    path('users/<int:id>/', UserUpdateView.as_view(), name='accounts-users-update'),
]
