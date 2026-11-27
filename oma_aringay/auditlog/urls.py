from django.urls import path

from auditlog.views import AuditHistoryView, AuditLogListView

urlpatterns = [
    path('', AuditLogListView.as_view(), name='auditlog-list'),
    path('history/<str:kind>/<int:pk>/', AuditHistoryView.as_view(), name='auditlog-history'),
]
