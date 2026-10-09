# Cycle F — Organization Profile Changes Need Admin and Focal Person Approval: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An organization can request changes to its email address and contact person (besides name, barangay and street address); every reviewed organization change needs one Admin approval AND one Focal Person approval before it is written to the record.

**Architecture:** `ProfileChangeRequest` gains `requires_both` and per-role approval columns; the existing decision view records the caller's role approval, applies the change only when both exist (row-locked, one transaction) and notifies the right people; the two new fields join `REQUESTABLE_FIELDS` with their own validation. The organization page and the staff dashboard card show who has approved.

**Tech Stack:** Django 4.2 + DRF, React, Vite.

**Spec:** `docs/superpowers/specs/2026-10-07-organization-profile-consent-cycle-f-design.md`

## Global Constraints

- Two approvals apply ONLY to requests filed by organization accounts (`FARMERS_ORG`, `FISHERFOLK_ORG`): created with `requires_both=True`. Farmer/fisherfolk requests and every existing row: `requires_both=False`, unchanged one-approval behaviour.
- Roles: Admin = `User.Roles.ADMIN`, Focal Person = `User.Roles.EVALUATOR`. A user never counts for both. Approving twice as the same role → 400 `The Admin already approved this request.` / `The Focal Person already approved this request.`
- First approval: writes nothing, request stays `PENDING`. Second approval (other role): applies the value (`update_fields`), sets `APPROVED`, `reviewed_by` = the second approver, `reviewed_at`, all in one transaction after a row-locked re-read of the request; if the record already holds the requested value it is approved without a write. Reject by either role at any time → `REJECTED` (reason truncated to 255 as today), nothing written.
- Serializer additions (read-only): `requires_both`, `admin_approved_by_name`, `admin_approved_at`, `focal_approved_by_name`, `focal_approved_at`, `awaiting` (list of `'ADMIN'` / `'EVALUATOR'`; `[]` when not pending or when not `requires_both`).
- New requestable fields for both organization record types: `email_address` (trimmed, valid email, not empty, max 254, "already the current value" compared case-insensitively) and `contact_person` (trimmed, not empty, max 150). `FIELD_LABELS` gains `email address`, `contact person`. Registration number, agency, dates stay staff-only.
- Notification wording (via `notify_user` / `notify_staff`): first approval → requester: `approved your profile change` with detail `<field> approved by the <Admin|Focal Person>; waiting for the <other role>`; other role's staff: `needs your approval` (verb) with the request detail; second approval → requester: the existing `approved your profile change` text.
- Never test against Supabase; throwaway stack with the mail credentials blanked (`EMAIL_HOST_USER= EMAIL_HOST_PASSWORD=`; confirm `settings.SMTP_CONFIGURED` is False). Commit only when the user says so; no push.

## Review Focus

1. An Admin who approved and is later deactivated or replaced: the approval still counts for the second approval. (Task 2)
2. A user whose role changes between the two approvals: the stored approval stays, the new role can still approve as that role. (Task 2)
3. Two pending requests for different fields of the same organization approved in opposite orders. (Task 2)
4. An email change to an address already used by another organization or a staff user is allowed. (Task 1)
5. Rejecting an already-approved-once request twice: the second reject is refused (already rejected). (Task 2)

## Harness (Tasks 1-2 backend; Task 3 also browser)

Same recipe as cycles A-E: throwaway MariaDB on port 3307 (`mysql_install_db.exe --datadir=<scratch>\mdb`, `mysqld.exe --no-defaults --datadir=<scratch>\mdb --port=3307 --skip-grant-tables --standalone --bind-address=127.0.0.1`, database `oma_aringay_db` utf8mb4), `<scratch>\mysqlplain.py`, tests `DB_BACKEND=mysql PYTHONPATH=<scratch> ../.venv/Scripts/python.exe manage.py test <labels> --settings=mysqlplain --noinput`. Fixtures: copy `make_org`, `make_citizen`, `make_staff` from `associations/test_own_org_scope.py` (organization accounts linked with `UserLinkedRecord`), a Farmer citizen as in `production/test_farmer_scope.py` for the control case; Admin and Focal Person users via `create_user(role='ADMIN'/'EVALUATOR')`. Endpoints: `POST /api/profile/change-requests/` `{field_name, requested_value}` (organization account), `GET /api/staff/change-requests/?status=ALL`, `POST /api/staff/change-requests/<id>/approve|reject/`. There are no existing tests for this module: the new test file also pins the unchanged behaviour. Browser stack: `migrate`, `seed_org.py` + `seed_fix.py` (admin, evaluator, farmer, fisherfolk, organizations; tokens in `org_tokens.json`), `runserver 127.0.0.1:8001 --settings=mysqlplain --noreload` with the mail credentials blanked, `VITE_API_URL=http://127.0.0.1:8001/api npx vite --port 5174 --strictPort`; set `localStorage.accessToken` and a placeholder `refreshToken`. Cleanup at the end: clear browser storage, stop the three processes, delete scratch `mdb`, test media, token file.

## File Structure

