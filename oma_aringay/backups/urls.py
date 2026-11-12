from django.urls import path

from .views import (
    BackupDetailView, BackupDownloadedView, BackupDownloadView, BackupListCreateView, BackupRestoreFileView, BackupRestorePreviewView, BackupRestoreView,
    BackupSummaryView, BackupImportView,
)

urlpatterns = [
    path('', BackupListCreateView.as_view(), name='backups'),
    path('summary/', BackupSummaryView.as_view(), name='backup-summary'),
    path('restore/preview/', BackupRestorePreviewView.as_view(), name='backup-restore-preview'),
    path('restore/', BackupRestoreFileView.as_view(), name='backup-restore-file'),
    path('import/', BackupImportView.as_view(), name='backup-import'),
    path('<int:pk>/', BackupDetailView.as_view(), name='backup-detail'),
    path('<int:pk>/download/', BackupDownloadView.as_view(), name='backup-download'),
    path('<int:pk>/downloaded/', BackupDownloadedView.as_view(), name='backup-downloaded'),
    path('<int:pk>/restore/', BackupRestoreView.as_view(), name='backup-restore'),
]
