# Backup and restore

## What a backup is

Admin > Backup makes **one .zip file** of the whole system:

| In the zip | What it holds |
|---|---|
| `database.json` | Every record of every app (farmers, fisherfolk, organizations, crops, harvests, fisheries, assistance, disasters, users with their password **hashes**, audit log...). Sessions, permissions, content types, the Django admin log and the login-token blacklist are left out: the system rebuilds them. |
| `media/...` | Every uploaded file (damage photos, PCIC forms, profile photos, documents), by its path in the file storage. Earlier backups are never packed into a new one. |
| `manifest.json` | When it was made, how many records and files, and any file that was left out. |

The zip is kept in the system's file storage under `backups/` (the Supabase bucket on the live site) and listed on the Backup page. The newest **14** are kept; older ones are deleted. Files above the size limit (`BACKUP_MAX_MEDIA_BYTES`, 500 MB of uploads by default) are left out and named in the manifest and on the page.

The zip holds personal records and password hashes: **download it only on a trusted computer and store it somewhere safe** (it is not encrypted).

## Making backups

- **By hand:** Admin > Backup > Back up now. It runs in the background (a few minutes for a large system); the list refreshes by itself. Download it from the same list.
- **Automatically (free, GitHub Actions):** the workflow `.github/workflows/backup.yml` runs `python manage.py backup_system` every day at 2:00 AM Philippine time (18:00 UTC). It appears in the list as *Scheduled*. To switch it on, add these ten **repository secrets** (GitHub > the repository > Settings > Secrets and variables > Actions > New repository secret), with the **same values the live web service uses**:

  `SUPABASE_DB_HOST`, `SUPABASE_DB_PORT`, `SUPABASE_DB_NAME`, `SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD`, `SUPABASE_STORAGE_ACCESS_KEY`, `SUPABASE_STORAGE_SECRET_KEY`, `SUPABASE_STORAGE_ENDPOINT`, `SUPABASE_STORAGE_REGION`, `SUPABASE_STORAGE_BUCKET`.

  Then test it without waiting for the night: Actions > *Daily backup* > Run workflow. A good run ends with `Backup backups/...zip: N records, N files, N bytes.` and a new *Scheduled* entry in Admin > Backup. GitHub emails you when a run fails. Notes: the live `SECRET_KEY` is not needed (the job uses a placeholder); GitHub's servers reach the internet over IPv4 only, so if the run says "Network is unreachable", put the Supabase **Session pooler** address and port in `SUPABASE_DB_HOST` / `SUPABASE_DB_PORT` (the pooler user is `postgres.<project reference>`); anyone who can write to the repository can read these secrets, so only add trusted people; when you change the database password or the storage keys, update the secrets too.
- **Automatically (paid alternative):** schedule the same command on a host instead, for example a Render cron job (about $1/month) with the same environment as the web service and root directory `oma_aringay`. The command exits with an error if the backup fails, so the scheduler can alert you.

Do a **test restore** into a scratch database now and then (below): a backup nobody has restored is only a hope.

## Restoring

Restoring replaces data, so do it deliberately and, if the live site is involved, with the site stopped.

1. **Get the zip** (Admin > Backup > Download) and unzip it.
2. **Prepare an empty database** of the same system version: point `DATABASES` (or `DATABASE_URL`) at it and run

   ```bash
   python manage.py migrate
   ```

3. **Load the records:**

   ```bash
   python manage.py loaddata database.json
   ```

   Run this on a database with no data of its own: loading over existing rows with the same ids overwrites them. The `loaddata` of a large file can take several minutes.
4. **Put the uploaded files back** into the file storage under the same paths: copy everything inside the zip's `media/` folder into the media location (the bucket root on the live site, or `oma_aringay/media/` on a local copy). Keep the folder structure as it is.
5. **Check:** sign in as an Admin, open a farmer with a photo and an organization with members, and compare the counts with `manifest.json`.

If the restored system is a different copy (not the live one), set its own environment variables (database, storage, email) first; do not point a test restore at the live bucket.

## Notes

- Backups never change the system's own data; the only row they add is the entry in the Backup list.
- Only an Admin can see, make, download or delete backups.
- Deleting a backup in the list also deletes its file from the storage.
