from django.urls import path

from .views import RegistrationStatusView


urlpatterns = [
    path('check-status/', RegistrationStatusView.as_view(), name='public-check-status'),
]