- Backend modified: `core/models.py` (`ProfileChangeRequest`), `core/profile_self_service.py`; new migration `core/migrations/0006_profilechangerequest_approvals.py`.
- Backend new test: `core/test_profile_consent.py`.
- Frontend new: `utils/approvalStatus.js`. Modified: `pages/Citizen/OrgAccountPages.jsx`, `pages/Dashboard/StaffDashboard.jsx`.

---

### Task 1: Model columns, new requestable fields, request creation (backend)

**Files:**
- Modify: `oma_aringay/core/models.py`, `oma_aringay/core/profile_self_service.py`
- Create: `oma_aringay/core/migrations/0006_profilechangerequest_approvals.py` (via `makemigrations core -n profilechangerequest_approvals`)
- Test: `oma_aringay/core/test_profile_consent.py` (new)

**Interfaces:**
- Produces: `ProfileChangeRequest.requires_both` (BooleanField, default False), `admin_approved_by`, `focal_approved_by` (FK to AUTH_USER_MODEL, null, SET_NULL, related_name `+`), `admin_approved_at`, `focal_approved_at` (DateTimeField null); method `ProfileChangeRequest.awaiting() -> list[str]`; `REQUESTABLE_FIELDS` for the two organization types extended; `ProfileChangeRequestSerializer` additions (Global Constraints); `ProfileChangeRequestCreateSerializer.validate` handling `email_address` and `contact_person`; request creation sets `requires_both` from the record type.

- [ ] **Step 1: Write the failing tests** (`APITestCase`): an organization account (both domains) filing `email_address` and `contact_person` requests → 201, row `requires_both=True`, `awaiting == ['ADMIN', 'EVALUATOR']` in the response (assert as a set), `status PENDING`; a farmer account filing a `barangay` request → `requires_both=False`, `awaiting == []`; email rules: valid accepted, `not-an-email` refused on `requested_value`, blank refused, 255 characters refused, the same address with different case refused as "already the current value", an address already used by another organization and by a staff user accepted (Review Focus 4); contact person: blank refused, 151 characters refused, unchanged refused; `registration_number`, `registration_agency`, `date_organized` refused as not requestable; a duplicate pending request for the same field still returns the existing `already_pending` error; the history (`GET /profile/change-requests/`) returns the new serializer fields; an old row created with `requires_both=False` serializes with `awaiting == []`.
- [ ] **Step 2: Run** `manage.py test core.test_profile_consent`. Expected: FAIL.
- [ ] **Step 3: Implement** the columns and migration (additive only), `awaiting()` (`[]` unless `requires_both` and `status == PENDING`; otherwise the roles without an approval, order `ADMIN`, `EVALUATOR`), the field validators, FIELD_LABELS, the create step setting `requires_both=rtype in (FARMERS_ORG, FISHERFOLK_ORG)`, the serializer fields (`admin_approved_by_name` from `full_name or username`).
- [ ] **Step 4: Run** the module. Expected: PASS. **Mutation check:** make `requires_both` always False and confirm the organization test fails; restore; ledger it.
- [ ] **Step 5: Run the whole suite and `makemigrations --check`.** Expected: OK, no changes.

---

### Task 2: Two-approval decision flow (backend)

**Files:**
- Modify: `oma_aringay/core/profile_self_service.py` (`StaffChangeRequestDecisionView`)
- Test: `oma_aringay/core/test_profile_consent.py` (extend)

**Interfaces:**
- Consumes (Task 1): the columns, `awaiting()`, the serializer.
- Produces: `core.profile_self_service._lock_request(pk) -> ProfileChangeRequest | None` (`select_for_update().filter(pk=pk).first()`), used by the decision view inside its transaction; the two-approval behaviour of `POST /staff/change-requests/<pk>/approve|reject/` per Global Constraints.

