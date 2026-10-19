# Undo for Every Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Undo a recent import" for the seven imports that have none (crop records, farmers/fisherfolk organizations, organization members, organization equipment, crop/fisheries assistance, stocking), behind the security key, staff only.

**Architecture:** Two shared tables record what each committed import added, written in the same transaction as the import. One generic engine builds an undo *plan* (what can be removed, what is kept and why) and executes it in slices, applying the RSBSA-undo safety rule (unchanged since import, nothing depends on it, an import-created login never used). Each import only gains a few lines that open a batch and report what it created.

**Tech Stack:** Django 5.2 + DRF (`oma_aringay/core`), React 19 + Vite + Tailwind (`oma-frontend`), Django `TestCase`/`APITestCase`, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-19-import-undo-and-security-key-design.md` (Part B). **Depends on** the security key plan (`2026-10-19-security-key.md`): `core.security_key.require_security_key(request)` must exist.

## Global Constraints

- Import type keys (exact strings): `crop_records`, `farmers_org`, `fisherfolk_org`, `farmers_org_members`, `fisherfolk_org_members`, `farmers_org_equipment`, `fisherfolk_org_equipment`, `crop_assistance`, `fisheries_assistance`, `stocking`. The RSBSA registry import keeps its own undo and log, untouched.
- A record is removed only if **all** hold: its fingerprint still matches the one taken when the import finished; Django's delete collector finds nothing else depending on it; any login the import created was never activated or used. Otherwise it is **kept** with a reason shown on screen.
- Undo executes in slices of **100** records; running it again is safe (an already-undone item is skipped). Batches are listed for the last **30 days**. Imports done before this ships are not tracked.
- Only ADMIN and EVALUATOR; executing an undo needs the security key (`require_security_key`); the plan/preview does not.
- A dry-run (preview) import never leaves a batch behind; an import that rolls back leaves no batch and no items.
- Things undo cannot take back, stated on screen: emails already sent, notifications already delivered.
- One additive migration in `core` (two tables). No existing table changes. Tests run on a throwaway MariaDB, never the live database; commit after each task; do not push or touch the live database. The user applies the SQL to Supabase project `omag-aringay` (ref `zqvemhtzrccbofvwneph`) before merging.

## Review Focus

1. A dry-run import of every type leaves zero `ImportBatch` rows — pinned in each import task.
2. A record edited after the import (any field) is kept with the reason "edited since the import" — Task 2.
3. A record something depends on (e.g. a stocking record with logs, an organization with members) is kept with the reason — Task 2.
4. Undoing the same batch twice, or resuming after a failure mid-slice, changes nothing the second time — Task 2.
5. The member import's side effect on the person's other memberships is restored only if nobody changed them since — Task 6.

---

### Task 1: Batch tables, recorder and fingerprint

**Files:**
- Modify: `oma_aringay/core/models.py` (add `ImportBatch`, `ImportBatchItem`)
- Create: `oma_aringay/core/import_batches.py`, `oma_aringay/core/migrations/0008_importbatch_importbatchitem.py` (via `makemigrations core`; the number follows the security-key migration)
- Test: `oma_aringay/core/test_import_batches.py`

**Interfaces:**
- Models: `ImportBatch(id: UUIDField pk default uuid4, import_type: CharField(30, db_index), label: CharField(255, blank), performed_by: FK User null SET_NULL, created_at: DateTimeField(auto_now_add, db_index), row_count: PositiveInteger, undone_at: DateTimeField null, undone_by: FK User null SET_NULL)`; `ImportBatchItem(batch: FK ImportBatch CASCADE related_name='items', model_label: CharField(100) e.g. 'monitoring.farmvisit', object_id: PositiveInteger, action: CharField(12) choices CREATE | RESTORE, field_name: CharField(50, blank), old_value: TextField(blank), new_value: TextField(blank), fingerprint: CharField(64, blank), undone_at: DateTimeField null, kept_reason: CharField(255, blank))`. Index `(batch, action)`.
- Produces (`core/import_batches.py`):
  - `IMPORT_TYPES: dict[str, str]` key → label (the ten keys above).
  - `start_batch(import_type: str, user, label: str = '') -> ImportBatch`
  - `record_created(batch: ImportBatch, obj) -> None` — stores `model_label = obj._meta.label_lower`, `object_id`, and `fingerprint(obj)`; bumps `row_count`. Call it **after** the import has finished changing `obj`.
  - `record_restore(batch, obj, field: str, old, new) -> None` — a side effect on an existing record that undo can reverse.
  - `fingerprint(obj) -> str` — sha256 hex of the JSON of every concrete field value except the primary key and fields with `auto_now`/`auto_now_add`, sorted by field name, values via `str()`.

- [ ] **Step 1: Write the failing tests** (`ImportBatchRecorderTests`, using `monitoring.models.FarmVisit` as a stand-in created row): `test_start_batch_rejects_an_unknown_type`; `test_record_created_stores_model_id_and_fingerprint`; `test_fingerprint_changes_when_a_field_changes_and_ignores_auto_timestamps`; `test_record_restore_stores_old_and_new`; `test_a_rolled_back_transaction_leaves_no_batch` (wrap in `transaction.atomic()` and raise).
- [ ] **Step 2: Run** `python manage.py test core.test_import_batches --noinput`. Expected: fail.
- [ ] **Step 3: Implement** models, migration and module per the Interfaces.
- [ ] **Step 4: Run** the same command. Expected: pass.
- [ ] **Step 5: Commit** `git commit -m "Import batches: tables and recorder"`.

### Task 2: The undo engine (plan and execute)

**Files:**
- Create: `oma_aringay/core/import_undo.py`
- Test: `oma_aringay/core/test_import_undo.py`

**Interfaces:**
- Consumes: Task 1.
- Produces (`core/import_undo.py`):
  - `@dataclass PlanItem: item_id: int, label: str, can_undo: bool, reason: str`
  - `build_plan(batch: ImportBatch) -> list[PlanItem]` — one entry per not-yet-undone item (`label` = `str(obj)` or "(already deleted)"); never writes.
  - `execute_items(batch, item_ids: list[int], user) -> list[dict]` — for each id returns `{'item_id', 'result': 'removed' | 'restored' | 'kept' | 'skipped', 'reason': str}`; removes `CREATE` rows via `obj.delete()` inside `transaction.atomic()` only when the rule holds; `RESTORE` rows set the field back to `old_value` only if the current value still equals `new_value`; marks `undone_at`/`kept_reason`; sets `batch.undone_at/undone_by` once no item remains pending **and** at least one was removed.
  - `register_cleanup(model_label: str, hook: Callable[[obj, user], str | None])` — a model-specific hook run before deletion; returning a string keeps the record with that reason (used for organization logins in Task 5).
  - Reason texts (exact): `"Edited since the import."`, `"Other records depend on it."`, `"Already removed."`.

- [ ] **Step 1: Write the failing tests** (`ImportUndoEngineTests`, `FarmVisit` rows under a `Farmer`): `test_untouched_rows_are_removed`; `test_an_edited_row_is_kept_with_the_reason` (change `purpose` after recording); `test_a_row_with_dependents_is_kept` (record a `Farmer` as created and give it a `FarmVisit` → kept, "Other records depend on it."); `test_a_missing_row_is_skipped_as_already_removed`; `test_undo_twice_changes_nothing_more`; `test_resuming_after_a_partial_run_finishes_the_rest` (execute half, then all ids); `test_build_plan_never_writes`; `test_restore_item_reverts_only_when_unchanged`; `test_a_cleanup_hook_can_keep_a_record`; `test_batch_is_marked_undone_only_when_nothing_is_pending`.
- [ ] **Step 2: Run** `python manage.py test core.test_import_undo --noinput`. Expected: fail.
- [ ] **Step 3: Implement** the engine. Dependents check: `django.db.models.deletion.Collector(using='default')`, `collect([obj])`, dependents = any collected instance whose model/pk differs from `obj` (same approach as `farmers/rsbsa_import_undo.py`; read it first and reuse its helper if it can be imported without a cycle).
- [ ] **Step 4: Run** the tests. Expected: pass. Mutation check: make the fingerprint comparison always equal and confirm `test_an_edited_row_is_kept_with_the_reason` fails; restore.
- [ ] **Step 5: Commit** `git commit -m "Import undo: plan and execute engine"`.

### Task 3: API endpoints

**Files:**
- Create: `oma_aringay/core/import_batch_views.py`
- Modify: `oma_aringay/core/urls.py`
- Test: `oma_aringay/core/test_import_batch_api.py`

**Interfaces:** Consumes Tasks 1–2 and `require_security_key`. Endpoints (ADMIN and EVALUATOR only):
- `GET /api/imports/batches/?type=<key>` → `{"batches": [{"id", "import_type", "label", "performed_by_name", "created_at", "row_count", "undone": bool}]}` newest first, last 30 days, 404-free for unknown types (400).
- `GET /api/imports/batches/<uuid>/undo-plan/` → `{"items": [{"item_id","label","can_undo","reason"}], "can_undo": n, "kept": n}` (no key needed).
- `POST /api/imports/batches/<uuid>/undo/` body `{"item_ids": [1..100]}` → `{"results": [...]}`; needs the security key (`require_security_key`); 400 over 100 ids.

- [ ] **Step 1: Write the failing tests**: staff-only (citizen 403, anonymous 401); `test_list_filters_by_type_and_30_days`; `test_plan_needs_no_key`; `test_undo_without_key_is_refused_and_changes_nothing`; `test_undo_with_key_removes_untouched_rows`; `test_more_than_100_ids_is_400`; `test_unknown_batch_is_404`.
- [ ] **Step 2: Run** `python manage.py test core.test_import_batch_api --noinput`. Expected: fail.
- [ ] **Step 3: Implement** the three views and routes.
- [ ] **Step 4: Run** the tests. Expected: pass.
- [ ] **Step 5: Commit** `git commit -m "Import undo: batch endpoints"`.

### Task 4: Crop records import

**Files:**
- Modify: `oma_aringay/production/crop_record_import_views.py` (`CropRecordImportCommitView.post`, `_create_crop_record`)
- Test: `oma_aringay/production/test_crop_import_undo.py`

**Interfaces:** Consumes `start_batch('crop_records', user)` and `record_created`. The commit opens one batch per commit call and records each `CropMonitoringRecord` **after** its retroactive-Harvested `record.save()`.

- [ ] **Step 1: Write the failing tests** (build the file with the helpers used in `farmers/test_no_dual_registration.py` / `production/test_crop_record_duplicates.py`): `test_a_commit_records_one_batch_with_every_created_record`; `test_a_preview_leaves_no_batch`; `test_undoing_removes_the_untouched_records`; `test_a_record_with_a_log_is_kept`.
- [ ] **Step 2: Run** `python manage.py test production.test_crop_import_undo --noinput`. Expected: fail.
- [ ] **Step 3: Implement** the hook (batch created only on the commit endpoint, inside its existing transaction).
- [ ] **Step 4: Run** the tests, then `python manage.py test production --noinput`. Expected: pass.
- [ ] **Step 5: Commit** `git commit -m "Crop record import: undoable"`.

### Task 5: Farmers and fisherfolk organization imports

**Files:**
- Modify: `oma_aringay/associations/views.py` (`_import_organizations` and the loop that calls `serializer.save()` / `create_inactive_citizen_shell` / `activate_organization_account`), `oma_aringay/core/import_undo.py` registration of the login cleanup (or a new `associations/import_undo_hooks.py` imported from `AssociationsConfig.ready`)
- Test: `oma_aringay/associations/test_org_import_undo.py`

**Interfaces:** Batch types `farmers_org` / `fisherfolk_org`; `record_created(batch, instance)` after activation. A cleanup hook for both organization models: if the organization's citizen login was activated or used (reuse the "login never activated/used" check in `farmers/rsbsa_import_undo.py`), keep it with "Its login was already used."; otherwise delete the import-created login together with the organization.

- [ ] **Step 1: Write the failing tests**: `test_each_created_organization_is_recorded_for_both_kinds`; `test_a_preview_leaves_no_batch`; `test_undo_removes_the_organization_and_its_unused_login`; `test_an_organization_whose_login_was_used_is_kept`; `test_an_organization_with_members_is_kept`.
- [ ] **Step 2: Run** `python manage.py test associations.test_org_import_undo --noinput`. Expected: fail.
- [ ] **Step 3: Implement** the hook and the cleanup.
- [ ] **Step 4: Run** the tests and `python manage.py test associations --noinput`. Expected: pass.
- [ ] **Step 5: Commit** `git commit -m "Organization imports: undoable"`.

### Task 6: Organization members import

**Files:**
- Modify: `oma_aringay/associations/org_imports.py` (`run_member_import`, around `serializer.save(organization=organization)` and `_resolve_and_assign_main`)
- Test: `oma_aringay/associations/test_member_import_undo.py`

**Interfaces:** Batch types `farmers_org_members` / `fisherfolk_org_members` (by `domain`), `label=organization.name`; `record_created(batch, member)`; before calling `_resolve_and_assign_main`, capture each of the person's other active memberships' `is_main`, and after it `record_restore(batch, other, 'is_main', old, new)` for each one that changed. Batches are opened only when `dry_run` is false.

- [ ] **Step 1: Write the failing tests**: `test_new_members_are_recorded`; `test_a_preview_leaves_no_batch`; `test_undo_removes_the_new_members_and_restores_the_other_membership_flag`; `test_the_flag_is_left_alone_if_someone_changed_it_since`; `test_a_member_with_activity_is_kept`.
- [ ] **Step 2: Run** `python manage.py test associations.test_member_import_undo --noinput`. Expected: fail.
- [ ] **Step 3: Implement** the hook.
- [ ] **Step 4: Run** the tests and `python manage.py test associations --noinput`. Expected: pass.
- [ ] **Step 5: Commit** `git commit -m "Member import: undoable"`.

### Task 7: Organization equipment import

**Files:** Modify `oma_aringay/associations/org_imports.py` (`run_equipment_import`, at `serializer.save(organization=organization)`); Test `oma_aringay/associations/test_equipment_import_undo.py`.

**Interfaces:** Batch types `farmers_org_equipment` / `fisherfolk_org_equipment`, `label=organization.name`; `record_created(batch, line)`; not opened on dry run.

- [ ] **Step 1: Write the failing tests**: `test_new_equipment_lines_are_recorded`; `test_a_preview_leaves_no_batch`; `test_undo_removes_untouched_lines`; `test_a_line_with_a_loan_is_kept`.
- [ ] **Step 2: Run** `python manage.py test associations.test_equipment_import_undo --noinput`. Expected: fail.
- [ ] **Step 3: Implement** the hook.
- [ ] **Step 4: Run** the tests and `python manage.py test associations --noinput`. Expected: pass.
- [ ] **Step 5: Commit** `git commit -m "Equipment import: undoable"`.

### Task 8: Crop and fisheries assistance imports

**Files:** Modify `oma_aringay/interventions/views.py` (the shared import function whose loop ends with `record = serializer.save(recorded_by=user)` then `record_model.objects.filter(pk=record.pk).update(status=CONFIRMED)`); Test `oma_aringay/interventions/test_assistance_import_undo.py`.

**Interfaces:** Batch types `crop_assistance` / `fisheries_assistance`; call `record_created` **after** the status `update()` and re-read the row so the fingerprint holds the final state; not opened on dry run.

- [ ] **Step 1: Write the failing tests**: `test_each_created_record_is_recorded_for_both_domains`; `test_a_preview_leaves_no_batch`; `test_undo_removes_untouched_records`; `test_a_record_the_recipient_confirmed_since_is_kept`.
- [ ] **Step 2: Run** `python manage.py test interventions.test_assistance_import_undo --noinput`. Expected: fail.
- [ ] **Step 3: Implement** the hook.
- [ ] **Step 4: Run** the tests and `python manage.py test interventions --noinput`. Expected: pass.
- [ ] **Step 5: Commit** `git commit -m "Assistance imports: undoable"`.

### Task 9: Stocking import

**Files:** Modify `oma_aringay/fisheries/views.py` (`StockingForecastingImportView._import`, at the `StockingRecord.objects.create(...)`); Test `oma_aringay/fisheries/test_stocking_import_undo.py`.

**Interfaces:** Batch type `stocking`; `record_created` after create (re-read), not opened on dry run.

- [ ] **Step 1: Write the failing tests**: `test_created_records_are_recorded`; `test_a_preview_leaves_no_batch`; `test_undo_removes_untouched_records`; `test_a_record_with_a_log_is_kept`.
- [ ] **Step 2: Run** `python manage.py test fisheries.test_stocking_import_undo --noinput`. Expected: fail.
- [ ] **Step 3: Implement** the hook.
- [ ] **Step 4: Run** the tests and `python manage.py test fisheries --noinput`. Expected: pass.
- [ ] **Step 5: Commit** `git commit -m "Stocking import: undoable"`.

### Task 10: Frontend panel

**Files:**
- Create: `oma-frontend/src/components/ImportUndoPanel.jsx`, `oma-frontend/src/utils/importUndo.js`
- Modify: `oma-frontend/src/components/ImportFileModal.jsx`, `oma-frontend/src/components/CropRecordImportModal.jsx` (add a prop `undoType` and an "Undo a recent import" link under the dialog's footer note, same look as `RsbsaImportModal.jsx:355`); the callers that open `ImportFileModal` pass `undoType` (list in the spec's table: `CropAssistancePage`, `FisheriesAssistancePage`, `FisherfolkOrganizationsPage`, `FisheriesRecordsPage`, `OrganizationDetailPage` ×2, `OrganizationsPage`, `CropInformationPage` and `ForecastingPage` for `CropRecordImportModal`)
- Test: `oma-frontend/tests/importUndo.test.mjs`

**Interfaces (`utils/importUndo.js`):** `summarizePlan(items) -> {canUndo, kept, total}`; `sliceIds(ids, size = 100) -> number[][]`; `undoLabel(type) -> string` (e.g. "Undo a recent crop records import"). `ImportUndoPanel({ type, onClose, onDone })`: lists `GET /imports/batches/?type=`, shows the plan for the chosen batch (removable count and each kept record with its reason, plus the "emails already sent cannot be taken back" note), then a **Confirm undo** that runs the slices through `POST .../undo/` (the security-key prompt appears through the axios handler), shows the results, and refreshes the host page via `onDone`. Phone layout follows the existing import dialog (stacked 44px buttons).

- [ ] **Step 1: Write the failing tests** for the three helpers (empty plan, all kept, 250 ids → 100/100/50).
- [ ] **Step 2: Run** `npm test`. Expected: fail.
- [ ] **Step 3: Implement** helpers, panel and wiring.
- [ ] **Step 4: Run** `npm test`, eslint comparison with `origin/master`, `npx vite build`. Expected: pass.
- [ ] **Step 5: Commit** `git commit -m "Import undo: shared panel in every import dialog"`.

### Task 11: Verify end to end and prepare delivery

- [ ] **Step 1:** Full backend suite on the throwaway MariaDB; everything passes.
- [ ] **Step 2:** Real-browser check (throwaway stack): for at least the crop records, an organization and the stocking import — commit a sample file from `sample-import-files/`, open **Undo a recent import**, read the preview, confirm with the key, and see the records leave; edit one record first and see it kept with its reason; check one phone width (375 px). Report anything not checked.
- [ ] **Step 3:** Write the live-database SQL for the two tables (+ the `django_migrations` row for `core 0008_importbatch_importbatchitem`) to `docs/superpowers/plans/2026-10-19-import-undo-live-db.sql`; **do not run it** — the user runs it in the Supabase SQL editor on `omag-aringay` before merging.
- [ ] **Step 4:** Open the pull request only when the user says so; update the memory note `visits-links-security-key-plan`.
