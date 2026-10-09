# Cycle E — Several Photos for Disaster Reports and Assistance Confirmations: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crop disaster reports and the three assistance-confirmation proofs take up to 10 photos each (as Log Fisheries Disaster already does), the staff stocking-record disaster modal switches to several photos, and every detail view, PDF and report shows all of them.

**Architecture:** One shared backend validator and cleanup helper (`core/photos.py`) feed four new photo tables (one per photo spot); create endpoints save parent, photo rows and response in one transaction and remove written files on failure; the legacy single photo field stays and is shown first. On the frontend the existing damage-photos hook and field become a shared generic hook and component that the fisheries forms keep using through thin wrappers.

**Tech Stack:** Django 4.2 + DRF, Pillow, React, Vite.

**Spec:** `docs/superpowers/specs/2026-10-07-multi-photo-upload-cycle-e-design.md`

## Global Constraints

- Photo rules (identical to fisheries): at most 10 per parent, each JPG/PNG/WEBP, at most 5 MB, decoded as a real image by `core.validators.validate_uploaded_image`; error texts `Maximum of 10 photos allowed.` and `Photo <n>: <message>` on the field key; validation happens before anything is saved; parent, photo rows and response in one transaction; on any failure the files written by that request are removed.
- Multipart field names: crop disaster create `photos`; recipient confirmation `confirmation_photos`; on-behalf requests (both domains) `photos`. The legacy single fields (`photo`, `confirmation_photo`) are still accepted, counted as one of the 10, and saved as a photo ROW (never into the old column). Old columns are never written by new code and never migrated.
- New models: `production.CropDisasterReportPhoto`, `interventions.BeneficiaryRecordPhoto`, `interventions.BeneficiaryConfirmationRequestPhoto`, `interventions.FisherfolkBeneficiaryConfirmationRequestPhoto`; each `(parent FK related_name='photos', image, uploaded_by FK to AUTH_USER_MODEL null SET_NULL related_name='+', date_uploaded auto_now_add)`, `MAX_PER_PARENT = 10`, `ordering=['id']`; additive migrations only.
- Response fields: serializers return `photos: [{id, url}]` (URL absolute when a request is in context, as the fisheries serializer does) and keep the legacy field; `BeneficiaryRecordCreateSerializer` also `confirmation_photos`; on-behalf request serializers also `photo_urls`. PDF/document photo order: rows first, then the legacy file; a row whose file is missing on disk is skipped.
- Permissions, notifications and status rules of every endpoint stay exactly as they are.
- Frontend photo rules: 10 photos, `image/jpeg|png|webp`, 5 MB (moved to `utils/photoRules.js`; the fisheries constants file re-exports them). The fisheries forms keep their current wording through wrappers.
- Never test against Supabase; throwaway stack with the mail credentials blanked (`EMAIL_HOST_USER= EMAIL_HOST_PASSWORD=`; confirm `settings.SMTP_CONFIGURED` is False). Uploaded test files go to the throwaway media folder only. Commit only when the user says so; no push.

## Review Focus

1. A multipart request that sends both `photos` and the legacy `photo`: counted together, total capped at 10. (Tasks 1-3)
2. A failed save after some files were written: no file is left in the media folder, for each of the four create paths. (Tasks 2-3)
3. The same report read by a farmer account (own record) and by staff shows `photos`; another farmer cannot read the list. (Task 2)
4. A photo row whose file was deleted from disk: the document/PDF builder skips it instead of failing. (Task 2)
5. Double submit of the same confirmation: no duplicate photo rows. (Task 3)

## Harness (Tasks 1-3 backend; Tasks 4-5 also browser)

