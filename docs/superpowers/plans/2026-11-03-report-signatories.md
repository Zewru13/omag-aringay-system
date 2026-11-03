# Report Signatories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Admin keeps one saved list of report signers; every report picks Prepared / Checked / Noted / Approved by from it, and Print and Preview PDF carry those signers.

**Architecture:** A `reports.Signatory` table with an admin-only CRUD API and a Manage Signatories page (PR A). A `SignatoriesPanel` replaces the typing pop-up on the six reports and `build_signature_block` grows to four slots (PR B). Manual and Help text follow (PR C). Report URLs keep their current query parameters and only gain `approved_by` / `approved_role`.

**Tech Stack:** Django 5 + DRF + reportlab (`oma_aringay/reports`), React 18 / Vite / Tailwind v4 (`oma-frontend`), `node --test` for frontend tests.

**Spec:** `docs/superpowers/specs/2026-11-03-report-signatories-design.md`

## Global Constraints

- Branch each PR from `origin/master`, never stacked. PR A is branch `report-signatories` (already holds the spec commit); PR B and PR C get their own branches after the previous PR merges.
- Roles are exactly `prepared`, `checked`, `noted`, `approved`; labels "Prepared by", "Checked by", "Noted by", "Approved by".
- "Reviewed by" becomes "Checked by" on the PDF only; the URL parameters `reviewed_by` / `reviewed_role` stay and mean the Checked by slot.
- Slot order on the PDF is Prepared | Checked | Noted | Approved; empty slots are omitted; with neither Noted nor Approved chosen, the existing "Certified by: MUNICIPAL AGRICULTURIST" column stays.
- Read access: `IsAdminOrEvaluator`; write access: `IsAdmin`; farmers, fisherfolk and citizens get 403.
- Picks are sent as names (not ids), are not saved between visits, and Download Excel is unchanged.
- The Forecasting pages' own `YASignatureModal` copies are not touched.
- Live table needs `enable row level security` and the `django_migrations` row (user runs the SQL; verify read-only with `execute_sql`). Never test against live Supabase; tests use the throwaway stack with local storage and blank EMAIL creds.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Ask before pushing / opening each PR.

## Review Focus

1. An old report link carrying only `reviewed_by` / `noted_by` must still render (Task 3).
2. Four signers with long names and positions must still fit the 468pt portrait page and not raise (Task 3).
3. Names with `&`, `<`, `>` must print literally, not break reportlab markup (Task 3).
4. A blank or whitespace-only name, or an unknown role, must be refused by the API (Task 1).
5. A signer deactivated or deleted after the page loaded must not break a printout already picked: the URL carries names, not ids (Task 4).

---

## PR A: saved signatories, API and Manage Signatories page

### Task 1: `Signatory` model, migration and API

**Files:**
- Modify: `oma_aringay/reports/models.py`
- Create: `oma_aringay/reports/migrations/0001_signatory.py` (via `makemigrations reports`)
- Create: `oma_aringay/reports/signatories.py` (serializer + views)
- Modify: `oma_aringay/reports/urls.py`
- Test: `oma_aringay/reports/test_signatories.py`

**Interfaces:**
- Produces: model `reports.models.Signatory(name, position, role, sort_order, is_active)` with `ROLES = ('prepared', 'checked', 'noted', 'approved')` choices; `GET|POST /api/reports/signatories/`, `PUT|PATCH|DELETE /api/reports/signatories/<id>/`. Row JSON: `{id, name, position, role, sort_order, is_active}`.

- [ ] **Step 1: Write the failing tests** in `test_signatories.py` (APITestCase, users created like `test_org_assistance.py`: ADMIN, EVALUATOR, FARMER/CITIZEN). Assertions:
  - `test_evaluator_and_admin_can_list_only_active_rows_ordered_by_role_then_sort_order_then_name`
  - `test_all_flag_returns_inactive_rows_for_admin_but_is_ignored_for_evaluator`
  - `test_citizen_cannot_list` (403) and anonymous gets 401
  - `test_only_admin_can_create_edit_delete` (evaluator POST/PUT/DELETE → 403; admin → 201/200/204)
  - `test_blank_or_whitespace_name_is_refused` (400), `test_unknown_role_is_refused` (400), `test_name_is_trimmed_on_save`
  - `test_same_name_may_hold_two_roles`