- [ ] **Step 1: Write the failing tests** (organization `email_address` request filed by the org account; staff clients via `force_authenticate`): Admin approves → 200, `awaiting == ['EVALUATOR']`, status `PENDING`, `admin_approved_by_name` set, the organization's email unchanged, requester notified with the "waiting for the Focal Person" detail and the Focal Person staff notified (assert `Notification` rows by recipient and verb); then the Focal Person approves → `APPROVED`, record email changed, `reviewed_by` = the Focal Person, requester notified; the same in the other order; the same role approving twice → 400 with the role-specific message and no state change; Admin cannot approve as Focal Person (a single user with role ADMIN never fills the focal slot); reject by the Focal Person after the Admin approved → `REJECTED`, reason stored, record untouched, requester notified; rejecting an already rejected request → 400 "already rejected" (Review Focus 5); approving after rejection → 400; a farmer's request (`requires_both=False`) completes on ONE Admin or ONE Focal approval exactly as before (status `APPROVED`, record written); an old organization row with `requires_both=False` completes on one approval; Review Focus 1: the first approver (an Admin) is deactivated (`is_active=False`) and a new Admin created, the Focal Person's approval still completes the request and `admin_approved_by_name` is kept; Review Focus 2: change the first approver's role from ADMIN to EVALUATOR after approving, then the Admin (a different user) can still not be required again — the request needs a Focal approval and the former Admin (now EVALUATOR) approving counts as the Focal approval; Review Focus 3: two pending requests (email, contact person) for one organization, approved in opposite orders by the two roles, both end `APPROVED` with their own values; the race: patch `core.profile_self_service._lock_request` with a side effect that flips the stored request to `APPROVED` before delegating to the real function → the view answers 400 "already approved" and writes nothing; the record already holds the requested value at the second approval → `APPROVED` without error; approving a request whose record was deleted → 400 as today; a non-staff caller → 403.
- [ ] **Step 2: Run** the new tests. Expected: FAIL (single approval applies the change).
- [ ] **Step 3: Implement** the decision view: resolve the request, then inside `transaction.atomic()` re-read it with `_lock_request`, re-check `PENDING`, and for a `requires_both` approve: refuse a repeat from the same role, record the role's approval (`admin_approved_by/at` or `focal_approved_by/at`), and when both are present apply the value, set `APPROVED`/`reviewed_by`/`reviewed_at`; otherwise commit the partial approval; reject path unchanged but also under the lock; notifications after the transaction as in Global Constraints (`notify_user` for the requester, `notify_staff` for the other role — implement the "other role" targeting with a small helper that filters active users of that role, excluding the actor). Keep the one-approval path exactly as it is for `requires_both=False`.
- [ ] **Step 4: Run** the module. Expected: PASS. **Mutation check:** apply the change on the first approval and confirm the "record unchanged after the first approval" test fails; restore; ledger it.
- [ ] **Step 5: Run the whole suite.** Expected: OK.

---

### Task 3: Frontend (organization page, staff dashboard) and browser check

**Files:**
- Create: `oma-frontend/src/utils/approvalStatus.js`
- Modify: `oma-frontend/src/pages/Citizen/OrgAccountPages.jsx`, `oma-frontend/src/pages/Dashboard/StaffDashboard.jsx`
- Test: `check_approvalstatus.mjs` in the scratchpad (node script, same style as `check_guards.mjs`).

**Interfaces:**
- Consumes (backend): request objects with `requires_both`, `admin_approved_by_name`, `admin_approved_at`, `focal_approved_by_name`, `focal_approved_at`, `awaiting`, `status`.
- Produces: `utils/approvalStatus.js`: `approvalLines(request) -> [{ role: 'Admin' | 'Focal Person', done: boolean, by: string, at: string | null }]` (empty for a request that does not require both) and `waitingText(request) -> string` (`'Waiting for approval from the Admin and the Focal Person'`, `'Waiting for approval from the Focal Person'`, `'Waiting for approval from the Admin'`, or `'Pending review'` for a single-approval request) and `hasApproved(request, role) -> boolean` where `role` is `'ADMIN'` or `'EVALUATOR'` (false for requests that do not require both).

- [ ] **Step 1: Write the failing check script** `check_approvalstatus.mjs`: a `requires_both` request with nothing approved → two lines both not done and `waitingText` for both; Admin approved → Admin line done with name and date, `waitingText` names the Focal Person only; both approved (approved status) → no waiting text change needed (`waitingText` returns `'Pending review'` for non-pending is not required; assert lines both done); a plain request (`requires_both` false) → `approvalLines` `[]` and `waitingText` `'Pending review'`; `hasApproved` per role incl. false for plain requests and for unknown roles; missing fields tolerated.
- [ ] **Step 2: Run** `node check_approvalstatus.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the helper. In `OrgAccountPages.jsx`: add `email_address` (label `Email address`) and `contact_person` (label `Contact person`) to `REQUESTABLE`, remove them from the read-only rows if they are listed there, use `EmailInput` for the email draft, show `waitingText` and the approval lines in the pending badge area and in the history cards, keep rejection reasons. In `StaffDashboard.jsx`: render `approvalLines` under each request that requires both ("Admin ✓ Name · Focal Person pending"), read the user's role from `useAuth()` and disable Approve (title `You already approved this`) when `hasApproved(r, user.role)`, keep Reject enabled; format `field_name` labels for the two new fields.
- [ ] **Step 4: Run** the check script. Expected: PASS. **Lint and build:** per-file eslint compared with HEAD (scratch `lintcmp.sh`) and `vite build`.
- [ ] **Step 5: Browser check on the throwaway stack:** as the organization account request an email change; as the Admin open the dashboard card (it shows both roles pending), approve (the card shows Admin ✓ and Approve is disabled for the Admin, the record's email unchanged); as the Focal Person approve (the request disappears from the queue, the record shows the new email); then a contact-person request rejected by the Admin with the reason visible on the organization page; the organization page shows the waiting text and the per-role lines while pending. Run the whole backend suite one last time.

---

## Self-review notes

- Spec coverage: decisions 1-2 (Tasks 1-2), 3-4 (Task 3); all five Review Focus items have a named test in Tasks 1-2.
- The existing one-approval behaviour (farmers, fisherfolk, old rows) is pinned by new tests because the module had none.
- Out of scope per the spec: two-approval review for farmers and fisherfolk, other organization fields, delegated approvers, time limits.
