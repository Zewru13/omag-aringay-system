# Backup & Restore, the BasaJuan way: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Backup & Restore two tabs, a Save As window, a restore on the page with "Settings and lists" or "Everything", and a Written | Removed | Skipped result.

**Architecture:** The rules for "Settings and lists" are one pure function (what happens to each list entry), applied by a second module in one database transaction. The existing full restore stays, and now also counts what it wrote and removed. The restore entry keeps its choice and result in two new columns.

**Tech Stack:** Django 5.2 + DRF, React 19 + Vite, `node --test` for website tests.

**Spec:** `docs/superpowers/specs/2026-11-28-basajuan-audit-backup-manual-design.md`, Part 2 only.

## Global Constraints

- Branch `basajuan-backup-restore` cut from `master`.
- **No commit, push, PR, merge, download or live database change until the user says so.** Task steps end with a ledger line, not a commit.
- Never run tests, scripts or browser checks against the live database. Local default Django settings point at LIVE Supabase. Hand-started servers and scripts use `EMAIL_HOST_USER=` and `EMAIL_HOST_PASSWORD=` (blank) and the throwaway settings. Backups made in tests go to a temporary folder, never the real bucket.
- Never stage `docs/*.json`, `demo-import-files*`, `package-lock.json`, `docs/superpowers/plans/2026-10-27-sample-data-*` or `2026-11-11-forms-consistency-audit.md`.
- Admin only, as now. Our colors and components; UI imports use `components/UI` (capitals); works on a phone.
- The Audit Log is never replaced. A restore that fails changes no record. A safety backup is made before **both** kinds of restore, and no restore runs without it.
- A request without `scope` means `everything` (the old website keeps working).
- **The new website must never send a "Settings and lists" restore to the old server** (which would ignore the choice and restore everything). The choice is offered only when the preview answer has `lists`.
- The local `.venv` has Django 4.2: no `db_default`. The live SQL adds the database default by hand.
- User Manual and Help text are not touched (Part 3). `docs/BACKUP_AND_RESTORE.md` is.
- Exact page words:
  - Create tab: "Saves one file (.zip) holding every record below and every uploaded file. You choose where it goes. Keep it somewhere off this computer."
  - Yellow box "Two things this file cannot hold": **The system itself** — "The program and the design of the database are in the project's code; this file holds records and uploaded files." **Server settings and keys** — "Such as the e-mail and file storage keys, which are kept on the server."
  - Suggested file name: `omag-backup-YYYY-MM-DD-HHMM.zip`. Toast: "Backup saved. N records and N files saved to your computer."
  - Restore tab: "Add a backup file to see what it would change. Nothing is written until you confirm." Drop area: "Drag a backup file here, or browse for a .zip file saved from this page." File card: name, "Taken (date and time) by (name)", **Change file**, **Remove**.
  - Choices: **Settings and lists** (preselected) "The lists of the settings pages and the signatories. People, farms, ponds and their records are left alone." **Everything** (red) "Also replaces accounts, registrations and all records. Anything recorded since the backup was taken is lost."
  - "Checking what would change…"; table **Records | In this backup | In the system now**; buttons **Restore settings** / **Restore everything**; "Are you sure you want to restore?" with password, **No**, **Yes, restore**.
  - Lock: "Creating backup…", "Restoring data…". Result: "Restore complete", **Written | Removed | Skipped**. History: "Restore (settings and lists)" / "Restore (everything)".

## Test commands

```bash
S="C:/Users/roron/AppData/Local/Temp/claude/4cedfa40b38d84bd/b8b75d7e-c47b-4be0-95ea-c2d32ac09a2e/scratchpad"
# throwaway database (run in the background); stop it with mysqladmin ... shutdown
"D:/xampp/mysql/bin/mysqld.exe" --no-defaults --datadir="$S/mdb" --port=3307 --bind-address=127.0.0.1 --console > "$S/mysqld.log" 2>&1
bash "$S/rt.sh" backups auditlog                 # server tests (settings: $S/mysqlplain.py)
cd "D:/CAPSTONE SYSTEM MJ/oma-frontend" && npm test
```

Baseline: 2197 server tests with only 6 known errors ("'super' object has no attribute 'dicts'"); 215/215 website tests.

## Review Focus

