import os

from django.core.files.storage import default_storage
from django.http import FileResponse
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin

from .models import BackupRecord
from .service import delete_backup, mark_stale, start_backup


def row(record):
    return {
        'id': record.id, 'kind': record.kind, 'kind_label': record.get_kind_display(), 'status': record.status, 'status_label': record.get_status_display(),
        'created_at': record.created_at, 'finished_at': record.finished_at,
        'created_by_name': record.created_by.username if record.created_by_id else 'Automatic',
        'size_bytes': record.size_bytes, 'records_count': record.records_count, 'files_count': record.files_count,
        'files_skipped': record.files_skipped, 'detail': record.detail, 'can_download': record.status == BackupRecord.Status.DONE and bool(record.file_path),
    }


class BackupListCreateView(APIView):
    """Admin only. GET: the backups, newest first. POST: start a new one (it runs in the background; the list shows it as Running)."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        mark_stale()
        records = BackupRecord.objects.select_related('created_by')[:50]
        return Response({'results': [row(r) for r in records]})

    def post(self, request):
        mark_stale()
        if BackupRecord.objects.filter(status=BackupRecord.Status.RUNNING).exists():
            return Response({'detail': 'A backup is already running. Wait for it to finish.'}, status=status.HTTP_409_CONFLICT)
        record = BackupRecord.objects.create(created_by=request.user, kind=BackupRecord.Kind.MANUAL)
        start_backup(record.id)
        record.refresh_from_db()
        return Response(row(record), status=status.HTTP_201_CREATED)


class BackupDetailView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def delete(self, request, pk):
        try:
            record = BackupRecord.objects.get(pk=pk)
        except BackupRecord.DoesNotExist:
            raise NotFound('That backup was not found.')
        if record.status == BackupRecord.Status.RUNNING:
            return Response({'detail': 'A running backup cannot be deleted.'}, status=status.HTTP_409_CONFLICT)
        delete_backup(record)
        return Response(status=status.HTTP_204_NO_CONTENT)


class BackupDownloadView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        try:
            record = BackupRecord.objects.get(pk=pk, status=BackupRecord.Status.DONE)
        except BackupRecord.DoesNotExist:
            raise NotFound('That backup was not found.')
        if not record.file_path or not default_storage.exists(record.file_path):
            raise NotFound('The backup file is no longer in the storage.')
        response = FileResponse(default_storage.open(record.file_path, 'rb'), content_type='application/zip', as_attachment=True,
                                filename=os.path.basename(record.file_path))
        response['Cache-Control'] = 'no-store'
        return response
