# Saved "Other" Variety and Seed Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A variety or seed source typed as "Other" is saved to Crop Settings and appears in the dropdowns; Edit Crop uses the same lists.

**Architecture:** `CropMonitoringRecordSerializer.create` / `update` is the one place every crop record is saved through (Add Crop, the bulk
form, Add Farm Parcels with its crop file import, Edit Crop), so the rule lives there, in `production/remembered_choices.py`.

**Spec:** `docs/superpowers/specs/2026-11-28-six-item-forms-and-templates-design.md` (item 5)

## Global Constraints

- Names are the same when `production.naming.normalize_name` says so; the existing entry and its spelling are used, never a duplicate.
- A variety is added under the crop of the record; one listed for every crop counts as existing.
- A typed seed source is stored on the record by its name (`seed_source`), with `seed_source_other_specify` emptied.
- On an edit, only a value that **changes** is added. Old values stay as they are.
- Not added: blank, or a name that is only `other`, `others`, `na`, `none`, `nil` once normalized. A seed source over 100 characters
  (the record's column) stays `Other` + text.
- A deactivated entry is neither duplicated nor reactivated.
- Nothing is added when the save is refused (all or nothing with the record).
- No database change. No Help text or pictures (spec step 6). Throwaway MariaDB only. No commit until the user says so.
- Out of scope: the farm parcel spreadsheet's "declared crops" (`FarmCrop`), which use their own fixed seed list.

## Review Focus

- Editing the area of an old crop must not push its old typed values into the lists (Task 1 test).
- Two rows of one form with the same new variety make one entry (Task 1 test).
- A refused form (one bad row) leaves the lists unchanged (Task 1 test).
- A 101+ character seed source must not crash the save (Task 1 test).
- Edit Crop must keep showing a record's current value even when it is not in the list (Task 2 test + browser).

---

### Task 1: The server remembers

**Files:** Create `oma_aringay/production/remembered_choices.py`, `production/test_remembered_choices.py`; Modify `production/serializers.py`.

**Interfaces:**
- Produces: `remember_crop_choices(data: dict, instance=None) -> None` (changes `data` in place: the spelling to store).

- [ ] **Step 1: Failing tests** through the API (single add, bulk add, Add Farm Parcels bulk, PATCH), one per Global Constraint.
- [ ] **Step 2:** Run `production.test_remembered_choices`. Expected: the "added" and "existing spelling" tests FAIL.
- [ ] **Step 3:** Write the module; call it from the serializer's `create` and `update`, inside `transaction.atomic()`.
- [ ] **Step 4:** Run `production farmers backups auditlog`. Expected: only known errors. Update older tests only where they expect the old stored form.

### Task 2: Edit Crop uses the same lists

**Files:** Modify `oma-frontend/src/pages/CropInformation/cropEntry.js`, `CropInformationPage.jsx` (`EditCropModal`); Test `oma-frontend/tests/cropEntry*.test.mjs`.

**Interfaces:**
- Produces: `varietyChoices(varieties, cropTypeId, current) -> string[]`, `seedSourceChoices(seedSources, current) -> (string | {value,label})[]`;
  `EDIT_SEED_SOURCES` is removed.

- [ ] **Step 1: Failing tests:** active varieties of the crop and general ones, no others; the current value kept when not listed (once, and not when it is `Other` or blank); active seed sources; `Organization` shown as `Cooperative`; the window uses both helpers with `ComboboxWithOther` for Variety and Seed Source.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. Variety keeps a `variety_used_is_other` flag in the form, as the Add Crop table does.
- [ ] **Step 4:** Run `npm test`. Expected: pass.

### Task 3: Proof

- [ ] `npm test`, build, eslint; full backend suite against the known errors.
- [ ] Browser on the throwaway copy: add a crop with a typed variety and seed source; both appear in a new Add Crop form, in Edit Crop and in Crop Settings; Edit Crop shows an old value that is not listed; no console errors.