- The new website meets the old server during an update: only Everything may be possible there, never a "Settings and lists" that restores everything (Tasks 6, 9).
- A crop type or species added after the backup and now in use keeps its category, varieties, steps and feed or disease links (Task 4).
- A backup made before a list existed (for example no Fingerling sources in it) must not empty that list (Task 5).
- After a settings restore, adding a new list entry must work; on PostgreSQL the number counter must be past the restored numbers (Tasks 5, 10).
- Save As cancelled starts nothing; a file that cannot be written leaves the online copy for the history's Download button (Tasks 7, 8).

---

### Task 1: Two new columns

**Files:**
- Modify: `oma_aringay/backups/models.py`, `oma_aringay/backups/views.py` (`row`)
- Create: `oma_aringay/backups/migrations/0003_backuprecord_scope_report.py`
- Test: `oma_aringay/backups/tests.py`

**Interfaces:**
- Produces: `BackupRecord.Scope` (`EVERYTHING = 'everything'`, `SETTINGS = 'settings'`); `BackupRecord.scope` (CharField 12, default everything); `BackupRecord.report` (JSONField, null, blank). `row(record)` adds `scope` and `report`; for a restore `kind_label` is `'Restore (settings and lists)'` or `'Restore (everything)'`.

- [ ] **Step 1: Write the failing test**

```python
    def test_a_restore_entry_says_which_kind_of_restore_it_was(self):
        for scope, label in (('settings', 'Restore (settings and lists)'), ('everything', 'Restore (everything)')):
            entry = BackupRecord.objects.create(kind='restore', status='done', scope=scope, report={'totals': {'written': 1}})
            got = next(r for r in self.client.get(URL).data['results'] if r['id'] == entry.id)
            self.assertEqual((got['kind_label'], got['scope'], got['report']), (label, scope, {'totals': {'written': 1}}))
        old = BackupRecord.objects.create(status='done')
        self.assertEqual((old.scope, old.report), ('everything', None))
```

- [ ] **Step 2:** `bash "$S/rt.sh" backups` — Expected: FAIL (`unexpected keyword arguments: 'scope'`).
- [ ] **Step 3:** Add the fields and the migration (`makemigrations backups`, name `backuprecord_scope_report`); extend `row`.
- [ ] **Step 4:** `bash "$S/rt.sh" backups` — Expected: PASS; `makemigrations backups --check --dry-run` says no changes.

### Task 2: The backup file

**Files:**
- Modify: `oma_aringay/backups/service.py` (`run_backup`), `oma_aringay/backups/views.py` (`BackupDownloadedView`)
- Test: `oma_aringay/backups/tests.py`

**Interfaces:**
- Produces: manifest adds `made_by: str` and `models: list[str]` (the label of every model dumped, with or without rows). Server file path `backups/omag-backup-YYYY-MM-DD-HHMM.zip`. `POST /backups/<pk>/downloaded/` accepts optional `file_name`: the base name only, at most 120 characters, kept only when it ends in `.zip`.

- [ ] **Step 1: Write the failing tests** — `test_the_manifest_names_who_took_it_and_every_list_it_covers` (`manifest['made_by'] == record.made_by`; `'fisheries.fingerlingsource' in manifest['models']` although the table is empty; with `include_audit=False`, `'auditlog.auditlogentry' not in manifest['models']`); `test_the_file_is_named_the_new_way` (`assertRegex(record.file_name, r'^omag-backup-\d{4}-\d{2}-\d{2}-\d{4}.*\.zip$')`); `test_the_name_the_admin_chose_is_kept` (posting `{'file_name': r'D:\x\my copy.zip'}` stores `'my copy.zip'`; `'notes.txt'`, `''` and a 200-character name leave the old name). Update the existing prefix assertion.
- [ ] **Step 2:** Run — Expected: the new tests FAIL.
- [ ] **Step 3:** Implement. `default_storage.save` already adds a suffix when two backups share a minute.
- [ ] **Step 4:** Run — Expected: PASS.

### Task 3: Everything counts what it wrote and removed, and clears wrong history links

**Files:**
- Modify: `oma_aringay/backups/service.py` (`restore_database`, `restore_from_zip`, `run_restore`), `oma_aringay/auditlog/people.py`
- Test: `oma_aringay/backups/tests.py`, `oma_aringay/auditlog/test_people.py`

