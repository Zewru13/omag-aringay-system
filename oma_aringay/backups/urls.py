from django.urls import path

from .views import BackupDetailView, BackupDownloadedView, BackupDownloadView, BackupListCreateView, BackupRestoreView

urlpatterns = [
    path('', BackupListCreateView.as_view(), name='backups'),
    path('<int:pk>/', BackupDetailView.as_view(), name='backup-detail'),
    path('<int:pk>/download/', BackupDownloadView.as_view(), name='backup-download'),
    path('<int:pk>/downloaded/', BackupDownloadedView.as_view(), name='backup-downloaded'),
    path('<int:pk>/restore/', BackupRestoreView.as_view(), name='backup-restore'),
]
