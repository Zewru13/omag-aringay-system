import os
import shutil
import tempfile

from django.core.files.storage import default_storage
from django.http import FileResponse
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin

from . import service
from .models import BackupRecord
from .service import start_backup, start_restore

BUSY = 'A backup or a restore is running. Wait until it is done.'
NOTES = (('name', 120), ('location', 255), ('remarks', 255))


def row(record):
    done = record.status == BackupRecord.Status.DONE
    has_file = done and bool(record.file_path)
    return {
        'id': record.id, 'kind': record.kind, 'kind_label': record.get_kind_display(), 'status': record.status, 'status_label': record.get_status_display(),
        'name': record.name or service.default_name(record.created_at), 'location': record.location, 'remarks': record.remarks,
        'created_at': record.created_at, 'finished_at': record.finished_at, 'downloaded_at': record.downloaded_at,
        'made_by': record.made_by or (record.created_by.username if record.created_by_id else 'Automatic'),
        'file_name': record.file_name or os.path.basename(record.file_path),
        'size_bytes': record.size_bytes, 'records_count': record.records_count, 'files_count': record.files_count,
        'files_skipped': record.files_skipped, 'detail': record.detail,
        # has_file: the online copy is still waiting to be downloaded. can_restore: a finished backup that can be recognised again
        # (its online copy, or its fingerprint to check the chosen file against).
        'has_file': has_file, 'can_restore': record.is_backup and done and (has_file or bool(record.checksum)),
    }


def busy_response():
    return Response({'detail': BUSY}, status=status.HTTP_409_CONFLICT)


def get_record(pk, **filters):
    try:
        return BackupRecord.objects.select_related('created_by').get(pk=pk, **filters)
    except BackupRecord.DoesNotExist:
        raise NotFound('That backup was not found.')


def wants_audit(data):
    """Whether the backup holds the activity log and the notifications: yes unless the Admin says no (the automatic backups say nothing)."""
    value = data.get('include_audit', True)
    if isinstance(value, str):
        return value.strip().lower() not in ('false', '0', 'no', 'off', '')
    return bool(value)


def clean_notes(data, partial):
    """The Admin's own notes about a backup (name, location, remarks), trimmed. Returns (values, error)."""
    values = {}
    for field, limit in NOTES:
        if field not in data:
            continue
        value = str(data.get(field) or '').strip()
        if len(value) > limit:
            return None, f'The {field} is too long (at most {limit} characters).'
        values[field] = value
    if partial and 'name' in values and not values['name']:
        return None, 'Type a name for the backup.'
    return values, ''


class BackupListCreateView(APIView):
    """Admin only. GET: the list, newest first, and whether one is running. POST: make a backup now (it runs in the background; the list shows it Running).
    `include_audit` false leaves the activity log and the notifications out of it."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        busy = service.is_busy()
        records = BackupRecord.objects.select_related('created_by')[:200]
        return Response({'results': [row(r) for r in records], 'busy': busy})

    def post(self, request):
        if service.is_busy():
            return busy_response()
        notes, error = clean_notes(request.data, partial=False)
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)
        record = BackupRecord.objects.create(created_by=request.user, made_by=request.user.username, kind=BackupRecord.Kind.MANUAL, **notes)
        if not record.name:
            record.name = service.default_name(record.created_at)
            record.save(update_fields=['name'])
        start_backup(record.id, wants_audit(request.data))
        record.refresh_from_db()
        return Response(row(record), status=status.HTTP_201_CREATED)


class BackupDetailView(APIView):
    """PATCH: the Admin's notes about a backup (its name, where the file is kept, remarks). Its date, time and result are facts and are not edited;
    an entry is never deleted."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def patch(self, request, pk):
        record = get_record(pk)
        if service.is_busy():
            return busy_response()
        notes, error = clean_notes(request.data, partial=True)
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)
        for field, value in notes.items():
            setattr(record, field, value)
        if notes:
            record.save(update_fields=list(notes))
        return Response(row(record))


class BackupDownloadView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request, pk):
        record = get_record(pk, status=BackupRecord.Status.DONE)
        if service.is_busy():
            return busy_response()
        if not record.file_path or not default_storage.exists(record.file_path):
            raise NotFound('The backup file is no longer online. It was downloaded already; look for it where it was saved.')
        service.fingerprint_online_copy(record)
        response = FileResponse(default_storage.open(record.file_path, 'rb'), content_type='application/zip', as_attachment=True,
                                filename=record.file_name or os.path.basename(record.file_path))
        response['Cache-Control'] = 'no-store'
        return response


