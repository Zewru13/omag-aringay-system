# Cycle G — Assistance Distributions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New assistance waits for the member's confirmation before it counts as received; an organization can pick which members receive a distribution, sees its history as expandable distributions with filters, can remove entries from a distribution (kept for audit), and staff choose one row (or none) for duplicate RSBSA numbers on the import.

**Architecture:** `BeneficiaryRecord` / `FisherfolkBeneficiaryRecord` gain `distribution_batch`, `recorded_at`, a `REMOVED` status with `removed_at` / `removed_by`, and a default manager that hides removed rows (`all_objects` shows everything). `save()` starts records AWAITING_CONFIRMATION (or PENDING when future-dated). A shared module `interventions/distributions.py` builds the grouped history and performs removals for both domains; the distribute view accepts `member_ids`. The organization pages render the grouped history; the RSBSA modal gets a per-duplicate-group chooser.

**Tech Stack:** Django 4.2 + DRF, MariaDB (tests), React, Vite.

**Spec:** `docs/superpowers/specs/2026-10-09-assistance-distributions-cycle-g-design.md`

## Global Constraints

- New records: `status = AWAITING_CONFIRMATION` when `date_given <= today`, else `PENDING`; `recorded_at = now` on creation; applies to both models and every creation path. Existing rows keep their statuses; old rows have `recorded_at = NULL` and `distribution_batch = NULL`.
- `DistributionStatus.REMOVED = 'REMOVED', 'Removed'`. Removal only from PENDING or AWAITING_CONFIRMATION; CONFIRMED / NOT_RECEIVED / RESOLVED are kept and reported. Removal uses `record.save(update_fields=[...])` (not `QuerySet.update`) so the audit signal fires. Re-read under `select_for_update` and re-check the status inside the transaction.
- Default manager `objects` excludes `status='REMOVED'`; `all_objects = models.Manager()` includes everything. `objects` must be the FIRST manager declared (it is `_default_manager`).
- `member_ids`: optional list of person ids on the distribute request; present means ONLY those, each must be an ACTIVE member of the organization (else 400 `{'member_ids': [...]}`); empty list is 400 `Select at least one member.`; absent means every active member (unchanged). `dry_run` ignores `member_ids` and lists the whole roster.
- Distribution group id: the `distribution_batch` UUID string, or `legacy-<sha1 hex[:12]>` of `(recorded_by_id, assistance_type, date_given, quantity, sorted source_agencies)` for records without a batch. A group never mixes organizations (`recorded_by` is part of the key and the query is scoped to the caller).
- Group `summary_status`: `Needs follow-up` if any NOT_RECEIVED; else `Awaiting confirmation` if any AWAITING_CONFIRMATION or PENDING; else `Confirmed`. Counts and summary exclude removed rows.
- Staff screens are unchanged: no grouping, still `Date Given` and Edit. Organization history: `Date and Time` header, `Action = Remove from the list`, no Edit. English strings only.
- Never test against Supabase; throwaway stack with the mail credentials blanked (`EMAIL_HOST_USER= EMAIL_HOST_PASSWORD=`, confirm `settings.SMTP_CONFIGURED` is False). Run `makemigrations` only with `--settings=mysqlplain`. Commit only when the user says so; no push. After finishing, the live database needs `manage.py migrate` (interventions 0019) before the code is deployed — tell the user, never run it unasked.

## Review Focus

1. A distribution with mixed and partly removed members: counts and `summary_status` exclude removed rows. (Task 3)
2. Two organizations distributing the same type, date and quantity: legacy groups never mix. (Task 3)
3. Removing a record at the moment it becomes CONFIRMED: the locked re-read refuses it and nothing changes. (Task 4)
4. A member deactivated after being distributed to still appears in the old distribution. (Task 3)
5. Three rows for one RSBSA number, and duplicate rows with different underlying statuses, in the import chooser. (Task 7)

## Harness

