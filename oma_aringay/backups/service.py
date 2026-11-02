"""
System backup: ONE zip of the whole database and every uploaded file, kept in the file storage under backups/ (Admin > Backup lists it).

    database.json    every record of every app (Django dumpdata). Sessions, permissions, content types, the admin log, the login-token
                     blacklist and the list of backups themselves are left out: they are rebuilt by the system and hold nothing to restore.
    media/<path>     every uploaded file (photos, forms, documents), by its path in the storage; earlier backups are never packed again.
    manifest.json    when, how many records and files, what was left out.

Restore (see docs/BACKUP_AND_RESTORE.md): migrate an empty database, `manage.py loaddata database.json`, copy media/ back into the storage.
Read-only on the system's own data: nothing here changes a record other than the BackupRecord row.
"""
import json
import logging
import os
import posixpath
import shutil
import tempfile
import threading
import zipfile
from datetime import timedelta

from django.apps import apps
from django.conf import settings
from django.core import serializers
from django.core.files import File
from django.core.files.storage import default_storage
from django.core.management.utils import parse_apps_and_model_labels
from django.db import connections, router
from django.utils import timezone

from .models import BackupRecord

logger = logging.getLogger(__name__)

EXCLUDE = ['sessions', 'contenttypes', 'auth.permission', 'admin.logentry', 'token_blacklist', 'backups.backuprecord']
PREFIX = 'backups'
STALE_AFTER_MINUTES = 30


def _setting(name, default):
    return getattr(settings, name, default)


def objects_to_dump(using='default'):
    """Every record to back up, in the same order as `manage.py dumpdata` (app by app, by primary key), minus EXCLUDE.

    dumpdata asks the database once more for every record that has a many-to-many field. Over a network that is thousands of round trips
    (a run from GitHub to Supabase did not finish in 20 minutes), so the many-to-many values are prefetched a chunk at a time instead:
    the output is the same, in a handful of queries per model."""
    excluded_models, excluded_apps = parse_apps_and_model_labels(EXCLUDE)
    for app_config in apps.get_app_configs():
        if app_config.models_module is None or app_config in excluded_apps:
            continue
        for model in app_config.get_models():
            if model in excluded_models or model._meta.proxy or not router.allow_migrate_model(using, model):
                continue
            queryset = model._default_manager.using(using).order_by(model._meta.pk.name)
            many = [f.name for f in model._meta.many_to_many if f.remote_field.through._meta.auto_created]
            if many:
                queryset = queryset.prefetch_related(*many)
            yield from queryset.iterator(chunk_size=2000)


def dump_database(path):
    """Write every record to `path` as JSON (the format `manage.py loaddata` reads); returns how many records were written."""
    # Written as UTF-8 explicitly: dumpdata's own --output uses the server's default encoding, which cannot hold a peso sign on every host.
    with open(path, 'w', encoding='utf-8') as out:
        serializers.serialize('json', objects_to_dump(), stream=out)
    count, tail = 0, b''
    needle = b'"model": "'
    with open(path, 'rb') as f:
        while chunk := f.read(1 << 20):
            data = tail + chunk
            count += data.count(needle)
            tail = data[-(len(needle) - 1):]
    return count


def iter_media(storage, folder=''):
    """Every uploaded file's path in the storage, skipping the folder the backups themselves live in."""
    dirs, files = storage.listdir(folder)
    for name in sorted(files):
        yield posixpath.join(folder, name)
    for name in sorted(dirs):
        path = posixpath.join(folder, name)
        if path == PREFIX:
            continue
        yield from iter_media(storage, path)


