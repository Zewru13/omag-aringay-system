# Cycle D — Organization Member and Equipment Import: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff and an organization's own account can import members (already-registered people, by RSBSA number) and equipment into one organization from a file, with a preview that shows exactly what the confirm will do.

**Architecture:** One new backend module `associations/org_imports.py` holds both imports for both domains (a small per-domain config table), reuses `_resolve_and_assign_main`, `read_template_rows` and `run_import_atomically`; each row runs in its own savepoint and a dry run rolls everything back, so preview and confirm are the same code. The frontend reuses `ImportFileModal`, with its summary tiles and filter tabs made data-driven by a pure helper.

**Tech Stack:** Django 4.2 + DRF, openpyxl, React, Vite.

**Spec:** `docs/superpowers/specs/2026-10-07-organization-member-equipment-import-cycle-d-design.md`

## Global Constraints

- Endpoints, per domain `farmers` / `fisherfolk`, under `/api/organizations/<domain>/<int:pk>/`: `members/import/` (POST multipart `file`, `dry_run`), `members/import/template/` (GET), `equipment/import/` (POST), `equipment/import/template/` (GET). Permission `[IsAuthenticated, IsOwnOrgOrStaff]` with `org_linked_record_type` = `FARMERS_ORG` / `FISHERFOLK_ORG`. Unknown organization id → 404.
- Members headers (row 1 of the template): `RSBSA Number`, `Position`, `Date Joined (YYYY-MM-DD)`; note line starts `Valid positions:`; the template's sample row is the first data row. Equipment headers: `Equipment`, `Quantity`, `Condition`, `Acquisition Date (YYYY-MM-DD)`, `Remarks`; note line starts `Valid equipment:`. Header rows are found by `read_template_rows` (first column match), max 1000 rows (`ImportFileError` message from that function is returned as `{'error': ...}` 400).
- Member row statuses: `ready`, `already_member`, `not_found`, `needs_main_choice`, `duplicate_in_file`, `invalid`. Equipment row statuses: `ready`, `already_exists`, `duplicate_in_file`, `invalid`. Row shape `{row, status, label, detail}`; response `{created, errors, dry_run, summary, rows}`; `summary` has a count for every status of that import (zero included). Dry run changes nothing; a confirm is one transaction (IntegrityError → 409 via `run_import_atomically`).
- Member creation uses the same logic as the Add Member view: the domain's `*MemberSerializer` (`farmer`/`fisherfolk` id, `position`, `date_joined`), `serializer.save(organization=...)`, then `_resolve_and_assign_main(member, other_active_memberships, person.barangay, None)` (never an explicit main). `MainChoiceRequired` → `needs_main_choice`, and that row leaves no trace (its savepoint rolls back).
- Equipment creation uses the domain's `*EquipmentSerializer`. Unknown equipment name → `equipment_name='Other'`, `equipment_name_other=<typed text>`, detail `Recorded as Other: <text>`.
- Never test against Supabase; throwaway stack with the mail credentials blanked. Commit only when the user says so; no push.

## Review Focus

1. An RSBSA cell stored as a number or with trailing spaces / different case. (Task 1)
2. The same person on two rows with different positions: the first wins, the second is `duplicate_in_file`. (Task 1)
3. A person with an INACTIVE membership in this organization: `already_member`, not re-activated. (Task 1)
4. A `needs_main_choice` row leaves no membership and does not change any other membership's `is_main`. (Task 1)
5. A confirm after the data changed since the preview: the confirm's own result is the truth (a person added in between becomes `already_member`). (Task 1)

## Harness (Tasks 1-2 backend; Task 3 also browser)