- [ ] **Step 2: Run to verify failure.** Run: `python manage.py test reports.test_signatories` (throwaway-stack settings per working agreements). Expected: FAIL / import error for `Signatory`.
- [ ] **Step 3: Implement.** `Signatory` with `Meta.ordering = ['role', 'sort_order', 'name']`; `SignatorySerializer` (`name` trimmed, required non-blank; `position` optional); `SignatoryListCreate` (GET: `IsAdminOrEvaluator`, `?all=1` honoured only for ADMIN; POST: `IsAdmin`) and `SignatoryDetail` (`IsAdmin`); routes `signatories/` and `signatories/<int:pk>/` named `report-signatories` / `report-signatory-detail`. Role ordering in the list must follow the order prepared, checked, noted, approved (not alphabetical): order in Python or with a `Case/When`.
- [ ] **Step 4: Run tests, expect PASS;** also run `python manage.py makemigrations --check` after generating `0001_signatory.py`.
- [ ] **Step 5: Commit** `Report signatories: saved list of signers and its API`.

### Task 2: Manage Signatories page (Admin)

**Files:**
- Create: `oma-frontend/src/utils/signatories.js`, `oma-frontend/src/pages/Signatories/SignatoriesPage.jsx`
- Modify: `oma-frontend/src/App.jsx` (route `/signatories`, `ProtectedRoute allowedRoles={["ADMIN"]}`, next to `/backup`), `oma-frontend/src/components/Layout/Sidebar.jsx` (Admin group item `{ to: "/signatories", icon: PenLine, label: "Signatories" }` after Backup)
- Test: `oma-frontend/tests/signatories.test.mjs`

**Interfaces:**
- Produces in `utils/signatories.js`: `SIGNATORY_ROLES = [{ value: 'prepared', label: 'Prepared by' }, { value: 'checked', label: 'Checked by' }, { value: 'noted', label: 'Noted by' }, { value: 'approved', label: 'Approved by' }]`; `roleLabel(value: string): string`; `signatoryError(form: {name, role}): string` (empty string when valid; "Enter the name." / "Choose the signing role.").

- [ ] **Step 1: Write failing node tests** in `signatories.test.mjs`: role list order and labels; `roleLabel('checked') === 'Checked by'` and unknown value returns `''`; `signatoryError` for blank/whitespace name, missing role, valid form.
- [ ] **Step 2: Run** `npm test` in `oma-frontend`; expect the new file to fail (module missing).
- [ ] **Step 3: Implement `utils/signatories.js`.**
- [ ] **Step 4: Implement `SignatoriesPage.jsx`** following `BackupPage.jsx` / `HarvestUnitSettingsPage.jsx` patterns: `PageLayout` title "Manage Signatories"; table (Name, Position, Signing role, Order, Active as `StatusPill`); "Add Signatory" button; ⋮ row menu with Edit / Delete (`ConfirmDialog`); add/edit in `ModalShell` with Name, Position, Signing role, Order, Active; loads `GET /reports/signatories/?all=1`; empty state "No signatories yet. The Reports pages offer the names you add here."; errors via `useToast`.
- [ ] **Step 5: Run** `npm test`, `npm run lint`, `npm run build`; expect all green.
- [ ] **Step 6: Browser check** on the throwaway stack (desktop + 390px): add, edit, delete, inactive row, non-admin cannot open `/signatories`.
- [ ] **Step 7: Commit** `Admin: Manage Signatories page`.

