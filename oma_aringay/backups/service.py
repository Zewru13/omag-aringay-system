"""
System backup and restore (Admin > Backup).

A BACKUP is ONE zip of the whole database and every uploaded file:

    database.json    every record of every app (the format of Django's dumpdata). Sessions, permissions, content types, the admin log, the login-token
                     blacklist and the Backup list itself are left out: they are rebuilt by the system and hold nothing to restore.
    media/<path>     every uploaded file (photos, forms, documents), by its path in the storage; backups are never packed into a backup.
    manifest.json    when, how many records and files, what was left out.

It is made only when the Admin asks, and it is made for download: the zip waits in the file storage under backups/ until the Admin's browser has it, then
the online copy is removed (`remove_online_copy`). The entry in the list is never deleted; it keeps the file's name and SHA-256 fingerprint.

A RESTORE puts a backup back: the uploaded files first, then every record in one database transaction (so a restore that fails changes no record). Before
it starts, a safety backup of how things are now is made, and the restore does not go on without it. Nothing else may be started while one is running.
"""
import hashlib
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
from django.contrib.auth import get_user_model
from django.core import serializers
from django.core.files import File
from django.core.files.storage import default_storage
from django.core.management.color import no_style
from django.core.management.utils import parse_apps_and_model_labels
from django.db import connections, router, transaction
from django.utils import timezone

from .models import BackupRecord

logger = logging.getLogger(__name__)

EXCLUDE = ['sessions', 'contenttypes', 'auth.permission', 'admin.logentry', 'token_blacklist', 'backups.backuprecord']
# Left out of a backup, but they point at accounts: emptied by a restore so that no row is left pointing at an account that is no longer there.
# (Everyone signs in again after a restore.)
CLEARED_BY_RESTORE = ['admin.logentry', 'token_blacklist']
PREFIX = 'backups'
STALE_AFTER_MINUTES = 30
INSERT_BATCH = 500


class RestoreError(Exception):
    """The chosen file cannot be restored; the message is shown to the Admin."""


def _setting(name, default):
    return getattr(settings, name, default)


# ---------------------------------------------------------------------------------------------------------------------------------- what is backed up

def backed_up_models(using='default'):
    """Every model whose records are backed up (and replaced by a restore), in the order `manage.py dumpdata` writes them."""
    excluded_models, excluded_apps = parse_apps_and_model_labels(EXCLUDE)
    for app_config in apps.get_app_configs():
        if app_config.models_module is None or app_config in excluded_apps:
            continue
        for model in app_config.get_models():
            if model in excluded_models or model._meta.proxy or not router.allow_migrate_model(using, model):
                continue
            yield model


def link_tables(model):
    """The automatic in-between models of the model's many-to-many fields (their rows are part of the model's records)."""
    return [f.remote_field.through for f in model._meta.many_to_many if f.remote_field.through._meta.auto_created]


def objects_to_dump(using='default'):
    """Every record to back up, in the same order as `manage.py dumpdata` (app by app, by primary key), minus EXCLUDE.

    dumpdata asks the database once more for every record that has a many-to-many field. Over a network that is thousands of round trips
    (a run from GitHub to Supabase did not finish in 20 minutes), so the many-to-many values are prefetched a chunk at a time instead:
    the output is the same, in a handful of queries per model."""
    for model in backed_up_models(using):
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


def checksum_of(fileobj):
    """SHA-256 of a file (read from where it stands), as hex: the fingerprint that tells one backup file from another."""
    digest = hashlib.sha256()
    while chunk := fileobj.read(1 << 20):
        digest.update(chunk)
    return digest.hexdigest()


# ----------------------------------------------------------------------------------------------------------------------------------------- the list

def default_name(when=None):
    return f'Backup of {timezone.localtime(when or timezone.now()):%b %d, %Y %I:%M %p}'.replace(' 0', ' ')


def is_busy():
    """True while a backup or a restore is running: nothing else on the Backup page may be started or changed until it is done."""
    mark_stale()
    return BackupRecord.objects.filter(status=BackupRecord.Status.RUNNING).exists()


def mark_stale():
    """One still Running long after it started (the server restarted under it) is Failed, so that the page is not locked for ever."""
    cutoff = timezone.now() - timedelta(minutes=STALE_AFTER_MINUTES)
    BackupRecord.objects.filter(status=BackupRecord.Status.RUNNING, created_at__lt=cutoff).update(
        status=BackupRecord.Status.FAILED, detail='It did not finish (the server restarted or ran out of time).', finished_at=timezone.now())