**Interfaces:**
- Produces: the **report** shape, used by Tasks 5, 6, 9:
  `{'rows': [{'key', 'label', 'written', 'removed', 'skipped', 'kept'}], 'totals': {'written', 'removed', 'skipped'}, 'skipped': [{'list', 'name', 'reason'}]}`
- `restore_database(json_path, using='default', include_audit=True) -> dict` (a report: one row per `DATA_GROUPS` group; `kept` True for the Audit Log, and for notifications when the file has none; `skipped` always 0).
- `restore_from_zip(zip_path) -> (report, files_written, files_same)`.
- `auditlog.people.drop_stale_links(using='default') -> int`: in every entry with `details['people']`, drops each one whose record is gone or now has another name (compared with what `_entry` would write today); if the entry had more than one, sets `details['more'] = True`. Called inside the restore's transaction.

Why the links: after an Everything restore a number can belong to someone else, so an old "View history" link could open the wrong person (noted in Part 1).

- [ ] **Step 1: Write the failing tests**

```python
    def test_an_everything_restore_counts_what_it_wrote_and_removed(self):
        record = self.make()
        Farmer.objects.create(rsbsa_number='01-033-02-019-990002', first_name='Later', last_name='One', gender='Male',
                              birthdate=date(1990, 1, 1), barangay='Alaska', civil_status='Single')
        report = self.restore(record)                     # helper: runs run_restore on a copy of the file, returns restore.report
        farmers = next(r for r in report['rows'] if r['key'] == 'farmers')
        self.assertEqual((farmers['written'], farmers['removed'], farmers['skipped']), (1, 1, 0))
        self.assertTrue(next(r for r in report['rows'] if r['key'] == 'audit')['kept'])
        self.assertEqual(report['totals']['written'], sum(r['written'] for r in report['rows']))
```

In `test_people.py`: `test_a_link_to_a_record_that_is_gone_or_renamed_is_dropped` (three entries: right name stays; other name dropped; missing number dropped) and `test_an_entry_about_two_never_becomes_a_single_row_link` (two people, one dropped → `details['more'] is True`). In `tests.py`: `test_after_an_everything_restore_no_history_link_points_at_someone_else` (entry about the farmer added after the backup has no `people` left afterwards).

- [ ] **Step 2:** Run `bash "$S/rt.sh" backups auditlog.test_people` — Expected: FAIL.
- [ ] **Step 3:** Collect each model's primary keys before the deletes; removed = before − file, written = rows inserted. Store `restore.report`; `records_count = totals['written']`.
- [ ] **Step 4:** Run — Expected: PASS.

### Task 4: The Settings and lists rules (no database)

**Files:**
- Create: `oma_aringay/backups/list_rules.py`, `oma_aringay/backups/test_list_rules.py` (`SimpleTestCase`)

**Interfaces:**
- `ListDef(label, title, named_by: tuple, unique: tuple = (), parents: tuple = (), links: tuple = ())`; `parents` is `((field, parent list label), ...)`, `links` is `((many-to-many field, target label), ...)`.
- `LISTS`: these 22, parents before children — title (label; named_by; * = the database keeps it unique):
  Crop categories (`production.cropcategory`; name*) · Crop subcategories (`production.cropsubcategory`; category, name*) · Crop types (`production.croptype`; name*; parents category, subcategory) · Crop varieties (`production.cropvariety`; crop_type, name*) · Crop input types (`production.cropinputtype`; name*; links crop_types) · Crop activity steps (`production.cropactivitystage`; crop_type, stage_name) · Harvest unit weights (`production.harvestunitweight`; crop_type, unit) · Seed sources (`production.seedsource`; name*) · Crop activity types (`production.activitytype`; name*) · Species categories (`fisheries.speciescategory`; name*) · Species (`fisheries.speciesoption`; species_name*; parent category) · Species activity steps (`fisheries.speciesactivitystage`; species_option, activity_name) · Feed types (`fisheries.feedtype`; name*; links species_options) · Disease types (`fisheries.diseasetype`; name*; links species_options) · Fingerling sources (`fisheries.fingerlingsource`; name*) · Fisheries activity types (`fisheries.fisheriesactivitytype`; name*) · Assistance agencies (`interventions.assistanceagency`; name*) · Assistance list entries (`interventions.assistanceoption`; domain, kind, name*) · Added assistance types (`interventions.assistancecustomtype`; domain, name*) · Assistance type units (`interventions.assistancetypeunits`; domain, assistance_type*) · Parcel classifications (`farmers.parcelclassification`; name*) · Report signatories (`reports.signatory`; name, role)
