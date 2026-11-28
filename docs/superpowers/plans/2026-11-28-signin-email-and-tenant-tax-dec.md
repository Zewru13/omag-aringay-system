# Sign-in Email and No Tax Dec for Tenant / Lessee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the office's email on the sign-in page, and stop asking for, saving and showing a Tax Dec number on Tenant and Lessee parcels.

**Architecture:** The website hides the field and leaves it out of what it sends. The server enforces the same rule: a new tenant / lessee parcel
has no Tax Dec, and an edit of one never changes the stored number.

**Tech Stack:** Django REST framework; React; `node --test` through `npm test`.

**Spec:** `docs/superpowers/specs/2026-11-28-six-item-forms-and-templates-design.md` (items 3 and 4)

## Global Constraints

- Email, exactly: `agriculture2503aringay@gmail.com`. Only this one on the sign-in page.
- "Tenant" and "Lessee" are the two tenure values (`isTenure` on the website, `FarmParcel.LandOwnership` on the server).
- A Tax Dec number already saved is never deleted, cleared or overwritten.
- No database change. No Help text or picture changes (step 6 of the spec).
- Tests only on the throwaway MariaDB (port 3307), never live; mail settings blank.
- No commit, push or merge until the user says so.

## Review Focus

- A row typed as Owner with a half-typed number and then switched to Tenant must save, not be blocked by the hidden box (Task 2).
- Editing a tenant parcel that has a saved number keeps that number (Tasks 1 and 2).
- Clearing the parcel number of such a parcel must not be refused because of the hidden number (Task 1).
- Switching such a parcel back to Owner shows the saved number again (Task 2: `parcelToForm` keeps it).
- The email must not make a 390 px wide sign-in page scroll sideways (Task 4 browser check).

---

### Task 1: The server rule

**Files:**
- Modify: `oma_aringay/farmers/serializers.py` (`FarmParcelSerializer.validate`)
- Modify: `oma_aringay/farmers/parcel_import.py` (`parse_parcel_cells`, `parcel_note`)
- Test: Create `oma_aringay/farmers/test_tenant_tax_dec.py`

**Interfaces:**
- Produces: a created Tenant / Lessee parcel has `tax_declaration_number == ''`; a PATCH of one never changes the stored value.

- [ ] **Step 1: Failing tests** (API level, staff user): for both Tenant and Lessee —
  `test_a_new_tenant_parcel_is_saved_without_a_tax_dec` (POST bulk with a number → stored `''`);
  `test_a_new_owner_parcel_keeps_its_tax_dec`;
  `test_editing_a_tenant_parcel_never_changes_the_saved_number` (PATCH with `''`, and with another number → unchanged);
  `test_the_hidden_number_does_not_make_the_parcel_number_required` (PATCH `parcel_number: ''` on a tenant parcel with a saved number → 200);
  `test_an_owner_parcel_still_needs_its_number_with_a_tax_dec` (→ 400);
  `test_a_parcel_switched_to_tenant_keeps_the_saved_number`;
  `test_an_import_ignores_the_tax_dec_of_a_tenant_row` (profile import: a tenant row with a malformed number is `ready` and saved with `''`).
- [ ] **Step 2:** Run `farmers.test_tenant_tax_dec`. Expected: the tenant tests FAIL (number kept / 400), the owner tests pass.
- [ ] **Step 3:** In `validate`, work out the ownership the saved parcel will have (`data` else `instance`). When it is tenure: a new parcel gets `''`; an edit pops `tax_declaration_number`; the parcel-number rule is skipped. In `parse_parcel_cells`, pass `''` for tenure rows. In `parcel_note`, add `Tax Dec Number is for Owner parcels only (ignored for a Tenant or Lessee).`
- [ ] **Step 4:** Run `farmers` and `core.test_import_templates`. Expected: all pass.

### Task 2: The website hides it

**Files:**
- Modify: `oma-frontend/src/pages/Farmers/parcelRows.js` (`rowProblem`, `parcelPayload`, `editPayload`)
- Modify: `oma-frontend/src/pages/CropInformation/ParcelDetailsStep.jsx`, `oma-frontend/src/pages/Farmers/EditParcelModal.jsx` (no Tax Dec row when `isTenure`)
- Modify: `oma-frontend/src/pages/CropInformation/parcelWizard.js` (`reviewRows`: `taxDec` is `''` for tenure), `ParcelReviewStep.jsx` (no line when `''`)
- Modify: `oma-frontend/src/pages/Monitoring/ParcelViewModal.jsx`, `oma-frontend/src/pages/Monitoring/listReports.js` (`parcelReport`)
- Test: `oma-frontend/tests/parcelRows.test.mjs`, `parcelWizard.test.mjs`, `listReports.test.mjs`

**Interfaces:**
- Produces: `parcelPayload(...)` sends `tax_declaration_number: ''` for tenure; `editPayload(...)` has no `tax_declaration_number` key for tenure.

- [ ] **Step 1: Failing tests:** for Tenant and Lessee: `rowProblem` is `''` with `tax_declaration_number: '01-002'`, and with a full number and no parcel number it says nothing about the tax dec; `parcelPayload(...).tax_declaration_number === ''`; `'tax_declaration_number' in editPayload(...)` is false (and true for Owner); `reviewRows(...)[0].taxDec === ''`; `parcelReport` has no `Tax Declaration Number` line (an Owner parcel still has it). Source checks: both forms render the `Tax Dec No.` cell only under `!isTenure(` / `!tenure`; `ParcelViewModal` leaves the row out for tenure.
- [ ] **Step 2:** Run `npm test`. Expected: those assertions FAIL.
- [ ] **Step 3:** Make them pass.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.

### Task 3: The email on the sign-in page

**Files:**
- Modify: `oma-frontend/src/constants/appInfo.js` (add `OFFICE_SIGN_IN_EMAIL`; `OFFICE_CONTACT.emails[0]` uses it), `oma-frontend/src/pages/Login/LoginPage.jsx`
- Test: `oma-frontend/tests/appInfo.test.mjs`

- [ ] **Step 1: Failing test:** `OFFICE_SIGN_IN_EMAIL === 'agriculture2503aringay@gmail.com'`; `OFFICE_CONTACT.emails` still lists both; `LoginPage.jsx` links `mailto:` with `OFFICE_SIGN_IN_EMAIL` and does not mention `lgu_aringay`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Under the "No account yet…" paragraph, a line `Email the office: <address>` as a `mailto:` link, `break-all` so it cannot widen a phone.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.

### Task 4: Proof

- [ ] **Step 1:** `npm test`, `npm run build`, eslint on the changed files compared with master. Full backend suite on the throwaway MariaDB; compare errors with the known baseline.
- [ ] **Step 2:** Throwaway stack, real browser: sign-in page at 1280 and 390 wide (email visible, `mailto:` link, no sideways scroll); Add Farm Parcels and Edit Parcel as Owner then Tenant then Lessee; save a Tenant parcel; edit a tenant parcel that has a saved number and read the database to see it is unchanged; the parcel view and printed report of both kinds. No console errors. Shut the stack down.