Same recipe as cycles A-F: throwaway MariaDB on port 3307 (`mysql_install_db.exe --datadir=<scratch>\mdb`; `mysqld.exe --no-defaults --datadir=<scratch>\mdb --port=3307 --skip-grant-tables --standalone --bind-address=127.0.0.1 --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci`; database `oma_aringay_db` utf8mb4), `<scratch>\mysqlplain.py`, tests `DB_BACKEND=mysql PYTHONPATH=<scratch> ../.venv/Scripts/python.exe manage.py test <labels> --settings=mysqlplain --noinput`. Fixtures: copy `make_org`, `make_citizen`, farmer/fisherfolk makers from `interventions/test_org_confirmed_edit.py` (organization accounts linked with `UserLinkedRecord`, members via `FarmersOrganizationMember` / `FisherfolkOrganizationMember`). Endpoints: `POST /api/associations/farmers/<id>/distribute-assistance/` and `/api/associations/fisherfolk/<id>/distribute-assistance/`. Browser stack: `migrate`, `seed_org.py` run as `manage.py shell -c "exec(open(path).read())"`, runserver `127.0.0.1:8001 --settings=mysqlplain --noreload` (mail blanked), `VITE_API_URL=http://127.0.0.1:8001/api npx vite --port 5174 --strictPort`; set `localStorage.accessToken` from `org_tokens.json` and a placeholder `refreshToken`; organization pages: `/crop-assistance`, `/fisheries-assistance`; farmer `/my-account`. Cleanup: clear browser storage, stop the processes by PID (not `taskkill node.exe`), delete the scratch `mdb`, test media and token file.

## File Structure

- Backend modified: `interventions/models.py` (both record models, `DistributionStatus`), `interventions/lifecycle.py` (`notify_assistance_recorded`), `interventions/serializers.py` (`OrganizationDistributionRequestSerializer`), `interventions/views.py` (single-member report batch id, new views), `interventions/urls.py`, `associations/views.py` (`_run_organization_distribution`, both distribute views), `fisheries/management/commands/seed_fisheries_demo_data.py` (explicit statuses). New migration `interventions/migrations/0019_assistance_distributions.py`.
- Backend new: `interventions/distributions.py` (grouping and removal), tests `interventions/test_distribution_status.py`, `interventions/test_distribution_members.py`, `interventions/test_distribution_history.py`, `interventions/test_distribution_removal.py`.
- Frontend new: `utils/distributionHelpers.js` (selection summary, date-and-time format, duplicate-group helpers), `pages/AssistanceManagement/OrgDistributionHistory.jsx` (table, expansion, remove, filters, shared by both pages). Modified: `DistributeAssistanceModal.jsx`, `CropAssistancePage.jsx`, `FisheriesAssistancePage.jsx`, `components/RsbsaImportModal.jsx`.

---

### Task 1: Model fields, REMOVED status, managers, creation rule (backend)

**Files:**
- Modify: `oma_aringay/interventions/models.py`, `oma_aringay/interventions/lifecycle.py`, `oma_aringay/fisheries/management/commands/seed_fisheries_demo_data.py`
- Create: `oma_aringay/interventions/migrations/0019_assistance_distributions.py` (via `makemigrations interventions -n assistance_distributions --settings=mysqlplain`)
- Test: `oma_aringay/interventions/test_distribution_status.py`

**Interfaces:**
- Produces on both record models: `distribution_batch` (UUIDField, null, blank, `db_index=True`), `recorded_at` (DateTimeField, null, blank), `removed_at` (DateTimeField, null, blank), `removed_by` (FK to AUTH_USER_MODEL, null, SET_NULL, related_name `+`); `objects` (default manager excluding REMOVED), `all_objects`; `DistributionStatus.REMOVED`; `save()` sets `status` (AWAITING_CONFIRMATION when `date_given <= timezone.localdate()` else PENDING) and `recorded_at = timezone.now()` when adding.

