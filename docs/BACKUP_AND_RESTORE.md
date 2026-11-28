# Backup & Restore

Admin > **Backup & Restore** has two tabs at the top right: **Create backup** (make a backup, and the Backup history) and **Restore** (add a backup file, see what it would change, then confirm; a backup made on another copy of the system is accepted too). Only an Admin can use it.

## What a backup is

A backup is **one .zip file** of the whole system:

| In the zip | What it holds |
|---|---|
| `database.json` | Every record of every app (farmers, fisherfolk, cooperatives, crops, harvests, fisheries, assistance, disasters, users with their password **hashes**, the Audit Log if ticked...). Sessions, permissions, content types, the Django admin log, the login-token blacklist and the Backup list itself are left out: the system rebuilds them. |
| `media/...` | Every uploaded file (damage photos, PCIC forms, profile photos, documents), by its path in the file storage. Backups are never packed into a backup. |
| `manifest.json` | When it was made and by whom (`made_by`), how many records and files, every list and table it covers (`models`), whether the Audit Log is in it (`audit_included`), and any file that was left out. |

Files above the size limit (`BACKUP_MAX_MEDIA_BYTES`, 500 MB of uploads by default) are left out and named in the manifest and on the page.

**Two things the file cannot hold** (the yellow box on the page): the system itself (the program and the design of the database are in the project's code) and the server settings and keys (such as the e-mail and file storage keys, which are kept on the server).

The zip holds personal records and password hashes: **save it only on a trusted computer and keep it somewhere safe** (it is not encrypted).

## Making a backup

Backups are made **only by hand**. There is no automatic or nightly backup.

The Create backup tab shows what a backup holds, in groups with how many records each has now (`GET /api/backups/summary/`). One choice is optional: **Include the Audit Log and notification history**. It is **unticked by default**: the backup is then smaller and quicker, and a restore of it keeps the notifications already in the system. A request to the API that says nothing (`include_audit` missing) still makes a full backup.

1. Press **Download backup**. A **Save As** window opens at once: choose where the file goes. The suggested name is `omag-backup-YYYY-MM-DD-HHMM.zip`. Closing the window starts nothing. The window opens before the backup starts because a browser only allows it right after a click.
   **Browsers without this window** (Firefox, Safari, phones, and some with it switched off) download the file the usual way, usually to Downloads.
2. The backup runs (a few minutes for a large system). It is named "Backup of <date and time>". The screen is held ("Creating backup…"): no other page, backup, download or restore until it is done. Keep the page open.
3. The file is written to the chosen place and the page says how many records and files were saved. **Only then is the online copy removed.** If the file cannot be written, the online copy stays: press the **Download** link under the entry's status. The same applies if the page was closed before the file arrived (the entry says *Waiting to be downloaded*).

## The Backup history

- Every backup stays in the list with its name, date, time, location, kind, who made it, size and status. **Nothing can be deleted from it.**
- **Location** fills itself with the name of the saved file. A browser does not tell a website which folder was chosen, so the folder cannot be shown. (A place typed for an older backup stays above the file name.)
- The table has no actions. The one exception is the **Download** link under *Waiting to be downloaded*. To restore, add the file on the Restore tab. A restore's full result (with the reason for each skipped entry) is shown when it ends; afterwards the history keeps the numbers written, removed and skipped.
- Kinds: *Manual*, *Before restore* (the safety backup a restore makes), *Restore (settings and lists)*, *Restore (everything)*, *Automatic* (nightly backups made by an earlier version; none are made any more).
- Each backup keeps the fingerprint (SHA-256) of its file, so that the same file can be recognised when it is added for a restore.

## Restoring

Restoring replaces data, so do it deliberately and when nobody else is using the system.

1. Open the **Restore** tab.
2. **Drag the backup file** onto the box, or press **Browse files**. The file is only read: the page shows its name and when and by whom it was taken, and what a restore would change (`POST /api/backups/restore/preview/`). **Nothing is written until you confirm.**
3. Choose **What to restore**:
   - **Settings and lists** (preselected): the lists of the settings pages and the report signatories. People, farms, ponds and their records, and the uploaded files, are left alone. The table has one row per list.
   - **Everything** (in red): also accounts, registrations, all records and the uploaded files. **Anything recorded since the backup was taken is lost.** The table has one row per group of records; the Audit Log is marked *kept*.
4. Press **Restore settings** or **Restore everything**, type **your own password** and press **Yes, restore** (`POST /api/backups/restore/` with `scope` = `settings` or `everything`; a request without `scope` means everything).
5. Both kinds first make a **safety backup** of how things are now (it appears as *Before restore* and downloads to the computer when the restore ends). If it cannot be made, nothing is restored.
6. The restore runs ("Restoring data…") in one database transaction: **if anything fails, no record is changed** and the result says why.
7. **Restore complete** shows how many were **Written**, **Removed** and **Skipped**, the same per row, and every skipped entry with its reason (the first 200 by name).
   - *Written*: put back from the file. *Removed*: in the system and not in the file. *Skipped*: a list entry deliberately left as it is.

The Audit Log is **never replaced**; the restore is added to it, for example "Restore of "October copy" finished (settings and lists): 120 written, 3 removed, 1 skipped". After an Everything restore, a **View history** link in the Audit Log whose record is gone, or has another name now, is removed from its entry (the entry stays), so that it cannot open the wrong person.

### After an Everything restore

The records, uploaded files, user accounts and passwords are those of the backup (the notifications too, unless the backup was made without them); everyone signs in again. If the restore removes the signed-in Admin's own account, they are signed out. Files uploaded after the backup are left in the storage. To undo a restore, restore its *Before restore* backup (as Everything).

## The Settings and lists rules

The lists: crop categories, subcategories, types, varieties, input types, activity steps, harvest unit weights, seed sources and crop activity types; species categories, species, species activity steps, feed types, disease types, fingerling sources and fisheries activity types; assistance agencies, list entries, added types and type units; parcel classifications; report signatories.

An entry is **in use** when a record outside these lists is linked to it (a crop record to its crop type, a stocking to its species), directly or through an entry that would be removed with it.

| Case | Result |
|---|---|
| In the file, not in the system | added (Written) |
| In both, same name (capital letters do not count) | set back to the file's values (Written) |
| In both, different name, not in use | set back (Written) |
| In both, different name, in use | **Skipped**: an entry in use is never renamed, because its number may mean something else in the backup |
| Only in the system, not in use | removed (Removed) |
| Only in the system, in use | **Skipped**: kept |
| Cannot be added because a kept entry has that name | **Skipped** |

So that kept entries stay whole:

- What belongs to an entry kept because records use it stays too (a new crop type in use keeps its varieties and activity steps), and so does what belongs to those.
- The entry a kept entry belongs to (a crop type's category) is not removed or renamed.
- A backup entry whose parent was not restored is not restored either.
- A name clash counts only where the database keeps names unique (two signatories may share a name).
- A backup made before a list existed, or before this version and with that list empty, leaves that list alone. A field the file does not have keeps its current value.

Records that copied a list's words (such as a seed source or an assistance type) keep their words. The old disaster and disease advice rows, which nothing shows any more, do not hold an entry: they are removed with it.

## Old backup files

Backup files made by earlier versions can still be restored, both ways. A backup restores best into the same version of the system that made it. Fields or tables the system no longer has are skipped.

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
- A backup or a restore still shown as Running 30 minutes after it started (the server restarted under it) is marked Failed, so the page is not locked for ever.