Same recipe as cycles A-D: throwaway MariaDB on port 3307 (`mysql_install_db.exe --datadir=<scratch>\mdb`, `mysqld.exe --no-defaults --datadir=<scratch>\mdb --port=3307 --skip-grant-tables --standalone --bind-address=127.0.0.1`, database `oma_aringay_db` utf8mb4), `<scratch>\mysqlplain.py` (sets `MEDIA_ROOT` to `<scratch>\testmedia`), tests `DB_BACKEND=mysql PYTHONPATH=<scratch> ../.venv/Scripts/python.exe manage.py test <labels> --settings=mysqlplain --noinput`. Test image helper: build a real PNG with Pillow (`Image.new('RGB', (8, 8)).save(BytesIO(), 'PNG')`) wrapped in `SimpleUploadedFile`; a non-image is `b'not an image'` with `image/png`; a 6 MB image is padded bytes of a valid PNG header is NOT enough (the validator decodes it) so use a large real image (`Image.new('RGB', (2500, 2500))` saved as uncompressed BMP-like PNG with `compress_level=0`) and assert its size exceeds 5 MB before use. Fixtures: `production/test_farmer_scope.py` (`make_farmer`, `make_crop`, `make_staff`, `make_citizen`) for crop records and accounts; `associations/test_own_org_scope.py` for organizations and `BeneficiaryRecord` / request creation. After each test run clean created media. Browser stack: `migrate`, `seed_org.py` + `seed_fix.py`, `runserver 127.0.0.1:8001 --settings=mysqlplain --noreload` with the mail credentials blanked, `VITE_API_URL=http://127.0.0.1:8001/api npx vite --port 5174 --strictPort`; set `localStorage.accessToken` and a placeholder `refreshToken` (tokens in `org_tokens.json`). Cleanup at the end: clear browser storage, stop the three processes, delete scratch `mdb`, `testmedia`, token file.

## File Structure

- Backend new: `core/photos.py`; tests `core/test_photos.py`, `production/test_crop_disaster_photos.py`, `interventions/test_confirmation_photos.py`; migrations `production/migrations/00NN_cropdisasterreportphoto.py`, `interventions/migrations/00NN_confirmation_photos.py`.
- Backend modified: `production/models.py`, `production/serializers.py`, `production/views.py` (`CropDisasterReportListCreateView`), `production/crop_disaster_logs.py`, `interventions/models.py`, `interventions/serializers.py`, `interventions/views.py` (three confirmation views), `reports/views.py` (on-behalf report), `fisheries/views.py` (imports `discard_uploaded_files` from `core.photos`).
- Frontend new: `utils/photoRules.js`, `hooks/usePhotoList.js`, `components/UI/PhotoListField.jsx`, `components/UI/PhotoLinks.jsx`.
- Frontend modified: `pages/Monitoring/useDamagePhotos.js` (re-export), `pages/Monitoring/fisheriesDisasterConstants.js` (re-export), `pages/Monitoring/fisheriesDisasterShared.jsx` (wrapper), `pages/Monitoring/CropMonitoringPage.jsx`, `pages/FisheriesRecords/StockingMonitoringModals.jsx`, `pages/Citizen/FarmerDisasterReportForm.jsx`, `pages/Citizen/CitizenDisasterScreen.jsx`, `pages/AssistanceManagement/CropAssistancePage.jsx`, `pages/AssistanceManagement/ConfirmOnBehalfDialog.jsx`, `pages/Monitoring/DisasterLogDetailsModal.jsx`.

---

### Task 1: Shared photo validation helper (backend)

**Files:**
- Create: `oma_aringay/core/photos.py`
- Modify: `oma_aringay/fisheries/views.py` (use the shared helpers, behaviour unchanged)
- Test: `oma_aringay/core/test_photos.py` (new)

**Interfaces:**
- Produces: `core.photos.MAX_PHOTOS = 10`; `validated_photos(request, field='photos', legacy_field=None, limit=10, already=0) -> list[UploadedFile]` — `request.FILES.getlist(field)` plus the single `legacy_field` file when given and present; the total above `limit - already` raises `rest_framework.exceptions.ValidationError({field: ['Maximum of 10 photos allowed.']})`; each file through `validate_uploaded_image`, collecting `Photo <n>: <messages>` and raising `ValidationError({field: errors})`; `discard_uploaded_files(names)` deleting each name from `default_storage`, logging and swallowing errors.