class BackupDownloadedView(APIView):
    """The page calls this once the whole file has reached the Admin's browser: the online copy is removed, the entry stays."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        record = get_record(pk, status=BackupRecord.Status.DONE)
        if service.is_busy():
            return busy_response()
        if record.file_path:
            service.remove_online_copy(record)
        return Response(row(record))


class BackupRestoreView(APIView):
    """Put a backup of the list back. The Admin types their own password; the backup's own file is chosen from the computer when its online copy
    is gone, and checked against the fingerprint kept on the entry. A safety backup of how things are now is made first, in the same run."""
    permission_classes = [IsAuthenticated, IsAdmin]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request, pk):
        record = get_record(pk)
        if service.is_busy():
            return busy_response()
        if not (record.is_backup and record.status == BackupRecord.Status.DONE):
            return self.refuse('Only a finished backup can be restored.')
        if not request.user.check_password(str(request.data.get('password') or '')):
            return self.refuse('The password is not correct.')

        upload = request.FILES.get('file')
        handle, local = tempfile.mkstemp(prefix='oma_restore_', suffix='.zip')
        try:
            with os.fdopen(handle, 'wb') as out:
                if upload is not None:
                    for chunk in upload.chunks():
                        out.write(chunk)
                elif record.file_path and default_storage.exists(record.file_path):
                    service.fingerprint_online_copy(record)
                    with default_storage.open(record.file_path, 'rb') as src:
                        shutil.copyfileobj(src, out, 1 << 20)
                else:
                    raise service.RestoreError(f'Choose the backup file from your computer{f" ({record.file_name})" if record.file_name else ""}.')
            if not record.checksum:
                raise service.RestoreError('This older backup cannot be checked against a file. Make a new backup instead.')
            with open(local, 'rb') as f:
                if service.checksum_of(f) != record.checksum:
                    raise service.RestoreError(
                        f'That is not the file of this backup{f" ({record.file_name})" if record.file_name else ""}. Choose the file that was downloaded for it.')
            service.read_backup_zip(local)
        except service.RestoreError as exc:
            os.remove(local)
            return self.refuse(str(exc))
        except Exception:
            os.remove(local)
            raise

        return begin_restore(request, record, local)

    @staticmethod
    def refuse(message):
        return Response({'detail': message}, status=status.HTTP_400_BAD_REQUEST)


def begin_restore(request, record, local):
    """Start the restore of `record` from the checked local copy of its file: a safety backup of how things are now first, in the same run."""
    who = request.user.username
    safety = BackupRecord.objects.create(
        created_by=request.user, made_by=who, kind=BackupRecord.Kind.SAFETY, name=f'Before restoring "{record.name or service.default_name(record.created_at)}"'[:120],
        remarks='Made automatically before a restore.')
    restore = BackupRecord.objects.create(
        created_by=request.user, made_by=who, kind=BackupRecord.Kind.RESTORE, name=f'Restore of "{record.name or service.default_name(record.created_at)}"'[:120])
    start_restore(restore.id, safety.id, local)
    restore.refresh_from_db()
    return Response(row(restore), status=status.HTTP_202_ACCEPTED)


def refuse(message):
    return Response({'detail': message}, status=status.HTTP_400_BAD_REQUEST)


def keep_upload(upload):
    """The chosen file, copied to a temporary local file; returns its path."""
    handle, local = tempfile.mkstemp(prefix='oma_restore_', suffix='.zip')
    with os.fdopen(handle, 'wb') as out:
        for chunk in upload.chunks():
            out.write(chunk)
    return local


def recognise(local):
    """The finished backup of the list that this file is (by its fingerprint). Raises RestoreError with the message to show when it is none."""
    service.read_backup_zip(local)
    with open(local, 'rb') as f:
        checksum = service.checksum_of(f)
    record = (BackupRecord.objects.select_related('created_by')
              .filter(checksum=checksum, status=BackupRecord.Status.DONE).exclude(kind=BackupRecord.Kind.RESTORE).order_by('-id').first())
    if record is None:
        raise service.RestoreError('That file is not one of the backups in the list, so it cannot be restored. Choose a file this system downloaded for a backup.')
    return record


class BackupSummaryView(APIView):
    """Admin only. What a backup holds, in readable groups with the number of records in each now (the Create backup tab)."""
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        return Response({'groups': service.group_rows(service.model_counts())})


class BackupRestorePreviewView(APIView):
    """Admin only. The file the Admin drops on the Restore tab: which backup of the list it is and, group by group, how many records it holds next to how
    many the system holds now. Changes nothing and starts nothing."""
    permission_classes = [IsAuthenticated, IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        if service.is_busy():
            return busy_response()
        upload = request.FILES.get('file')
        if upload is None:
            return refuse('Choose the backup file from your computer.')
        local = keep_upload(upload)
        try:
            record = recognise(local)
            manifest = service.read_backup_zip(local)
            in_file = service.zip_counts(local)
        except service.RestoreError as exc:
            return refuse(str(exc))
        finally:
            os.remove(local)
        audit_in_file = manifest.get('audit_included', True) is not False
        groups = service.group_rows(service.model_counts(), in_file, audit_in_file)
        return Response({
            'backup': row(record), 'file': {'name': upload.name, 'size_bytes': upload.size},
            'made_at': manifest.get('created_at'), 'audit_included': audit_in_file, 'groups': groups,
            'records': {'in_file': sum(in_file.values()), 'now': sum(g['now'] for g in groups if not g.get('kept'))},
            'files': {'in_file': manifest.get('files', record.files_count)},
        })


class BackupRestoreFileView(APIView):
    """Admin only. Restore from the file the Admin dropped on the Restore tab: the file is recognised by its fingerprint among the backups of the list,
    the Admin types their own password, a safety backup of how things are now is made first, and then the records and files go back."""
    permission_classes = [IsAuthenticated, IsAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        if service.is_busy():
            return busy_response()
        if not request.user.check_password(str(request.data.get('password') or '')):
            return refuse('The password is not correct.')
        upload = request.FILES.get('file')
        if upload is None:
            return refuse('Choose the backup file from your computer.')
        local = keep_upload(upload)
        try:
            record = recognise(local)
        except service.RestoreError as exc:
            os.remove(local)
            return refuse(str(exc))
        except Exception:
            os.remove(local)
            raise
        return begin_restore(request, record, local)