### PR A hand-off: live SQL (not a numbered task)
- [ ] Give the user Postgres SQL for `reports_signatory` (id bigint identity PK, name varchar(150), position varchar(150), role varchar(20), sort_order integer check >= 0, is_active boolean), `enable row level security`, and `insert into django_migrations (app, name, applied) values ('reports', '0001_signatory', now())`. After the user runs it, verify read-only with `execute_sql` (columns, RLS on, migration row). Migrate-before-code rule applies: the table must exist before the backend deploys.

---

## PR B: four-role picker and four-slot PDF block (branch from master after PR A merges)

### Task 3: Four-slot signature block and `approved_*` parameters

**Files:**
- Modify: `oma_aringay/reports/pdf_utils.py` (`build_signature_block`), `oma_aringay/reports/views.py` (`_sig_params`; the `build_signature_block(` calls that pass `noted_by=` at ~1000, ~2327, ~2524, ~2753), `oma_aringay/reports/documents.py` (~154)
- Test: `oma_aringay/reports/test_signature_block.py`; update any test that pins "Reviewed by" (grep `Reviewed by` in `reports/test_*.py`)

**Interfaces:**
- `build_signature_block(..., approved_by=None, approved_role=None)` added after `noted_role`; labels "Checked by" (was "Reviewed by"), "Noted by", "Approved by".
- `_sig_params(request)` additionally returns `approved_by`, `approved_role` (blank → `None`).

- [ ] **Step 1: Write failing tests** (extract text from the built PDF the way `test_pdf_text_safety.py` does):
  - `test_prepared_only_keeps_the_certified_by_column` (fallback unchanged)
  - `test_checked_by_label_replaces_reviewed_by`
  - `test_all_four_signers_print_in_order_prepared_checked_noted_approved`
  - `test_approved_only_drops_the_certified_by_fallback`
  - `test_old_link_with_only_reviewed_by_and_noted_by_still_renders` (Review Focus 1)
  - `test_four_long_names_and_positions_do_not_raise` (Review Focus 2: 60-character names/positions)
  - `test_ampersand_and_angle_brackets_in_names_print_literally` (Review Focus 3: `R&D <Chief>`)
  - `test_report_endpoint_passes_approved_by_through` (one document endpoint, e.g. `/api/reports/registered/?format=pdf&approved_by=Ana+Cruz`)
- [ ] **Step 2: Run to verify failure** (`python manage.py test reports.test_signature_block`).
- [ ] **Step 3: Implement.** Generalise to a list of `(label, name, role)` slots, drop empty ones, equal column widths `(page_width - gaps) / n`; keep the existing 2-column look for 1-2 slots; names/roles still pass through `escape()`.
- [ ] **Step 4: Thread `approved_by` / `approved_role`** through `_sig_params` and every call site listed above.
- [ ] **Step 5: Run the whole `reports` test module** (`python manage.py test reports`); expect green (known environment errors elsewhere are listed in memory, not in `reports`).
- [ ] **Step 6: Commit** `Reports PDF: Checked by and Approved by slots`.

### Task 4: `SignatoriesPanel` on the six reports

**Files:**
- Modify: `oma-frontend/src/utils/signatories.js` (add helpers), `oma-frontend/src/utils/documentReport.js` (`withSignature`), `oma-frontend/src/pages/Reports/ReportParts.jsx` (remove `SignatureModal`, add `SignatoriesPanel`), `oma-frontend/src/pages/Reports/ReportsPage.jsx` (HarvestedCropTab, FisheriesProductionTab), `oma-frontend/src/pages/Reports/DocumentReport.jsx`
- Create: `oma-frontend/src/pages/Reports/useSignatories.js`
- Test: `oma-frontend/tests/signatories.test.mjs`, `oma-frontend/tests/documentReport.test.mjs` (update the existing `withSignature` check)