def remove_online_copy(record):
    """The Admin's browser has the file: take the online copy away. The entry itself stays in the list."""
    if record.file_path:
        try:
            default_storage.delete(record.file_path)
        except Exception:
            logger.warning('Could not remove the online copy %s', record.file_path)
    record.file_path = ''
    record.downloaded_at = record.downloaded_at or timezone.now()
    record.save(update_fields=['file_path', 'downloaded_at'])


def fingerprint_online_copy(record):
    """An entry made before fingerprints were kept: work its fingerprint and file name out from the online copy."""
    changed = []
    if not record.file_name:
        record.file_name = os.path.basename(record.file_path)
        changed.append('file_name')
    if not record.checksum:
        with default_storage.open(record.file_path, 'rb') as f:
            record.checksum = checksum_of(f)
        changed.append('checksum')
    if changed:
        record.save(update_fields=changed)


# -------------------------------------------------------------------------------------------------------------------------------------- make a backup

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
            checksum = checksum_of(f)
            f.seek(0)
            saved = default_storage.save(name, File(f))
        record.status, record.file_path, record.size_bytes = BackupRecord.Status.DONE, saved, os.path.getsize(zip_path)
        record.file_name, record.checksum = os.path.basename(saved), checksum
        record.records_count, record.files_count, record.files_skipped = records, files, skipped
        record.detail = ('Left out: ' + '; '.join(notes[:20]) + (' ...' if len(notes) > 20 else '')) if notes else ''
        record.finished_at = timezone.now()
        record.save()
    except Exception as exc:
        logger.exception('Backup %s failed', record_id)
        record.status, record.detail, record.finished_at = BackupRecord.Status.FAILED, str(exc)[:500] or exc.__class__.__name__, timezone.now()
        record.save()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def in_background(name, work, *args):
    """Run it in a thread: the request that asked answers at once and the Backup page polls the list."""
    def run():
        try:
            work(*args)
        finally:
            connections.close_all()
    threading.Thread(target=run, name=name, daemon=True).start()


def start_backup(record_id):
    in_background(f'backup-{record_id}', run_backup, record_id)


# ------------------------------------------------------------------------------------------------------------------------------------------- restore

def read_backup_zip(path):
    """Open a file chosen for a restore and make sure it is one of this system's backups; returns its manifest."""
    try:
        with zipfile.ZipFile(path) as zf:
            names = set(zf.namelist())
            if 'database.json' not in names:
                raise RestoreError('That file is not a backup of this system.')
            try:
                manifest = json.loads(zf.read('manifest.json')) if 'manifest.json' in names else {}
            except ValueError:
                manifest = {}
    except zipfile.BadZipFile:
        raise RestoreError('That file is not a backup of this system.')
    return manifest if isinstance(manifest, dict) else {}


def media_target(name):
    """Where a `media/...` entry of the zip goes in the storage, or '' when it must not be written (not a file, outside the uploads, a backup)."""
    if not name.startswith('media/') or name.endswith('/'):
        return ''
    raw = name[len('media/'):]
    path = posixpath.normpath(raw)
    if path != raw or path.startswith(('/', '../')) or path in ('.', '..') or '\\' in path or ':' in path:
        return ''
    if path == PREFIX or path.startswith(PREFIX + '/'):
        return ''
    return path


def restore_media(zf, storage, workdir):
    """Put the uploaded files of the backup back under their own paths. A file already there and the same size is left as it is;
    files that arrived after the backup are not touched. Returns (written, already there)."""
    written = same = 0
    for number, info in enumerate(zf.infolist()):
        path = media_target(info.filename)
        if not path:
            continue
        if storage.exists(path):
            if storage.size(path) == info.file_size:
                same += 1
                continue
            storage.delete(path)
        local = os.path.join(workdir, f'file_{number}')
        with zf.open(info) as src, open(local, 'wb') as dst:
            shutil.copyfileobj(src, dst, 1 << 20)
        with open(local, 'rb') as f:
            saved = storage.save(path, File(f))
        os.remove(local)
        if posixpath.normpath(saved.replace(os.sep, '/')) != path:
            # The storage kept the old file and put this one beside it under another name: the records would point at the wrong file.
            storage.delete(saved)
            raise RestoreError(f'The file {path} could not be put back, so no record was changed.')
        written += 1
    return written, same


def insert_records(model, objects, using):
    """Insert the records exactly as the backup has them: their own ids, their own dates (no "now" for created/updated), and no signal sent,
    so a restore writes no activity-log entry of its own."""
    fields = [f for f in model._meta.local_concrete_fields if not getattr(f, 'generated', False)]
    manager = model._base_manager.using(using)
    for start in range(0, len(objects), INSERT_BATCH):
        manager._insert(objects[start:start + INSERT_BATCH], fields=fields, using=using, raw=True)