- [ ] **Step 1: Write the failing tests** (`APITestCase` using `APIRequestFactory` + `Request`, or a tiny test view): 0 files → `[]`; 3 valid PNGs → 3; 10 valid → 10; 11 → `ValidationError` with `Maximum of 10 photos allowed.`; a non-image → `Photo 2: ...` naming the right index; a >5 MB image → refused with the validator's message; `legacy_field='photo'` with one `photo` file and 9 `photos` → 10, with 10 `photos` plus `photo` → 11 → refused (Review Focus 1); `already=3` allows only 7 more; `discard_uploaded_files` removes a stored file and does not raise for a missing name.
- [ ] **Step 2: Run** `manage.py test core.test_photos`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `core/photos.py`; in `fisheries/views.py` replace `_discard_uploaded_files` with `from core.photos import discard_uploaded_files` and let `_validated_damage_photos` call `validated_photos(request, 'photos', limit=FisheriesDisasterReportPhoto.MAX_PER_REPORT)`; keep the function names so callers and tests are untouched.
- [ ] **Step 4: Run** `core.test_photos` plus the existing fisheries disaster tests (`manage.py test fisheries`). Expected: PASS. **Mutation check:** make `validated_photos` skip `validate_uploaded_image` and confirm the non-image test fails; restore; ledger it.
- [ ] **Step 5: Run the whole suite.** Expected: OK.

---

### Task 2: Crop disaster report photos (backend)

**Files:**
- Modify: `oma_aringay/production/models.py`, `production/serializers.py`, `production/views.py`, `production/crop_disaster_logs.py`
- Create: `oma_aringay/production/migrations/00NN_cropdisasterreportphoto.py` (via `makemigrations production -n cropdisasterreportphoto`)
- Test: `oma_aringay/production/test_crop_disaster_photos.py` (new)

**Interfaces:**
- Consumes (Task 1): `validated_photos`, `discard_uploaded_files`.
- Produces: `CropDisasterReportPhoto`; `CropDisasterReportSerializer.photos` (read-only list `{id, url}`) plus unchanged legacy `photo`; `CropDisasterReportListCreateView.create` reading `photos` + legacy `photo`; `crop_disaster_logs.document(report, request)` returning `photos` (all rows) and `photo` (legacy), and `build_pdf` using the row paths then the legacy path.

- [ ] **Step 1: Write the failing tests** (admin client and a farmer citizen): create with 0, 3 and 10 photos → 201, rows count, response `photos` length, legacy `photo` null; 11 photos → 400 on `photos`, no report row, no photo rows, no new files under `MEDIA_ROOT/disaster_reports/crop/photos/`; one non-image among valid ones → 400 and nothing saved (Review Focus 2: assert the media folder file count is unchanged); the legacy `photo` file alone becomes one photo ROW and the report's `photo` column stays empty; `photos` + `photo` totalling 11 → 400 (Review Focus 1); the farmer account can report on their own record and gets `photos` back, another farmer's record → 403 (existing rule), staff list shows `photos` for the report and a different farmer account cannot list another farmer's reports (Review Focus 3); the report document (`/production/disasters/<id>/log/` or the `document()` function, as the existing tests call it) returns every photo URL; the PDF builder is called with N row paths plus the legacy path; delete one stored file from disk and rebuild the document/PDF → no exception and the missing photo skipped (Review Focus 4); an older client posting only `photo` (legacy field) still works; the report list queries do not grow with the number of photos (use `assertNumQueries` with `django.test.utils.CaptureQueriesContext` comparing 1 report with 3 photos vs 3 reports with 3 photos each, equal query counts).
- [ ] **Step 2: Run** `manage.py test production.test_crop_disaster_photos`. Expected: FAIL.
- [ ] **Step 3: Implement** the model, migration, serializer field (`prefetch_related('photos')` in the list queryset), the view's `create` (validate photos first; build serializer data from `request.data` minus `photos`/`photo`; one `transaction.atomic()` with `discard_uploaded_files` on failure; legacy `photo` saved as a photo row), the document/PDF changes (skip missing files with `os.path.exists`).
- [ ] **Step 4: Run** the module. Expected: PASS. **Mutation check:** remove the `discard_uploaded_files` call in the failure path and confirm the no-orphan-file test fails; restore; ledger it.
- [ ] **Step 5: Run the whole suite and `makemigrations --check`.** Expected: OK, no changes.

---

### Task 3: Assistance confirmation photos (backend)