- `UNUSED_TABLES = ('production.disasterresponserule', 'fisheries.diseaseresponseguide', 'fisheries.fisheriesdisasterresponserule')`
- `decide(now, filed, used) -> Decision`. `now` and `filed`: `{label: {number: {field: value}}}`; a parent's value is its number. A label missing from `filed` is left as it is and gets no outcome. `used`: `{label: set(numbers)}`, cascades already counted.
  `Decision.add`, `.update`, `.remove`: `{label: set}`; `.skipped`: `{(label, number): code}`.
- `REASONS`: `used` "Kept: records use it." · `renamed` "Kept: records use it, and the backup has a different name in its place." · `belongs` "Kept: it belongs to an entry that is kept." · `needed` "Kept: an entry that is kept belongs to it." · `parent` "Not restored: the entry it belongs to was not restored." · `clash` "Not restored: another entry that is kept has this name."

The spec's table, plus these rulings it does not cover (each has a test):
1. Names compare without regard to capital letters.
2. What belongs to a **held** entry (`used` or `renamed`) stays with it (`belongs`): a new crop type in use keeps its varieties and steps.
3. The parent of any kept entry is not removed or renamed (`needed`).
4. A backup entry whose parent was not restored is not restored (`parent`).
5. `clash` is checked only where the database keeps names unique.
6. Rules 2–5 repeat until nothing changes.

- [ ] **Step 1: Write the failing tests.** Helper `run(now, filed, used=None)` and `outcome(decision, label, number)` returning `'add' | 'update' | 'remove' | <skip code> | None`. One test per row of the spec's table, with `T = 'production.croptype'`:

```python
    def test_in_the_file_only_is_added(self):
        self.assertEqual(outcome(run({T: {}}, {T: {1: {'name': 'Rice'}}}), T, 1), 'add')

    def test_same_name_is_set_back_even_when_in_use(self):
        d = run({T: {1: {'name': 'rice'}}}, {T: {1: {'name': 'Rice'}}}, {T: {1}})
        self.assertEqual(outcome(d, T, 1), 'update')

    def test_a_different_name_not_in_use_is_set_back(self):
        self.assertEqual(outcome(run({T: {1: {'name': 'Okra'}}}, {T: {1: {'name': 'Rice'}}}), T, 1), 'update')

    def test_a_different_name_in_use_is_never_renamed(self):
        self.assertEqual(outcome(run({T: {1: {'name': 'Okra'}}}, {T: {1: {'name': 'Rice'}}}, {T: {1}}), T, 1), 'renamed')

    def test_only_in_the_system_is_removed_unless_in_use(self):
        d = run({T: {1: {'name': 'A'}, 2: {'name': 'B'}}}, {T: {}}, {T: {2}})
        self.assertEqual((outcome(d, T, 1), outcome(d, T, 2)), ('remove', 'used'))

    def test_a_name_taken_by_a_kept_entry_cannot_be_added(self):
        d = run({T: {9: {'name': 'Rice'}}}, {T: {5: {'name': 'rice'}}}, {T: {9}})
        self.assertEqual((outcome(d, T, 5), outcome(d, T, 9)), ('clash', 'used'))
```

Then one test each for rulings 2–6 (kept new crop type keeps its variety, step and category; a variety of a `renamed` crop type is `parent`; two signatories of one name are both written; a clash that makes a type kept also stops its variety), a list missing from `filed` gets no outcome, and `test_every_entry_gets_exactly_one_outcome` over a mixed example (the numbers of `now ∪ filed` are split between add, update, remove and skipped with no overlap).
- [ ] **Step 2:** `bash "$S/rt.sh" backups.test_list_rules` — Expected: FAIL (no module).
- [ ] **Step 3:** Implement as: first pass by the table, then a loop applying rulings 3, 2, 4, 5 until a whole round changes nothing. An entry only ever moves towards kept or not restored, so the loop ends.
- [ ] **Step 4:** Run — Expected: PASS.