**Interfaces:**
- `signatureParams(selection: {prepared, checked, noted, approved}): Record<string,string>` where each pick is `null | { name, position }`; returns only set keys: `prepared_by`, `prepared_role`, `reviewed_by`, `reviewed_role`, `noted_by`, `noted_role`, `approved_by`, `approved_role` (empty position omitted).
- `meSignatory(user: { full_name?: string }): { name: string, position: '' } | null`
- `signatoryOptions(list, role): Array<{ name, position }>` (active rows of that role, list order).
- `useSignatories(): { list, selection, setPick(role, pick|null), params }` — loads `GET /reports/signatories/` once; `selection.prepared` starts as `meSignatory(user)`, the rest `null`; `params = signatureParams(selection)`.
- `<SignatoriesPanel signatories={useSignatories() result} />` renders the four labelled dropdowns ("Prepared by" offers "<full name> (me)" first, then its role's rows; the others offer "— None —" first) and the help text "Filled in from Manage Signatories. Change a line here for this printout only."
- `withSignature(query: string, params: Record<string,string>): string` — now merges `params` (the output of `signatureParams`) into the query.

- [ ] **Step 1: Write failing node tests:** `signatureParams` with nothing, with only "me", with all four picks, with an empty position (key omitted), with a name containing `&` (value survives `URLSearchParams` round trip); `signatoryOptions` filters by role and keeps order; `meSignatory` with and without `full_name`; update the `documentReport.test.mjs` `withSignature` case to the new signature; add `test: picks carry names, not ids` (Review Focus 5: `signatureParams` output contains no `id`).
- [ ] **Step 2: Run** `npm test`; expect failures.
- [ ] **Step 3: Implement** the helpers, the hook and `SignatoriesPanel` (existing `baseInputClasses`, `labelCls`; 2x2 grid on phones, four columns from `md`).
- [ ] **Step 4: Wire the six reports.** In each report: render `<SignatoriesPanel>` directly above `<ActionButtons>`; `handlePrint` and the PDF button both build the PDF URL with `params`; remove the pop-up state (`showSig`, `sigPurpose`, `SignatureModal`) for the PDF path; the Excel button downloads directly with no signature step. Delete `SignatureModal` once nothing imports it.
- [ ] **Step 5: Run** `npm test`, `npm run lint`, `npm run build`; expect green.
- [ ] **Step 6: Browser check** on the throwaway stack (desktop + 390px), all six reports: dropdowns fill from the Manage page, Print and Preview PDF show the picked signers, "None" picks vanish, deactivating a signer after load does not break an already-picked printout, evaluator account sees the panel, Excel still downloads.
- [ ] **Step 7: Commit** `Reports: pick the signers from the saved list`.

---

## PR C: User Manual and Help text (branch from master after PR B merges)

### Task 5: Manual and Help

**Files:**
- Modify: `oma-frontend/scripts/manual/parts/*.mjs` (admin spec: Signatories screen; staff report specs: Signatories block), `oma-frontend/src/pages/Manual/manualContent.js`, `oma-frontend/src/pages/Help/helpContent.js`, `oma-frontend/src/pages/Manual/manualScreens.js` (regenerated), `oma-frontend/public/manual/**` (new/retaken pictures)
- Test: `oma-frontend/tests/helpContent.test.mjs`

- [ ] **Step 1: Update failing text tests** in `helpContent.test.mjs` for the new Reports wording (signers picked on the page, Manage Signatories under Admin).
- [ ] **Step 2: Edit** `helpContent.js` and `manualContent.js` (Reports sections now describe the Signatories block; Admin section gains Manage Signatories; remove the old pop-up wording).
- [ ] **Step 3: Add specs and retake** the pictures for Manage Signatories and the Reports pages with `node scripts/manual/shoot.mjs <tokens>` (token lifetime set to hours; write the manifest with `JSON.stringify(manifest, null, 1)`).
- [ ] **Step 4: Run** `npm test`, `npm run lint`, `npm run build`.
- [ ] **Step 5: Commit** `Manual and Help: report signatories`.