def insert_links(model, deserialized, using):
    """The many-to-many links of the model's records (`m2m_data` of each deserialized record)."""
    for field in model._meta.many_to_many:
        through = field.remote_field.through
        if not through._meta.auto_created:
            continue
        own = through._meta.get_field(field.m2m_field_name()).attname
        other = through._meta.get_field(field.m2m_reverse_field_name()).attname
        rows = [through(**{own: item.object.pk, other: pk}) for item in deserialized for pk in (item.m2m_data or {}).get(field.name, [])]
        if rows:
            through._base_manager.using(using).bulk_create(rows, batch_size=INSERT_BATCH)


def restore_database(json_path, using='default'):
    """Replace every backed-up record with the records of `json_path`, in ONE transaction: all of it or none of it. Returns how many records."""
    connection = connections[using]
    models = list(backed_up_models(using))
    by_model = {model: [] for model in models}
    with open(json_path, 'r', encoding='utf-8') as f:
        # A field or a model the system no longer has is skipped, so a backup of a slightly older version still goes back in.
        for item in serializers.deserialize('json', f, using=using, ignorenonexistent=True):
            if type(item.object) in by_model:
                by_model[type(item.object)].append(item)
    cleared_models, cleared_apps = parse_apps_and_model_labels(CLEARED_BY_RESTORE)
    cleared = [m for m in apps.get_models() if m in cleared_models or m._meta.app_config in cleared_apps]
    tables = []
    for model in models + cleared:
        tables.append(model)
        tables.extend(link_tables(model))
    quote = connection.ops.quote_name
    total = 0
    with transaction.atomic(using=using):
        with connection.constraint_checks_disabled():
            with connection.cursor() as cursor:
                for table in tables:
                    cursor.execute(f'DELETE FROM {quote(table._meta.db_table)}')
            for model in models:
                items = by_model[model]
                if not items:
                    continue
                insert_records(model, [item.object for item in items], using)
                insert_links(model, items, using)
                total += len(items)
            # The Backup list is not replaced; an entry made by an account that the backup does not have keeps its name (made_by) only.
            accounts = get_user_model()._base_manager.using(using).values('pk')
            BackupRecord.objects.using(using).exclude(created_by__isnull=True).exclude(created_by__in=accounts).update(created_by=None)
            with connection.cursor() as cursor:
                for statement in connection.ops.sequence_reset_sql(no_style(), tables):
                    cursor.execute(statement)
        # every link between the restored records must hold, or the whole restore is undone
        connection.check_constraints(table_names=[table._meta.db_table for table in tables])
    return total


def restore_from_zip(zip_path):
    """Put the backup at `zip_path` back: the uploaded files, then the records. Returns (records, files written, files already there)."""
    workdir = tempfile.mkdtemp(prefix='oma_restore_')
    try:
        with zipfile.ZipFile(zip_path) as zf:
            db_path = os.path.join(workdir, 'database.json')
            with zf.open('database.json') as src, open(db_path, 'wb') as dst:
                shutil.copyfileobj(src, dst, 1 << 20)
            written, same = restore_media(zf, default_storage, workdir)
        records = restore_database(db_path)
        return records, written, same
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def run_restore(restore_id, safety_id, zip_path):
    """The whole restore, for a thread: the safety backup first, then the chosen backup put back. Both entries end Done or Failed.
    `zip_path` is a local copy of the chosen backup, removed at the end."""
    restore = BackupRecord.objects.get(pk=restore_id)
    try:
        run_backup(safety_id)
        safety = BackupRecord.objects.get(pk=safety_id)
        if safety.status != BackupRecord.Status.DONE:
            raise RestoreError(f'The safety backup could not be made, so nothing was restored. ({safety.detail})')
        logger.info('Restore %s: safety backup %s is done. Putting the backup back...', restore_id, safety_id)
        records, written, same = restore_from_zip(zip_path)
        restore.status = BackupRecord.Status.DONE
        restore.records_count, restore.files_count = records, written + same
        restore.detail = ''
    except Exception as exc:
        logger.exception('Restore %s failed', restore_id)
        restore.status = BackupRecord.Status.FAILED
        reason = str(exc)[:400] or exc.__class__.__name__
        restore.detail = reason if isinstance(exc, RestoreError) else f'No record was changed. {reason}'
    finally:
        try:
            os.remove(zip_path)
        except OSError:
            pass
    restore.finished_at = timezone.now()
    # Only these columns: the account that asked may not be in the restored records any more.
    restore.save(update_fields=['status', 'records_count', 'files_count', 'detail', 'finished_at'])


def start_restore(restore_id, safety_id, zip_path):
    in_background(f'restore-{restore_id}', run_restore, restore_id, safety_id, zip_path)