def add_media(zf, storage, limit):
    """Copy the uploaded files into the zip (up to `limit` bytes in all). Returns (added, skipped, notes)."""
    added = skipped = total = 0
    notes = []
    for path in iter_media(storage):
        try:
            size = storage.size(path)
            if total + size > limit:
                skipped += 1
                notes.append(f'{path} (too large to include)')
                continue
            with storage.open(path, 'rb') as src, zf.open(f'media/{path}', 'w') as dst:
                shutil.copyfileobj(src, dst, 1 << 20)
            added += 1
            total += size
            if added % 25 == 0:
                logger.info('Backup: %s files packed (%s bytes so far)', added, total)
        except Exception as exc:  # one unreadable file must not lose the whole backup
            skipped += 1
            notes.append(f'{path} ({str(exc)[:80]})')
    return added, skipped, notes


def run_backup(record_id):
    """Build the zip for the BackupRecord and save it; the record ends Done or Failed (never left Running). Safe to call from a thread."""
    record = BackupRecord.objects.get(pk=record_id)
    workdir = tempfile.mkdtemp(prefix='oma_backup_')
    try:
        db_path = os.path.join(workdir, 'database.json')
        logger.info('Backup %s: dumping the database...', record_id)
        records = dump_database(db_path)
        logger.info('Backup %s: database dumped, %s records (%s bytes). Packing the uploaded files...', record_id, records, os.path.getsize(db_path))
        zip_path = os.path.join(workdir, 'backup.zip')
        started = timezone.now()
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.write(db_path, 'database.json')
            files, skipped, notes = add_media(zf, default_storage, _setting('BACKUP_MAX_MEDIA_BYTES', 500 * 1024 * 1024))
            zf.writestr('manifest.json', json.dumps({
                'created_at': started.isoformat(), 'kind': record.kind, 'records': records, 'files': files, 'files_skipped': skipped,
                'left_out': notes[:200],
            }, indent=2))
        name = f'{PREFIX}/oma_backup_{timezone.localtime(started):%Y%m%d_%H%M%S}.zip'
        logger.info('Backup %s: %s files packed, %s skipped. Saving %s (%s bytes)...', record_id, files, skipped, name, os.path.getsize(zip_path))
        with open(zip_path, 'rb') as f:
            saved = default_storage.save(name, File(f))
        record.status, record.file_path, record.size_bytes = BackupRecord.Status.DONE, saved, os.path.getsize(zip_path)
        record.records_count, record.files_count, record.files_skipped = records, files, skipped
        record.detail = ('Left out: ' + '; '.join(notes[:20]) + (' ...' if len(notes) > 20 else '')) if notes else ''
        record.finished_at = timezone.now()
        record.save()
        prune(_setting('BACKUP_KEEP', 14))
    except Exception as exc:
        logger.exception('Backup %s failed', record_id)
        record.status, record.detail, record.finished_at = BackupRecord.Status.FAILED, str(exc)[:500] or exc.__class__.__name__, timezone.now()
        record.save()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def prune(keep):
    """Keep the latest `keep` finished backups; older ones are deleted with their files."""
    for old in BackupRecord.objects.filter(status=BackupRecord.Status.DONE).order_by('-created_at', '-id')[keep:]:
        delete_backup(old)


def delete_backup(record):
    if record.file_path:
        try:
            default_storage.delete(record.file_path)
        except Exception:
            logger.warning('Could not delete the backup file %s', record.file_path)
    record.delete()


def mark_stale():
    """A backup still Running long after it started (the server restarted under it) is Failed, so a new one can be made."""
    cutoff = timezone.now() - timedelta(minutes=STALE_AFTER_MINUTES)
    BackupRecord.objects.filter(status=BackupRecord.Status.RUNNING, created_at__lt=cutoff).update(
        status=BackupRecord.Status.FAILED, detail='It did not finish (the server restarted or ran out of time).', finished_at=timezone.now())


def start_backup(record_id):
    """Build the backup in the background: the request that asked for it answers at once and the Backup page polls the list."""
    def work():
        try:
            run_backup(record_id)
        finally:
            connections.close_all()
    threading.Thread(target=work, name=f'backup-{record_id}', daemon=True).start()
