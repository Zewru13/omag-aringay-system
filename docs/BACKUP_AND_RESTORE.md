# Backup & Restore

Admin > **Backup & Restore** is one page with two buttons: **Download backup** (make a backup) and **Restore** (a form: drop a backup file, see what it would change, then confirm; a backup made on another copy of the system is accepted too). Below them are the cards of what a backup holds and the Backup history.

## What a backup is

Download backup makes **one .zip file** of the whole system:

| In the zip | What it holds |
|---|---|
| `database.json` | Every record of every app (farmers, fisherfolk, organizations, crops, harvests, fisheries, assistance, disasters, users with their password **hashes**, audit log...). Sessions, permissions, content types, the Django admin log, the login-token blacklist and the Backup list itself are left out: the system rebuilds them. |
| `media/...` | Every uploaded file (damage photos, PCIC forms, profile photos, documents), by its path in the file storage. Backups are never packed into a backup. |
| `manifest.json` | When it was made, how many records and files, whether the audit trail is in it (`audit_included`), and any file that was left out. |

Files above the size limit (`BACKUP_MAX_MEDIA_BYTES`, 500 MB of uploads by default) are left out and named in the manifest and on the page.

The zip holds personal records and password hashes: **download it only on a trusted computer and store it somewhere safe** (it is not encrypted).

## Making a backup

Backups are made **only by hand**: Admin > Backup & Restore > **Download backup**. There is no automatic or nightly backup.

The page shows what a backup holds, in groups (accounts, farmers, crops, fisheries, cycles, organizations, assistance, other records) with how many records each has now (`GET /api/backups/summary/`). One group is optional: **Include the audit trail and notification history** (the activity log and the notifications). It is **unticked by default**: the backup is then smaller and quicker, and a restore of it keeps the activity log and notifications already in the system (an entry that names an account the restore removed names nobody afterwards, and a notification for a removed account is dropped). A request to the API that does not say anything (`include_audit` missing) still makes a full backup.

1. Press **Download backup**. Type a name and the **Location** where the file will be kept (both can be left empty; an empty name becomes "Backup of <date and time>"), then **Start Backup**.
2. It runs in the background (a few minutes for a large system). While it runs, the page is locked: no other backup, edit, download or restore can be started until it is done. Keep the page open.
3. When it is done the page **saves the file to the computer** (`oma_backup_YYYYMMDD_HHMMSS.zip`, usually in Downloads) and the online copy is removed. The zip is **not kept online**. If the page was closed before the file arrived, the entry says *Waiting to be downloaded*: press **Download** in its row menu.

## The Backup history

- Every backup stays in the list with its name, date, time, location, kind, who made it, size and status. **Nothing can be deleted from it.**
- **Edit** (row menu) changes the name, the location and the remarks. The date, the time and the result are facts and cannot be changed.
- Kinds: *Manual* (Download backup), *Before restore* (the safety backup a restore makes), *Restore* (a restore that was run), *Automatic* (nightly backups made by an earlier version; none are made any more).
- Each backup keeps the fingerprint (SHA-256) of its file, so that the same file can be recognised when it is chosen for a restore.

## Restoring (the Restore form)

Restoring replaces data, so do it deliberately and when nobody else is using the system.

1. Admin > Backup & Restore > **Restore** (or the row menu of a finished backup in the history > **Restore**, which opens the same form).
2. **Drag the backup file** onto the form, or press **Browse files**. The file is only read: the system recognises it by its fingerprint among the backups of the history (a genuine backup of this system that the history does not know, for example one made on another copy of the system or after the list was lost, is accepted too and shown as made elsewhere) and shows, group by group, the records in the file next to the records now and what a restore would do (`POST /api/backups/restore/preview/`). **Nothing is written until you confirm.**
3. Type **your own password** and press **Restore** (`POST /api/backups/restore/`).
4. The system first makes a **safety backup** of how things are now (it appears as *Before restore* and is saved to the computer too). If the safety backup cannot be made, nothing is restored.
5. Then the backup is put back: the uploaded files, and every record in one step. If anything fails, **no record is changed** and the entry says *Failed* with the reason.

After a restore, the records, uploaded files, user accounts and passwords are those of the backup (the activity log and notifications too, unless the backup was made without them: those stay as they are); everyone signs in again. Files uploaded after the backup are left in the storage. To undo a restore, restore its *Before restore* backup.

A backup restores best into the same version of the system that made it. Fields or tables the system no longer has are skipped.

## Restoring into an empty copy (disaster recovery)

When the system itself is lost and a new, empty copy is set up, a backup can be loaded by hand:

1. Unzip the backup.
2. Point `DATABASES` at the empty database of the same system version and run `python manage.py migrate`.
3. `python manage.py loaddata database.json` (on a database with no data of its own).
4. Copy everything inside the zip's `media/` folder into the media location (the bucket root on the live site, or `oma_aringay/media/` on a local copy), keeping the folder structure.
5. Sign in as an Admin and compare the counts with `manifest.json`.

If the restored system is a different copy (not the live one), set its own environment variables (database, storage, email) first; do not point a test restore at the live bucket.

## Notes

- A backup never changes the system's own data; the only row it adds is its entry in the Backup list.
- Only an Admin can see, make, download, edit or restore backups.
- A backup or a restore still shown as Running 30 minutes after it started (the server restarted under it) is marked Failed, so the page is not locked for ever.