**Files:**
- Modify: `oma_aringay/interventions/models.py`, `interventions/serializers.py`, `interventions/views.py` (`BeneficiaryConfirmReceivedView`, the farmer on-behalf request view, the fisherfolk on-behalf request view), `reports/views.py`
- Create: `oma_aringay/interventions/migrations/00NN_confirmation_photos.py`
- Test: `oma_aringay/interventions/test_confirmation_photos.py` (new)

**Interfaces:**
- Consumes (Task 1): `validated_photos`, `discard_uploaded_files`.
- Produces: `BeneficiaryRecordPhoto`, `BeneficiaryConfirmationRequestPhoto`, `FisherfolkBeneficiaryConfirmationRequestPhoto`; serializer fields `confirmation_photos` (record) and `photo_urls` (both request serializers) beside the unchanged legacy fields; the on-behalf report counting a row-only request as having a photo and using the first available photo for the thumbnail.

- [ ] **Step 1: Write the failing tests:** recipient confirmation (the farmer citizen account on its own awaiting record): 0, 3, 10 `confirmation_photos` → record `Confirmed`, rows saved, response `confirmation_photos`; 11 or one bad file → 400 on `confirmation_photos`, the record stays `Awaiting Confirmation`, no rows, no new files (Review Focus 2); legacy `confirmation_photo` alone becomes a row and the column stays empty; both fields totalling 11 → 400 (Review Focus 1); a second POST of the same confirmation → 400 "not awaiting confirmation" and no extra rows (Review Focus 5); on-behalf (organization account, account-less recipient): same matrix for `photos`/legacy `photo` on both the farmer and the fisherfolk route, the request is created with its rows in one atomic block, a failing photo leaves no request, a second pending request is still refused with no extra rows; staff/organization can read `photo_urls`; the on-behalf Excel/JSON report in `reports/views.py` reports `has_photo` true and counts `with_photo` for a request with rows only, and builds the thumbnail from the first photo (use the report endpoints the existing tests call; if none exist add the smallest assertion on the helper `_photo_thumbnail`'s input choice).
- [ ] **Step 2: Run** `manage.py test interventions.test_confirmation_photos`. Expected: FAIL.
- [ ] **Step 3: Implement** the three models and the migration, the three views (validate with `validated_photos` before changing any state; save rows inside the existing atomic blocks; `discard_uploaded_files` on failure), the serializer fields (`prefetch_related('photos')` in the list/detail querysets) and the `reports/views.py` changes.
- [ ] **Step 4: Run** the module. Expected: PASS. **Mutation check:** save the confirmation status before validating the photos and confirm the "record stays Awaiting" test fails; restore; ledger it.
- [ ] **Step 5: Run the whole suite and `makemigrations --check`.** Expected: OK.

---

### Task 4: Shared frontend photo component, hook and rules

**Files:**
- Create: `oma-frontend/src/utils/photoRules.js`, `hooks/usePhotoList.js`, `components/UI/PhotoListField.jsx`, `components/UI/PhotoLinks.jsx`
- Modify: `pages/Monitoring/useDamagePhotos.js`, `pages/Monitoring/fisheriesDisasterConstants.js`, `pages/Monitoring/fisheriesDisasterShared.jsx`
- Test: `check_photorules.mjs` in the scratchpad (node script, same style as `check_guards.mjs`).

**Interfaces:**
- Produces: `utils/photoRules.js`: `MAX_PHOTOS = 10`, `PHOTO_TYPES`, `PHOTO_MAX_BYTES`, `classifyPhotoFiles(files, room) -> { accepted: File[], rejected: string[], overflow: boolean }` (type check first, then size, then `room` — the number of free slots — applied to the accepted list, `overflow` true when more were acceptable than fit; rejection texts exactly `<name>: use a JPG, PNG or WEBP image.` and `<name>: larger than 5 MB.`). `hooks/usePhotoList.js`: the current `useDamagePhotos` behaviour built on `classifyPhotoFiles` (same return `{ photos, add, remove, reserved }`). `components/UI/PhotoListField.jsx`: the current `DamagePhotosField` and its camera modal with props `{ photosState, existing, onRemoveExisting, title, hint, altPrefix }` and defaults for the generic wording. `components/UI/PhotoLinks.jsx`: `PhotoLinks({ photos, legacy })` — thumbnails/links for `{id,url}` rows with the legacy URL first, nothing when empty. `fisheriesDisasterShared.jsx` keeps exporting `DamagePhotosField` as a wrapper passing the old title `Photo Documentation of Damage` and the old pond/cage hint; `useDamagePhotos.js` re-exports the hook; the constants file re-exports the rules.

- [ ] **Step 1: Write the failing check script** `check_photorules.mjs`: valid files accepted; `.gif` rejected with the exact type text; a 6 MB file rejected with the exact size text; `room = 2` with 3 valid files → 2 accepted and `overflow` true; `room = 0` → none accepted, overflow true; mixed good and bad keep the good ones; empty list; a file with no `type` rejected.
- [ ] **Step 2: Run** `node check_photorules.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the pure module, the hook (preview URLs released on remove and unmount, toast texts as today), the component move (camera modal included), the wrappers and re-exports. No behavioural change for the fisheries forms.
- [ ] **Step 4: Run** the check script. Expected: PASS. **Lint and build:** per-file eslint compared with HEAD (scratch `lintcmp.sh`) and `vite build`.
- [ ] **Step 5: Browser check (fisheries unchanged):** open the fisherfolk Log Disaster and the staff Log Disaster forms: the Photo Documentation field looks and behaves as before (add two photos, remove one, an 11th is refused with the toast).

---

### Task 5: Use the shared field in the six forms and show every photo

**Files:**
- Modify: `pages/Monitoring/CropMonitoringPage.jsx` (`DisasterReportModal` and the event list), `pages/FisheriesRecords/StockingMonitoringModals.jsx` (`StockingDisasterReportModal` and its event list), `pages/Citizen/FarmerDisasterReportForm.jsx`, `pages/Citizen/CitizenDisasterScreen.jsx`, `pages/AssistanceManagement/CropAssistancePage.jsx` (recipient confirmation and any list that shows `confirmation_photo`), `pages/AssistanceManagement/ConfirmOnBehalfDialog.jsx`, `pages/Monitoring/DisasterLogDetailsModal.jsx`, plus the staff review screens that show `photo_url` (search `photo_url`).

**Interfaces:**
- Consumes (Tasks 2-4): `PhotoListField` / `usePhotoList`, `PhotoLinks`; request fields `photos` / `confirmation_photos`; response `photos`, `confirmation_photos`, `photo_urls` and the legacy fields.

- [ ] **Step 1:** replace each single-photo state and `<input type="file">` with `usePhotoList()` and `<PhotoListField ...>` (citizen forms pass their own Filipino/English title and hint from `labels.disaster.fields.photo` / `photoHint`; staff forms use the generic wording), append every selected file to the form data as `photos` (`confirmation_photos` for the recipient confirmation), and show a server `photos` / `confirmation_photos` error under the field.
- [ ] **Step 2:** replace each `View photo` link / `photo_url` link with `<PhotoLinks photos={...} legacy={...}>` (legacy URL first).
- [ ] **Step 3: Lint (compared with HEAD) and `vite build`.** Expected: no new messages; build OK.
- [ ] **Step 4: Browser checks on the throwaway stack (mail credentials blanked):** as admin, report a crop disaster with three photos (preview, remove one, the 11th refused) and open the log details: all photos shown; as the farmer account report a disaster with two photos on the citizen form; staff stocking-record disaster with two photos; the recipient confirmation with two photos on an awaiting record and the on-behalf dialog with two photos, then the staff review screen shows both photos; an older single-photo record still shows its one photo. Run the whole backend suite one last time.

---

## Self-review notes

- Spec coverage: decisions 1-2 (Tasks 1-3), 3 (Tasks 2-3), 4 (Tasks 2-3 serializers/exports), 5 (Tasks 4-5); all five Review Focus items have a named test in Tasks 1-3.
- The fisheries forms are protected by re-exports and wrappers plus the Task 4 browser check; the existing fisheries photo tests run in Task 1 and in every full-suite run.
- Out of scope per the spec: editing photos after save, profile pictures and logos, migrating old single photos, resizing.
