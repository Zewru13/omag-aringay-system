# Sample Fill-up in Every Import Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every import template shows, at its top, a clearly labelled sample fill-up that is never mistaken for a record.

**Architecture:** One layout function in `core/import_templates.py` replaces the five separate template builders; the RSBSA registry template uses it too.
Importers already find the heading row by its text (`read_template_rows`); only the RSBSA registry reader must learn to.

**Tech Stack:** Django, openpyxl.

**Spec:** `docs/superpowers/specs/2026-11-28-six-item-forms-and-templates-design.md` (item 1)

## Global Constraints

- Rows: 1 banner, 2 how to fill this in, 3 column headings, 4 sample (yellow, with an Excel comment), 5 onward the user's records.
- Banner: `SAMPLE FILL-UP ONLY: the yellow row (row 4) is an example. It is not imported if you leave it unchanged. Type your own records from row 5 down.`
- Comment: `Sample fill-up only. This row shows how to fill in the template. It is not imported while it is left unchanged. Type your own records from row 5 down.`
- **No sample value and no note prefix changes**: files made with the old templates must keep importing, their old sample row skipped.
- A changed sample row is read as a record. An unchanged one is skipped.
- The raw RSBSA/BFAR export (headings on row 1) must still be read.
- No database change. No Help text or pictures (spec step 6). Tests only on the throwaway MariaDB. No commit until the user says so.

## Review Focus

- An old-layout file (sample on row 2, note on row 4) must still import nothing extra (Task 1 test).
- A user who types over the sample row must not lose that record silently (Task 1 test).
- Row numbers in a preview must be the spreadsheet's own, so a user can find the bad row (Tasks 1 and 2).
- A new template saved as CSV (banner and note rows stay) must still be read (Task 2 test).
- The long parcel instructions must be readable without scrolling far sideways (Task 3: open a real file and look).

---

### Task 1: One layout for every import template

**Files:**
- Create: `oma_aringay/core/import_templates.py`
- Create: `oma_aringay/core/test_import_template_samples.py`
- Modify: `farmers/parcel_import.py`, `farmers/parcel_machinery_import.py`, `farmers/parcel_crop_records_import.py` (and drop their `Delete the sample row.`), `associations/org_imports.py`, `associations/views.py`, `interventions/views.py`
- Modify (old row numbers): `associations/test_member_import.py`, `test_equipment_import.py`, `farmers/test_parcel_crop_records_import.py`, `test_parcel_import_all_farmers.py`, `test_parcel_machinery_import.py`

**Interfaces:**
- Produces: `lay_out_import_sheet(sheet, headers, widths, sample_row, note)`; `import_template_response(filename, headers, widths, sample_row, note, sheet_title='Import') -> HttpResponse`;
  constants `SAMPLE_BANNER`, `SAMPLE_COMMENT`, `SAMPLE_FILL = 'FFF2CC'`, `HEADER_ROW = 3`, `SAMPLE_ROW = 4`.

- [ ] **Step 1: Failing tests**, over every template URL (the 4 registration-form ones included): the layout above; nothing below row 4; no `Delete the sample row`; every heading column of row 4 is yellow. Over every template that has an importer: untouched gives no records; the **old layout** rebuilt from the same headings, sample and note gives no records; **row 4 changed** gives one record; **a record typed on row 5** gives one record reported as row 5.
- [ ] **Step 2:** Run `core.test_import_template_samples`. Expected: the layout, row-4 and row-5 tests FAIL.
- [ ] **Step 3:** Write the module; point the five builders at it and delete them. The note cell is merged and wrapped over the first columns (about 110 characters wide) with a row height that fits it; the banner likewise.
- [ ] **Step 4:** Update the older tests' row numbers (headings row 1 → 3, sample row 2 → 4, note `A4` → `A2`). Run `core farmers associations interventions auditlog`. Expected: only the known `'super' object has no attribute 'dicts'` errors.

### Task 2: The RSBSA registry template and reader

**Files:**
- Modify: `oma_aringay/farmers/rsbsa_template.py`, `farmers/rsbsa_import.py` (`parse_rsbsa_xlsx`, `parse_rsbsa_csv`), `farmers/rsbsa_import_views.py` (row numbers)
- Test: `core/test_import_template_samples.py`, `core/test_import_templates.py` (the exact-columns test now reads row 3)

**Interfaces:**
- Produces: `RSBSA_SAMPLE_ROW` (list in `EXPECTED_HEADERS_V2` order) in `rsbsa_import.py`; each parsed row carries `_row_number`, its spreadsheet row.

- [ ] **Step 1: Failing tests:** the registry template has the layout, headings exactly `EXPECTED_HEADERS_V2`; untouched → 400 "valid header row but no data rows"; a raw export (headings row 1) previews its row as row 2; the template with a row typed on row 5 previews one row numbered 5, as `.xlsx` and saved as `.csv`; a file with other headings is still refused.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Both readers look for the heading row in the first 6 rows and skip a row equal to the sample (ignoring case and spaces); the view uses `_row_number`. The second sheet says to paste export rows from row 5 and what row 4 is.
- [ ] **Step 4:** Run `core farmers`. Expected: pass apart from the known errors.

### Task 3: Proof

- [ ] **Step 1:** Full backend suite on the throwaway MariaDB; compare with the 6 known errors.
- [ ] **Step 2:** Save real template files (parcels, all farmers, machinery, members, registry) and look at them rendered; check the comment and the note's height.
- [ ] **Step 3:** In the browser on the throwaway copy: download one template from an Import window, upload it untouched (nothing to import), then with one record typed (one row previewed).