Same recipe as cycles A-C: throwaway MariaDB on port 3307 (`mysql_install_db.exe --datadir=<scratch>\mdb`, `mysqld.exe --no-defaults --datadir=<scratch>\mdb --port=3307 --skip-grant-tables --standalone --bind-address=127.0.0.1`, database `oma_aringay_db` utf8mb4), `<scratch>\mysqlplain.py`, tests `DB_BACKEND=mysql PYTHONPATH=<scratch> ../.venv/Scripts/python.exe manage.py test <labels> --settings=mysqlplain --noinput`. Test fixtures: copy the pattern of `associations/test_own_org_scope.py` (`make_org`, `make_citizen`, `make_staff`, farmer and fisherfolk creation) and of `associations/test_org_activation.py` (`workbook(rows)` builder returning a `SimpleUploadedFile`; build the sheet with the template's header row first). Browser stack: `migrate`, `seed_org.py` + `seed_fix.py`, `runserver 127.0.0.1:8001 --settings=mysqlplain --noreload` started with `EMAIL_HOST_USER= EMAIL_HOST_PASSWORD=` (confirm `settings.SMTP_CONFIGURED` is False), `VITE_API_URL=http://127.0.0.1:8001/api npx vite --port 5174 --strictPort`; set `localStorage.accessToken` and a placeholder `refreshToken` (tokens in `org_tokens.json`, including the organization accounts). Cleanup at the end: clear browser storage, stop the three processes, delete scratch `mdb`, test media, token file.

## File Structure

- Backend new: `associations/org_imports.py`; tests `associations/test_member_import.py`, `associations/test_equipment_import.py`.
- Backend modified: `associations/urls.py` (eight routes).
- Frontend new: `utils/importSummary.js`. Modified: `components/ImportFileModal.jsx`, `pages/Organizations/OrganizationDetailPage.jsx`.

---

### Task 1: Members import (backend, both domains)

**Files:**
- Create: `oma_aringay/associations/org_imports.py`
- Modify: `oma_aringay/associations/urls.py`
- Test: `oma_aringay/associations/test_member_import.py` (new)

**Interfaces:**
- Produces in `org_imports.py`: a domain config table `DOMAINS['farmers'|'fisherfolk']` (organization model, member model, member serializer, person model, person FK name, `org_linked_record_type`, equipment model and serializer, equipment-name choices); `parse_import_date(raw) -> date | None` (blank → None; Excel datetime/date cells and `YYYY-MM-DD` text; anything else raises `ValueError('Invalid date "<raw>". Use YYYY-MM-DD.')`); `run_member_import(domain, organization, file, dry_run) -> Response`; view classes `MemberImportView` and `MemberImportTemplateView` (class attribute `domain`, plus `org_linked_record_type`), instantiated per domain in `urls.py` via `.as_view(domain='farmers')` style or small subclasses.
- Consumes (existing): `associations.views._resolve_and_assign_main`, `MainChoiceRequired`, `core.utils.read_template_rows`, `ImportFileError`, `cell_text`, `run_import_atomically`.

- [ ] **Step 1: Write the failing tests** (`APITestCase`, parametrised over both domains with a `for domain in DOMAINS` loop like `test_org_dates.py`): template download returns an xlsx whose row 1 equals the three headers and whose note line starts `Valid positions:`; a file with two ready rows (positions `President` and blank) creates two memberships, the first-ever membership of each person is main, response `created == 2`, rows `ready`; the position matches case-insensitively and an unknown position is `invalid` with the list of valid positions in `detail`; a missing date, an unparseable date and a future date are `invalid`; an unknown RSBSA number is `not_found` with the "Register them first" detail; the RSBSA matches with surrounding spaces, lower/upper case and as a numeric-looking cell (Review Focus 1: build the cell as `str` with spaces and a case change); the same person twice → first `ready`, second `duplicate_in_file` (Review Focus 2: different positions, first position stored); an existing ACTIVE membership and an existing INACTIVE membership are both `already_member` and the inactive one stays inactive (Review Focus 3); a row for a person who has another active membership with no main and a barangay mismatch is `needs_main_choice`, no membership is created and the person's other membership keeps its `is_main` (Review Focus 4), while the other rows in the same file import; the dry run creates nothing and its statuses equal the confirm's statuses for the same file; a person added by another request between a preview and the confirm becomes `already_member` in the confirm (Review Focus 5); a wrong header file → 400 `error`; a 1001-row file → 400; an unexpected `IntegrityError` (patch `FarmersOrganizationMemberSerializer.save` for the second row) → 409 and no membership at all; permissions: staff → 200 for any organization; the organization account → 200 for itself and 403/404 for another organization of its own domain and for the other domain's route; a farmer citizen account → 403; anonymous → 401. For fisherfolk use `FisherfolkOrganizationMember` and Fisherfolk fixtures.
- [ ] **Step 2: Run** `manage.py test associations.test_member_import`. Expected: FAIL (module / routes missing).
- [ ] **Step 3: Implement** `org_imports.py` members half and the four member routes in `urls.py`. Row loop: one outer `transaction.atomic()` (inside `run_import_atomically`), each row in `with transaction.atomic():` (a raised `MainChoiceRequired` or serializer error leaves the savepoint rolled back; catch it outside the inner block), in a dry run call `transaction.set_rollback(True)` after the loop; counts come from the statuses actually produced. Labels: `<full name> (<RSBSA>)` when matched, else the raw RSBSA cell.
- [ ] **Step 4: Run** the module. Expected: PASS. **Mutation check:** remove the savepoint around the row (so a main-choice failure would leave the membership) and confirm the Review Focus 4 test fails; restore, ledger it.
- [ ] **Step 5: Run the whole suite.** Expected: OK.

---

### Task 2: Equipment import (backend, both domains)

**Files:**
- Modify: `oma_aringay/associations/org_imports.py`, `oma_aringay/associations/urls.py`
- Test: `oma_aringay/associations/test_equipment_import.py` (new)

**Interfaces:**
- Consumes (Task 1): the `DOMAINS` table, `parse_import_date`, the response shape.
- Produces: `run_equipment_import(domain, organization, file, dry_run) -> Response`; `EquipmentImportView`, `EquipmentImportTemplateView` (same pattern as the member views); four routes.

- [ ] **Step 1: Write the failing tests** (both domains): template headers and `Valid equipment:` note listing the domain's names; list match is case- and space-insensitive (`hand  tractor` → `Hand Tractor`); an unknown name `Water Buffalo` → stored as `Other` with `equipment_name_other='Water Buffalo'` and detail `Recorded as Other: Water Buffalo`; the name `Other` with no text → `invalid`; blank name → `invalid`; quantity `2.0` (float cell) → 2, `0`, `1.5` and `abc` → `invalid`; bad condition → `invalid`; future acquisition date → `invalid`; blank date OK; an identical stored row (same name, other-text, condition, quantity, date) → `already_exists` and not duplicated; the same row twice in the file → second is `duplicate_in_file`; the same name with a different quantity is `ready`; dry run changes nothing and predicts the same statuses; the same permission matrix as the members tests; an `IntegrityError` → 409 and nothing saved.
- [ ] **Step 2: Run** the module. Expected: FAIL.
- [ ] **Step 3: Implement** the equipment half: rows through the domain's `*EquipmentSerializer` (`serializer.is_valid()` errors become `invalid` with the first message), duplicate key `(normalized name, normalized other text, condition, quantity, acquisition_date)`, per-row savepoints, dry-run rollback as in Task 1, and the template builder (shared with Task 1: `_template_response(filename, headers, widths, sample_row, note)`).
- [ ] **Step 4: Run** the module. Expected: PASS. **Mutation check:** drop the stored-row duplicate comparison and confirm the `already_exists` test fails; restore, ledger it.
- [ ] **Step 5: Run the whole suite and `makemigrations --check`.** Expected: OK, no changes.

---

### Task 3: Frontend (modal summary, buttons) and browser check

**Files:**
- Create: `oma-frontend/src/utils/importSummary.js`
- Modify: `oma-frontend/src/components/ImportFileModal.jsx`, `oma-frontend/src/pages/Organizations/OrganizationDetailPage.jsx`
- Test: `check_importsummary.mjs` in the scratchpad (node script, same style as `check_guards.mjs`).

**Interfaces:**
- Produces: `summaryTiles(summary, step) -> [{label, value}]` and `filterTabs(summary, rowCount, statusLabels) -> [{key, label}]` and `STATUS_META` (`{ status: { tone, preview, done } }`) in `utils/importSummary.js`. For a summary that has `duplicate_in_database` (the existing imports) the output must equal today's exactly (four tiles: Ready/Created, Duplicate in File, Already Exists, Invalid Rows; tabs All, ready, In-File Dupe, Already Exists, Invalid, with zero-count tabs dropped); for the new summaries the tiles/tabs are built from the keys present (`ready`, `already_member`/`already_exists`, `duplicate_in_file`, `not_found`, `needs_main_choice`, `invalid`) in that order, dropping zero tabs.
- Consumes (Tasks 1-2): the endpoints and the row statuses above.

- [ ] **Step 1: Write the failing check script** `check_importsummary.mjs`: the legacy summary `{ready:3,duplicate_in_file:1,duplicate_in_database:0,invalid:2}` gives exactly the four legacy tiles (labels `Ready to Create`/`Created`, `Duplicate in File`, `Already Exists`, `Invalid Rows`) and the legacy tab labels (zero tabs dropped, `All <n>` first); a members summary with `already_member:2, not_found:1, needs_main_choice:1` gives tiles and tabs for exactly those statuses plus ready/invalid, with preview/done labels (`Will Create`/`Created`, `Already a Member`, `Not Found`, `Needs Main Choice`); an equipment summary uses `Already Exists` for `already_exists`; unknown extra keys are ignored; an empty summary gives only the All tab.
- [ ] **Step 2: Run** `node check_importsummary.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `importSummary.js`; in `ImportFileModal.jsx` replace the hard-coded `STATUS_TONE`/labels/tiles/tabs with the helper (the existing look must not change for the existing imports); in `OrganizationDetailPage.jsx` add an "Import Members" button beside "Add Member" and an "Import Equipment" button beside "Add Equipment" (same `canManage` gate, secondary/outline style next to the existing green button), state `showImportMembers` / `showImportEquipment`, and `<ImportFileModal title subtitle importUrl={`/organizations/${type}/${id}/members/import/`} templateUrl={`.../members/import/template/`} templateFilename helpText onClose onImported={handleMemberAdded}>` (equipment likewise with `handleEquipmentAdded`).
- [ ] **Step 4: Run** the check script. Expected: PASS. **Lint and build:** per-file eslint compared with HEAD (scratch `lintcmp.sh`), `vite build`.
- [ ] **Step 5: Browser check on the throwaway stack:** as admin on an organization's detail page: download the members template, import a file (CSV is accepted) with a ready row, an unknown RSBSA number and an already-member row; the preview shows the three statuses with the right labels and tiles, confirm creates one membership and the member list reloads; the same for equipment (one ready row, one unknown-name row recorded as Other, one repeated row); then as the organization's own account on `/my-organization`: the buttons are present and an import works; the existing Organization import and one assistance import still show the old tiles and tabs. Run the whole backend suite one last time.

---

## Self-review notes

- Spec coverage: decisions 1-2 (Task 1), 3 (Task 2), 4 (Task 3); all five Review Focus items have a named test or step in Task 1.
- The summary helper keeps the legacy modal output byte-identical for the four existing imports; the node check pins that.
- Out of scope per the spec: registering unknown people, main status from the file, officers, removal by file, multi-organization files, equipment updates.