### Task 5: Applying the rules

**Files:**
- Create: `oma_aringay/backups/settings_restore.py`, `oma_aringay/backups/test_settings_restore.py` (`TransactionTestCase`, temporary storage as in `tests.py`)

**Interfaces:**
- Consumes: Task 4; the report shape of Task 3; `service.insert_records`.
- `file_lists(json_path, manifest) -> dict`: only the lists the file really covers. With `manifest['models']`, the labels in it; without it (older backups), only lists that have at least one entry. Each entry keeps **only the fields written in the file**.
- `current_lists(using='default') -> dict`; `used_now(using='default') -> dict`: found from the models' own relations (any related record outside `LISTS` and `UNUSED_TABLES`), then passed up through cascade relations between lists, so a link added later counts by itself.
- `list_rows(in_file: dict, manifest, using='default') -> list`: `{'key', 'label', 'in_file', 'now', 'kept'}` per list (`kept` and `in_file None` for a list the file does not cover). `in_file` is `service.zip_counts(...)`.
- `restore_settings(json_path, manifest, using='default') -> report`: one row per list; `skipped` entries `{'list': title, 'name', 'reason'}`, first 200 kept, totals count all.

Writing, in one transaction with constraint checks disabled, using only raw deletes, `QuerySet.update`, `insert_records` and `bulk_create` (no signals, so no per-record Audit Log notes): (1) remove, children first, with their link rows and their rows in `UNUSED_TABLES`; (2) give each updated entry with a unique name a temporary one, so two entries can swap names; (3) write parents first — updates set only the fields the file has; added entries get defaults for the rest, `date_created` now if missing, `created_by` empty if that account is gone; (4) links of each written entry = the file's links to entries that were written, plus its present links to entries that are kept; (5) reset number counters (`sequence_reset_sql`); (6) `check_constraints`.

- [ ] **Step 1: Write the failing tests** (each: set up, `service.dump_database(path)`, change the system, `restore_settings`):
  `test_a_changed_entry_goes_back_and_a_new_unused_one_goes` · `test_a_removed_entry_comes_back_with_its_own_number` · `test_a_crop_in_use_keeps_its_type_variety_steps_and_category` (with a real `CropMonitoringRecord`; the record still names the same crop) · `test_a_species_in_stock_keeps_its_feed_and_disease_links` · `test_two_entries_that_swapped_names_swap_back` · `test_an_older_backup_without_a_list_leaves_that_list_alone` (manifest without `models`, no fingerling sources in the file) · `test_a_field_the_file_does_not_have_keeps_its_value` · `test_old_unused_rules_do_not_hold_an_entry` (a crop type with a `DisasterResponseRule` and nothing else is removed) · `test_people_and_records_are_left_alone_and_no_file_is_touched` (farmer count, uploaded file, and `AuditLogEntry` count unchanged) · `test_a_failure_changes_nothing` (patch `backups.settings_restore.insert_records` to raise; every list equals what it was) · `test_a_new_entry_can_be_added_afterwards`.
- [ ] **Step 2:** `bash "$S/rt.sh" backups.test_settings_restore` — Expected: FAIL.
- [ ] **Step 3:** Implement. Turn each file entry into an object with `serializers.deserialize('python', [...], ignorenonexistent=True)` so dates and numbers are converted as in the full restore.
- [ ] **Step 4:** Run — Expected: PASS.

### Task 6: Preview and restore take the choice

**Files:**
- Modify: `oma_aringay/backups/views.py`, `oma_aringay/backups/service.py` (`restore_from_zip`, `run_restore`)
- Test: `oma_aringay/backups/tests.py`

**Interfaces:**
- `wanted_scope(data) -> str`: missing or empty → `'everything'`; `'settings'` and `'everything'` accepted; anything else → 400 "Choose what to restore."
- `POST /backups/restore/preview/` answers everything it answers now, plus `lists` (Task 5 `list_rows`) and `made_by` (manifest's, else the history entry's, else "another copy of the system"). Both tables come in one answer, so switching the choice does not send the file again.
- Both restore addresses take `scope`; `begin_restore(request, name, local, scope)` stores it on the restore entry; `restore_from_zip(zip_path, scope='everything')` — for settings it unpacks only `database.json` and touches no uploaded file.
- Audit Log text: `f'{restore.name} finished ({words}): {w:,} written, {r:,} removed, {s:,} skipped'`, `words` = "settings and lists" or "everything". Failed text as now.