- [ ] **Step 1: Write the failing tests** (`APITestCase` or `TestCase`): for BOTH models, a record created with `date_given` today, yesterday and tomorrow gets AWAITING_CONFIRMATION, AWAITING_CONFIRMATION, PENDING and a non-null `recorded_at`; `distribution_batch` stays null unless set; a removed record (status flipped with `all_objects.filter().update(status='REMOVED')`) is absent from `Model.objects.all()`, from `farmer.beneficiary_records.all()` (reverse relation) / `fisherfolk.beneficiary_records.all()`, and present in `Model.all_objects.all()`; `notify_assistance_recorded` creates a notification for a record that is AWAITING_CONFIRMATION for a person with a citizen account (assert one `Notification` for that user with verb `recorded assistance for you:`) and none for a PENDING record, none for the actor, none for a person without an account.
- [ ] **Step 2: Run** `manage.py test interventions.test_distribution_status`. Expected: FAIL (fields missing).
- [ ] **Step 3: Implement** the fields, the two managers (an `ActiveRecordManager(models.Manager)` whose `get_queryset` excludes `status=REMOVED`, declared before `all_objects`), the `save()` change (replace the CONFIRMED/PENDING rule; set `recorded_at` on add), `notify_assistance_recorded` accepting AWAITING_CONFIRMATION (`status in (CONFIRMED, AWAITING_CONFIRMATION)`), the seed command's explicit `.update(status=...)` where it relied on the old rule, then the migration.
- [ ] **Step 4: Run** the module. Expected: PASS. **Mutation check:** revert the `save()` rule to the old CONFIRMED rule and confirm the creation test fails; restore.
- [ ] **Step 5: Run the whole suite and `makemigrations --check --settings=mysqlplain`.** Expected: existing tests that asserted an immediate CONFIRMED status fail — update each to the new rule (they are checking the rule, not an unrelated behaviour) and ledger them as a Ruling; everything else OK, no migration changes.

---

### Task 2: Distribute with `member_ids`, batch ids (backend)

**Files:**
- Modify: `oma_aringay/interventions/serializers.py`, `oma_aringay/associations/views.py`, `oma_aringay/interventions/views.py` (single-member report)
- Test: `oma_aringay/interventions/test_distribution_members.py`

**Interfaces:**
- Consumes (Task 1): `distribution_batch`.
- Produces: `OrganizationDistributionRequestSerializer.member_ids` (`ListField(child=IntegerField(), required=False, allow_empty=True)`; the view resolves and validates it); `_run_organization_distribution(record_model, person_field, organization, members, data, user, commit=True, batch=None)` sets `distribution_batch=batch` on created records; both distribute views generate `batch = uuid.uuid4()` per request and pass the selected members; the response `results` items are unchanged and the response gains `distribution_id` (the batch string) when committed; the ad-hoc create views (`BeneficiaryAdHocListCreateView.perform_create` and the fisheries equivalent) set a fresh batch per request.

- [ ] **Step 1: Write the failing tests** (both domains, organization account posting): subset `member_ids` creates records only for those people (assert people not listed have none); all ids = same as omitting; omitting still distributes to every active member (backward compatible); empty list → 400 with `Select at least one member.`; an id of a person who is not a member, of a member of another organization, and of a deactivated member → 400 naming `member_ids` and no records created; `dry_run` with `member_ids` still returns every active member as `would_create`; created records share one `distribution_batch` equal to the response `distribution_id`, and two separate requests get different batches; each created record's `status` is AWAITING_CONFIRMATION for today's date and PENDING for a future date; the single-member report creates a record with a non-null batch.
- [ ] **Step 2: Run** the module. Expected: FAIL.
- [ ] **Step 3: Implement** per Interfaces; member filtering happens before the 30-day check so unselected people get no result row at all.
- [ ] **Step 4: Run** the module. Expected: PASS. **Mutation check:** ignore `member_ids` (distribute to everyone) and confirm the subset test fails; restore.
- [ ] **Step 5: Run the whole suite.** Expected: OK.

---

### Task 3: Grouped history endpoints with filters (backend)

**Files:**
- Create: `oma_aringay/interventions/distributions.py`
- Modify: `oma_aringay/interventions/views.py`, `oma_aringay/interventions/urls.py`
- Test: `oma_aringay/interventions/test_distribution_history.py`

