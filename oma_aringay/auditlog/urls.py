from django.urls import path

from auditlog.views import AuditLogListView

urlpatterns = [
    path('', AuditLogListView.as_view(), name='auditlog-list'),
]