- [ ] **Step 1: Write the failing tests** — `test_the_preview_has_a_row_for_every_list` (22 rows; `made_by` is the taker) · `test_a_settings_restore_by_file_changes_only_the_lists` (a farmer added after the backup is still there; a seed source added after it is gone; entry `scope == 'settings'`, report stored; a *Before restore* entry is Done) · `test_a_request_without_a_choice_restores_everything` · `test_an_unknown_choice_is_refused_and_nothing_starts` (400, no new entries) · `test_the_audit_log_says_what_a_restore_wrote_removed_and_skipped` · `test_no_settings_restore_when_the_safety_backup_cannot_be_made` · both restore addresses still want the password.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `bash "$S/rt.sh" backups auditlog` — Expected: PASS.

### Task 7: Website wording and the Save As window

**Files:**
- Modify: `oma-frontend/src/pages/Backup/backupFormat.js`, `oma-frontend/tests/backupFormat.test.mjs`
- Create: `oma-frontend/src/pages/Backup/saveToComputer.js`, `oma-frontend/tests/saveToComputer.test.mjs`

**Interfaces:**
- `suggestedFileName(date: Date) -> string` (browser's own time).
- `savedMessage(row) -> string` ("1 record and 1 file" in the singular).
- `takenLine(preview, timeZone?) -> string`: "Taken Nov 28, 2026 at 3:05 PM by maria".
- `RESTORE_SCOPES`: `[{id: 'settings', label, text, button: 'Restore settings'}, {id: 'everything', label, text, button: 'Restore everything', danger: true}]`.
- `offersSettings(preview) -> bool` (`Array.isArray(preview?.lists)`); `defaultScope(preview) -> 'settings' | 'everything'`; `previewRows(preview, scope)`.
- `backupSummary(row)`: a restore with a report reads "120 written · 3 removed · 1 skipped". `restoreChange` and `restoreHeadline` are removed.
- `askWhereToSave(name, win = globalThis.window) -> Promise<{kind: 'picked', handle} | {kind: 'download'} | {kind: 'cancelled'}>`: no `showSaveFilePicker` or any other error → download; `AbortError` → cancelled.
- `writeToHandle(handle, blob) -> Promise<void>`: `createWritable`, `write`, `close`; on an error `abort()` and rethrow.

- [ ] **Step 1: Write the failing tests** — exact strings above; `offersSettings({groups: []}) === false` and `defaultScope({groups: []}) === 'everything'` (the old server); `askWhereToSave` with a fake `win` for all three answers; `writeToHandle` with a fake handle records `write` then `close`, and `abort` when `write` throws.
- [ ] **Step 2:** `npm test` — Expected: the two backup test files FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` — Expected: the new checks PASS (page checks are rewritten in Tasks 8–9).

### Task 8: Create backup tab

**Files:**
- Modify: `oma-frontend/src/pages/Backup/BackupPage.jsx` (tabs, list, polling, lock, downloads), `BackupGroups.jsx`, `oma-frontend/tests/backupFormat.test.mjs`
- Create: `CreateBackupTab.jsx`, `BackupHistory.jsx`, `BackupNotesModal.jsx` (moved out of the page)

**Interfaces:**
- Consumes: Task 7.
- `PillTabs` "Create backup" | "Restore", at the top right; the tab is in the address (`?tab=restore`). Restore on a history row opens that tab with the entry as `hint`.
- Order on the Create tab: intro line and **Download backup**, group cards and Audit Log tick, yellow box, Backup history. A restore row with a report has **View result** in its row menu.

- [ ] **Step 1: Rewrite the page checks first:** tabs present and in the address; the two exact texts of the yellow box; in `BackupPage.jsx`, `askWhereToSave(` comes before `api.post('/backups/'` and a cancelled answer returns before posting (the Save As window must open at the click); `api.post(\`/backups/${row.id}/downloaded/\`` comes after `writeToHandle(`; lock titles "Creating backup" and "Restoring data". Remove the old checks for one page, no caution box and `<RestoreModal`; keep every check about locking, no Delete and table columns.
- [ ] **Step 2:** `npm test` — Expected: FAIL.
- [ ] **Step 3:** Implement. Start Backup: ask where to save (cancel keeps the notes window open) → start → remember the handle by entry number → when done, fetch the file, `writeToHandle`, then `downloaded/` with `file_name: handle.name` → `savedMessage`. The history's Download asks the same way. The safety backup downloads the usual way (there is no click to open a window from). A failed write keeps the online copy and says "The backup could not be saved to the file you chose. It is still online: press Download to try again."
- [ ] **Step 4:** `npm test` and `npm run build` — Expected: PASS.

### Task 9: Restore tab and result

**Files:**
- Create: `RestoreTab.jsx`, `RestoreConfirmWindow.jsx`, `RestoreResult.jsx`
- Delete: `RestoreModal.jsx`
- Modify: `BackupPage.jsx`, `oma-frontend/tests/backupFormat.test.mjs`

**Interfaces:**
- Consumes: Tasks 6, 7, 8.
- `RestoreTab({hint, locked, result, onStarted, onClearResult})`; `RestoreResult({entry})` (also used by **View result**): "Restore complete", three large totals, a table with the same three per row ("kept" / "not in this backup" where kept), and the skipped entries with list, name and reason (and "and N more" past 200). A failed restore shows its reason.
- The **Restore settings** / **Restore everything** button is red for both choices. The confirm window first says what will be replaced: the chosen choice's own text and how many records the file holds next to how many the system holds now.
- Without `offersSettings(preview)`: only Everything is offered, with "The server is still being updated. Settings and lists will be available in a few minutes."

- [ ] **Step 1: Write the page checks first:** the exact words from Global Constraints; the request appends `scope`; the settings choice is rendered only behind `offersSettings(`; the confirm window has a password input, "No" and "Yes, restore"; Everything uses the danger colors; `RestoreModal.jsx` no longer exists.
- [ ] **Step 2:** `npm test` — Expected: FAIL.
- [ ] **Step 3:** Implement. `FormTable` pieces and `ModalShell` for the confirm window, as other windows do.
- [ ] **Step 4:** `npm test` and `npm run build` — Expected: PASS.

### Task 10: Prove it

**Files:** `docs/BACKUP_AND_RESTORE.md`

- [ ] **Step 1:** Rewrite the guide for the two tabs, Save As, both choices, the rules table with the six rulings, and the result.
- [ ] **Step 2:** Full suites: `bash "$S/rt.sh"` — Expected: only the 6 known errors; `npm test`, `npm run build` — Expected: PASS; lint of changed files — Expected: no new findings; `makemigrations --check --dry-run` — Expected: no changes.
- [ ] **Step 3 (needs the user's yes to download):** In a new Python 3.11 environment in the scratchpad, install `oma_aringay/requirements.txt` and `pgserver` 0.1.4 from PyPI; run `backups` and `auditlog.test_people` on a throwaway PostgreSQL with Django 5.2.18 (recipe in memory `eight-item-round-2026-11-11`) — Expected: PASS. Without the yes, say plainly that PostgreSQL was not tested.
- [ ] **Step 4:** Browser check on the throwaway system, computer and phone: make a backup (the Save As window itself cannot be clicked by a test browser, so check with a stand-in picker and once through the plain download), cancel, wrong file, settings restore with one in-use entry, everything restore, View result, old-server answer without `lists`, and a Focal Person refused.
- [ ] **Step 5:** One final review of the whole branch by a fresh reviewer; fix Critical and Important findings test-first.
- [ ] **Step 6:** Report, then wait for the user's approval to: apply the live SQL, commit, push, open the pull request, and merge if the website preview passes.

```sql
alter table backups_backuprecord
  add column if not exists scope varchar(12) not null default 'everything',
  add column if not exists report jsonb null;
insert into django_migrations (app, name, applied)
select 'backups', '0003_backuprecord_scope_report', now()
where not exists (select 1 from django_migrations where app = 'backups' and name = '0003_backuprecord_scope_report');
```

Checked on 2026-11-28 by reading only: all 182 live record links wait until the end of a change; the live history has 8 entries (4 manual backups, 2 safety backups, 2 restores); the unused tables hold 24 crop and 24 fisheries disaster rules and 5 disease guides.