**Interfaces:**
- Consumes (Tasks 1-2): batch id, `recorded_at`, statuses.
- Produces: `interventions.distributions.build_distributions(queryset, person_field) -> list[dict]` (groups the given records, newest first by `date_given` then `recorded_at`; item shape: `{id, assistance_type, source_agencies, quantity, date_given, recorded_at (ISO or null), member_count, status_counts (dict of the five statuses, zeros included), summary_status, members: [{record_id, person_id, name, status, confirmed_at}]}`); `GET /api/interventions/my-org-distributions/` (farmers organization account) and `GET /api/interventions/my-org-fisherfolk-distributions/` (fisherfolk organization account) with optional query parameters `status` (a status value or `needs-follow-up` = NOT_RECEIVED), `assistance_type`, `date_from`, `date_to` (inclusive, on `date_given`), `member` (case-insensitive substring of the person's full name), `source_agency` (the list contains the value); filters select records first, groups are built from the matching records only. Scoped to `recorded_by = request.user`, other account types / the other domain's organization → empty list, citizens that are not organizations → 403 as the existing history views.

- [ ] **Step 1: Write the failing tests:** records created through the distribute endpoint with a subset appear as ONE group with the right `member_count`, `members` and `status_counts`; a record with no batch for the same org/type/date/quantity/agencies groups with its siblings under a `legacy-` id, and the same legacy key for a second organization stays separate (Review Focus 2); `summary_status` for all-awaiting, with one NOT_RECEIVED, all confirmed; a partly removed distribution counts only non-removed members and the summary ignores removed ones (Review Focus 1); a deactivated member still appears (Review Focus 4); each filter narrows correctly and combinations work, `member` matches a substring and the returned group lists only the matching members (counts follow the filtered records); another organization's records never appear; a non-organization citizen gets 403; ordering newest first; fisheries mirror covers the same cases at least once each for grouping, filters, scoping.
- [ ] **Step 2: Run** the module. Expected: FAIL (404).
- [ ] **Step 3: Implement** `build_distributions` (group in Python over the filtered queryset with `select_related(person)`), the two views, the URL entries.
- [ ] **Step 4: Run** the module. Expected: PASS. **Mutation check:** drop `recorded_by` from the legacy key and confirm the cross-organization test fails; restore.
- [ ] **Step 5: Run the whole suite.** Expected: OK.

---

### Task 4: Removal (backend)

**Files:**
- Modify: `oma_aringay/interventions/distributions.py`, `oma_aringay/interventions/views.py`, `oma_aringay/interventions/urls.py`
- Test: `oma_aringay/interventions/test_distribution_removal.py`

**Interfaces:**
- Consumes (Tasks 1, 3): REMOVED status, `all_objects`, group ids.
- Produces: `interventions.distributions.remove_records(domain, user, record_ids=None, group_id=None) -> {'removed': [ids], 'kept': [{'id', 'status', 'reason'}]}` (a module-level `_lock_records(model, ids)` helper doing `all_objects.select_for_update().filter(pk__in=ids)` that tests can patch); `POST /api/interventions/assistance-removals/` body `{domain: 'crop' | 'fisheries', record_ids: [..]}` or `{domain, distribution: '<group id>'}`; staff may remove any, an organization account only records with `recorded_by = itself` (a foreign or unknown id gives 400 `Some records were not found.` and nothing is removed; `kept` is only for records in a non-removable status); removed rows get `status=REMOVED`, `removed_at`, `removed_by`.

- [ ] **Step 1: Write the failing tests:** removing one AWAITING_CONFIRMATION and one PENDING record removes both (status REMOVED, `removed_by` = the caller, `removed_at` set) and they vanish from `my-org-distributions` and from `Model.objects`, while `all_objects` still has them; a CONFIRMED / NOT_RECEIVED / RESOLVED record in the request is kept with a reason and the others are still removed; removing a whole distribution via the group id (batch and `legacy-` ids) removes only its unconfirmed members and reports the rest as kept; removing an already REMOVED id is a no-op (200, not in `removed`); another organization's record id, an unknown id, and a mix → 400 and nothing removed; the recipient cannot confirm a removed record (the confirm-received endpoint answers 404 or 400, and the record stays REMOVED), nor see it in their history; a removed record is ignored by the 30-day cross-organization block (a later distribution to the same person by another organization is not blocked by it); the audit log gains an entry for each removal (assert an `AuditLog` row mentioning `Beneficiary record`); a farmer or non-staff non-organization caller gets 403; the race (Review Focus 3): patch `_lock_records` with a side effect that flips one record to CONFIRMED before delegating → that record is reported kept (`already confirmed`), the others removed, nothing else changes; the fisheries mirror covers single removal, whole-distribution removal and kept-confirmed.
- [ ] **Step 2: Run** the module. Expected: FAIL (404).
- [ ] **Step 3: Implement** `remove_records` (one `transaction.atomic()`, lock, per-record status check, `record.save(update_fields=['status', 'removed_at', 'removed_by'])`), the view with the permission rules above, the URL.
- [ ] **Step 4: Run** the module. Expected: PASS. **Mutation check:** let CONFIRMED records be removed and confirm the kept test fails; restore.
- [ ] **Step 5: Run the whole suite.** Expected: OK.

---

### Task 5: Frontend helpers and the member checklist in the distribute form

**Files:**
- Create: `oma-frontend/src/utils/distributionHelpers.js`
- Modify: `oma-frontend/src/pages/AssistanceManagement/DistributeAssistanceModal.jsx`
- Test: `check_distributionhelpers.mjs` in the scratchpad (node script, same style as `check_approvalstatus.mjs`).

**Interfaces:**
- Produces in `utils/distributionHelpers.js`: `selectionSummary(members, selectedIds) -> { selected, blocked, willReceive, total }` (`members` are preview result rows `{person_id, status: 'would_create' | 'would_block'}`; blocked members are never selectable and never counted as selected); `formatDateTime(dateIso, recordedAtIso) -> string` (`'Oct 9, 2026 · 3:41 PM'` using `en-US` and the viewer's local time, or `'Oct 9, 2026'` when `recordedAtIso` is falsy, `'—'` when the date is falsy); `duplicateGroups(rows) -> [{ rsbsa, rows: [...] }]` (rows with `status === 'duplicate_in_file'` plus the first row of each repeated RSBSA, keyed by RSBSA number, in file order); `groupDecision(group, selectedRows) -> 'accepted' | 'rejected' | 'undecided'` (`accepted` when exactly one row of the group is selected, `rejected` when the group is marked rejected, else `undecided` — rejected groups are tracked by the modal as a `Set` of RSBSA numbers passed as a third argument `rejectedGroups`).

- [ ] **Step 1: Write the failing check script:** `selectionSummary` with 5 members, 1 blocked, 3 selected → counts; selecting a blocked id is ignored; none selected → `willReceive` 0; `formatDateTime` for a timestamp and for null time and for a missing date (compare against the same `Intl` output computed in the script so the assertion is timezone-independent); `duplicateGroups` with two rows of one RSBSA, three of another, and a unique row → two groups with 2 and 3 rows in order; `groupDecision` for 0, 1 rows selected, and rejected.
- [ ] **Step 2: Run** `node check_distributionhelpers.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the helpers, then in `DistributeAssistanceModal.jsx` the review step: a members checklist built from the `dry_run` results (checkbox per member checked by default, blocked members disabled with their reason, Select all / Clear, "N of M selected"), the stat tiles and summary computed with `selectionSummary`, Confirm disabled when none selected, the commit request sending `member_ids` (selected, non-blocked person ids), and the results step unchanged. A member list must keep working with 1000+ rows (no per-row state objects beyond a `Set`).
- [ ] **Step 4: Run** the check script. Expected: PASS. **Lint and build:** per-file eslint compared with HEAD (scratch `lintcmp.sh`) and `vite build`.
- [ ] **Step 5: Commit nothing** (the user commits). Browser check is in Task 8.

---

### Task 6: Organization history table, removal and filters (frontend)

**Files:**
- Create: `oma-frontend/src/pages/AssistanceManagement/OrgDistributionHistory.jsx`
- Modify: `oma-frontend/src/pages/AssistanceManagement/CropAssistancePage.jsx`, `oma-frontend/src/pages/AssistanceManagement/FisheriesAssistancePage.jsx`

**Interfaces:**
- Consumes (backend): `GET /interventions/my-org-distributions/` (crop) and `/my-org-fisherfolk-distributions/` (fisheries) with the filter parameters; `POST /interventions/assistance-removals/`; `formatDateTime` from Task 5.
- Produces: `OrgDistributionHistory({ domain: 'crop' | 'fisheries', refreshKey, onChanged })` rendering the table (columns `Date and Time`, `Assistance`, `Quantity`, `Members`, `Status`, `Action`), a filter bar (Status, Assistance type, Date from/to, Member name, Source agency, Clear filters), row expansion listing members (name, status pill, confirmed time, per-member `Remove from the list` while the member is AWAITING_CONFIRMATION or PENDING), the row action `Remove from the list` with a confirmation dialog stating how many entries will be removed and how many stay because they are confirmed, toasts for the result, an empty state and a loading state; the two pages render it in place of the existing organization "History" table (organization mode only; the staff and farmer/fisherfolk views and the "Confirm for Members" tab are untouched; Edit and the old `Date Given` header disappear from the organization history).

- [ ] **Step 1: Implement** the component and wire the two pages (reuse `DataTable`, `StatusPill`, the existing filter bar styles and `ModalShell` confirmation used elsewhere on these pages); the refresh key bumps after a distribution, a single-member report, or a removal.
- [ ] **Step 2: Run lint compared with HEAD and `vite build`.** Expected: no new messages, build OK.
- [ ] **Step 3: Browser check** is in Task 8 (these screens need the seeded stack).

---

### Task 7: RSBSA duplicate chooser (frontend)

**Files:**
- Modify: `oma-frontend/src/components/RsbsaImportModal.jsx`

**Interfaces:**
- Consumes (Task 5): `duplicateGroups`, `groupDecision`.
- Produces: in the preview step a "Duplicate RSBSA numbers" panel above the table listing each group with its rows side by side (row number, name, barangay, contact number, the differing fields from `r.changes`, the underlying status text), a radio per row and a "Reject all rows for this RSBSA number" choice; choosing a row selects it and deselects its siblings in `selectedRows`, rejecting deselects all; select-all keeps skipping duplicate rows; the Commit button shows "N duplicate groups need a decision" and is disabled while any group is undecided; groups whose rows all have `underlying_status === 'matched_no_changes'` need no decision.

- [ ] **Step 1: Implement** the panel and the decision state (`rejectedGroups` as a `Set` of RSBSA numbers, cleared when a new file is previewed).
- [ ] **Step 2: Extend `check_distributionhelpers.mjs`** with Review Focus 5: three rows for one number, and a group with different underlying statuses (`matched_with_changes`, `unmatched`) → one group each, `groupDecision` correct for choose / reject / none; run it. Expected: PASS.
- [ ] **Step 3: Lint compared with HEAD and `vite build`.** Expected: no new messages, build OK.
- [ ] **Step 4: Browser check** with a small RSBSA file that has duplicate numbers is in Task 8 (the preview endpoint needs a real file; use the repo's sample files if one exists, otherwise build a two-row CSV in the scratchpad with the importer's header version).

---

### Task 8: Verification on the throwaway stack

- [ ] **Step 1: Whole backend suite** (`manage.py test`, output to a scratch file, read the tail). Expected: OK.
- [ ] **Step 2: Browser (organization account, farmers and fisherfolk):** distribute to a farmers organization with two members unticked → only the others get records, the history shows ONE row with `Date and Time` and expands to the right members all `Awaiting confirmation`; the 30-day-blocked member is disabled with its reason; filters (status, type, date range, member, agency) narrow the table and Clear restores it; remove one member from the expansion (the row count and statuses update, the removed member disappears) and remove the whole distribution (confirmation shows removed vs kept counts); sign in as a distributed-to farmer with an account: the assistance shows Awaiting confirmation (not received), confirming it works, and a removed one is not listed; staff screens still show per-record rows with `Date Given` and Edit; RSBSA import with duplicate numbers: the chooser shows the rows side by side, Commit is blocked until each group is decided, choosing one row commits exactly that row, rejecting all commits none.
- [ ] **Step 3: Cleanup** per the harness and report the live-database migration reminder (interventions 0019) to the user.

---

## Self-review notes

- Spec coverage: items 4 (Task 1-2), 3 (Task 2, 5), 2 and 5 (Tasks 1, 3, 4, 6), 6 (Tasks 3, 6), 1 (Task 7); all five Review Focus items have a named test or check.
- Plan decisions the spec left open and this plan fixes: `all_objects` / default-manager mechanism, group ids, `summary_status` rule, removal permissions (organization only its own, staff any), `member_ids` validation, the fixed response field `distribution_id`.
- Out of scope per the spec: grouped history on staff screens, editing distributions, un-removing, removal notifications, paging.
