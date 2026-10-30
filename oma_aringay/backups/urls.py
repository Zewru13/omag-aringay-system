from django.urls import path

from .views import BackupDetailView, BackupDownloadView, BackupListCreateView

urlpatterns = [
    path('', BackupListCreateView.as_view(), name='backups'),
    path('<int:pk>/', BackupDetailView.as_view(), name='backup-detail'),
    path('<int:pk>/download/', BackupDownloadView.as_view(), name='backup-download'),
]
