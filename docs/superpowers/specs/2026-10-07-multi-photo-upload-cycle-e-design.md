# Cycle E — Several photos where there is one photo today

Date: 2026-10-07. Fifth of six cycles from the user's 12-item request (item 11). Cycles A-D are committed.

## The request (user's words)

11. "multiple photo uploads everywhere there is a photo (like fisheries disaster photos)"

Answers to my question: the scope is (a) disaster reports and (b) assistance confirmation proof. Profile pictures and
organization logos stay single (an identity picture is "the" picture).

## What the code does today (verified)

- Fisheries disaster reports are the model: `FisheriesDisasterReportPhoto(disaster_report, image, uploaded_by,
  date_uploaded)`, `MAX_PER_REPORT = 10`, related name `photos`; create endpoints accept multipart `photos`
  (`_validated_damage_photos`: at most 10, each `core.validators.validate_uploaded_image` = JPG/PNG/WEBP, 5 MB, decoded as a
  real image, error text `Maximum of 10 photos allowed.` / `Photo <n>: ...` on key `photos`); the report, its photos and the
  response are saved in one transaction and the written files are removed when anything fails
  (`_create_disaster_with_photos`, `_discard_uploaded_files`); the serializer returns `photos` (rows) and the older single
  `photo` field is kept and shown as `legacy_photo`; the document/PDF builder includes every photo path plus the legacy one.
  The staff stocking-record disaster endpoint already accepts `photos`; the fisherfolk forms already use the
  `useDamagePhotos` hook and `DamagePhotosField`. Only the staff `StockingDisasterReportModal` still posts one `photo`.
- Still a single photo (in scope):
  - `production.CropDisasterReport.photo` — posted by the staff `DisasterReportModal` (`CropMonitoringPage.jsx`) and by the
    farmer's own forms `FarmerDisasterReportForm.jsx` and `CitizenDisasterScreen.jsx` to
    `/production/monitoring/<id>/disasters/` (`CropDisasterReportListCreateView`, serializer `CropDisasterReportSerializer`,
    `validate_photo`); read back by `crop_disaster_logs.document()` (`photo`) and `build_pdf` (`photo_paths`) and shown as
    `event.photo` in `CropMonitoringPage` and `StockingMonitoringModals` event lists and in `DisasterLogDetailsModal`.
  - `interventions.BeneficiaryRecord.confirmation_photo` — posted by the recipient's own confirmation
    (`BeneficiaryConfirmReceivedView`, field `confirmation_photo`, `CropAssistancePage.jsx`).
  - `interventions.BeneficiaryConfirmationRequest.photo` and `FisherfolkBeneficiaryConfirmationRequest.photo` — posted by an
    organization confirming on behalf of an account-less recipient (views at `interventions/views.py` ~595 and ~651, field
    `photo`, `ConfirmOnBehalfDialog.jsx`, shared by the crop and fisheries assistance pages); read back as `photo_url` by the
    request serializers and by `reports/views.py` (`has_photo`, `with_photo`, `_photo_thumbnail`, the Excel `Yes/No` column).
- Profile pictures (`User`, `Farmer`, `Fisherfolk`) and logos stay as they are.

## Decisions

### 1. Photo tables, one per photo spot (same pattern as fisheries)

New models, each `(parent FK, image, uploaded_by, date_uploaded)`, `MAX_PER_PARENT = 10`, `ordering = ['id']`,
`related_name='photos'`:

- `production.CropDisasterReportPhoto` → `CropDisasterReport` (`upload_to='disaster_reports/crop/photos/'`);
- `interventions.BeneficiaryRecordPhoto` → `BeneficiaryRecord` (`upload_to='beneficiary_confirmations/photos/'`);
- `interventions.BeneficiaryConfirmationRequestPhoto` → `BeneficiaryConfirmationRequest`
  (`upload_to='beneficiary_confirmations/farmers/photos/'`);
- `interventions.FisherfolkBeneficiaryConfirmationRequestPhoto` → `FisherfolkBeneficiaryConfirmationRequest`
  (`upload_to='beneficiary_confirmations/fisherfolk/photos/'`).

Four additive migrations (new tables only). The existing single fields are untouched, never written by new clients and never
migrated; they are returned as the legacy photo and shown first.

### 2. Shared validation and cleanup

New `core/photos.py`:

- `validated_photos(request, field='photos', limit=10, already=0) -> list[UploadedFile]` — the multipart `photos` files
  (field name configurable); more than `limit - already` raises `ValidationError({field: ['Maximum of 10 photos allowed.']})`;
  each file goes through `validate_uploaded_image`, with the same `Photo <n>: ...` messages collected on `field`.
- `discard_uploaded_files(names)` — the existing fisheries helper moved here (the fisheries code imports it from there).
- The legacy single field posted by an older page (`photo` / `confirmation_photo`) is accepted too: it counts as one photo and
  is saved as a photo ROW (not into the old column), so old clients and new clients end up in the same table and the old
  column only ever holds historical data.

### 3. Create endpoints

- Crop disaster create (`CropDisasterReportListCreateView.create`): reads `photos` (+ legacy `photo`) before validating the
  rest; the report, the photo rows and the response are built in one transaction; any failure removes the written files and
  saves nothing. The multipart body is turned into plain data without `photos`/`photo` the way the fisheries helper does
  (`request.data` minus the file fields) so the serializer never sees two sources for the photo.
- Recipient confirmation (`BeneficiaryConfirmReceivedView`): reads `confirmation_photos` (+ legacy `confirmation_photo`),
  validates all before changing the record, then saves the status change and the photo rows in one transaction.
- On-behalf requests (both domains): read `photos` (+ legacy `photo`), validate all before the `select_for_update` block,
  create the request and its photo rows in the same atomic block as today.
- Counts and size rules are exactly the fisheries rules (10, 5 MB, JPG/PNG/WEBP).
- Permissions, notifications, status rules are unchanged.

### 4. Responses and exports

- `CropDisasterReportSerializer` gains read-only `photos` (`[{id, url, date_uploaded}]`, absolute-capable URL like the
  fisheries serializer) and keeps `photo` (legacy). `BeneficiaryRecordCreateSerializer` (the confirmation response and detail) gains
  `confirmation_photos` beside `confirmation_photo`; the two request serializers gain `photo_urls` (list) beside `photo_url`.
- `crop_disaster_logs.document()` returns `photos` (all rows) and keeps `photo` (legacy); the PDF's `photo_paths` is the photo
  rows first, then the legacy file (the same ordering as the fisheries PDF).
- `reports/views.py` on-behalf report: `has_photo` / `with_photo` / the Excel `Yes/No` column are true when the request has
  a legacy photo OR at least one photo row; the thumbnail uses the first available (first row, else legacy).
- List endpoints that return these objects prefetch `photos` (no N+1).

### 5. Frontend

- The existing `useDamagePhotos` hook and `DamagePhotosField` move to `hooks/usePhotoList.js` and
  `components/UI/PhotoListField.jsx` (same behaviour: previews, remove, `Maximum of 10 photos allowed.`, JPG/PNG/WEBP,
  5 MB, `reserved`); `fisheriesDisasterShared.jsx` and the fisherfolk modals import them from the new place and keep working
  (re-exports from the old paths are left so no import breaks). The constants (`MAX_DAMAGE_PHOTOS`, `PHOTO_MAX_BYTES`,
  `PHOTO_TYPES`) move with them to a shared `utils/photoRules.js`; the Filipino/English labels for the citizen forms are taken
  from the existing `labels.disaster.fields.photo*` strings.
- The single-photo inputs are replaced by the shared list field and the forms append each file as `photos`:
  `DisasterReportModal` (`CropMonitoringPage.jsx`), `FarmerDisasterReportForm.jsx`, `CitizenDisasterScreen.jsx`,
  `StockingDisasterReportModal` (`StockingMonitoringModals.jsx`), the recipient confirmation form (`CropAssistancePage.jsx`,
  field `confirmation_photos`) and `ConfirmOnBehalfDialog.jsx` (field `photos`).
- Server `photos` errors are shown under the field.
- Display: the crop disaster detail views (`CropMonitoringPage` and `StockingMonitoringModals` event lists,
  `DisasterLogDetailsModal`) and the staff review screens for on-behalf confirmations show every photo as a link/thumbnail
  (legacy photo first), replacing the single "View photo" link.

## Out of scope

Adding or removing photos after the report or confirmation is saved; profile pictures and logos; moving old single photos into
the new tables; image resizing or compression; photos on records that have none today; the fisheries forms other than the staff
stocking-record disaster modal (they are already multi-photo).

## Risks and costs

- Storage: up to 10 photos of 5 MB per report or confirmation.
- A request with many photos is bigger; the 5 MB cap per file and the 10-photo cap bound it (at most about 50 MB per request).
- Four new tables and four migrations (additive only).
- PDFs with many photos get longer.

## Testing

Backend (throwaway database; tests only; uploaded files go to the throwaway media folder): `core.photos` unit tests
(0, 10 and 11 photos, a non-image, a 6 MB image, the legacy field counted, messages); crop disaster create with 0, 3 and 10
photos (rows, response `photos`, legacy `photo` untouched), 11 photos → 400 and nothing saved (no report, no rows, no files left),
one bad photo among good ones → 400 and nothing saved, the legacy single `photo` becomes a row, a citizen farmer reporting on
their own record works and on another farmer's record is refused; the same matrix for the recipient confirmation
(status unchanged on a failed upload), the farmer on-behalf request and the fisherfolk on-behalf request (a second pending
request still refused); responses expose `photos`/`photo_urls` and keep the legacy fields; the crop disaster document and PDF
include every photo (PDF contains N images for N photos plus the legacy one); the on-behalf report counts a row-only request as
having a photo; the fisheries photo tests still pass after `discard_uploaded_files` moves. Frontend: build, lint compared with
HEAD, a node check of any pure photo-rule helper, and browser checks on the throwaway stack (mail credentials blanked): each
changed form adds several photos, removes one, shows the 10-photo message, saves, and the detail view shows them all.

## Review focus (inputs the tests above do not name)

1. A multipart request that sends both `photos` and the legacy `photo`: counted once each, total capped at 10.
2. A failed save after some files were written: no file is left in the media folder, for each of the four create paths.
3. The same report read by a farmer account (own record only) and by staff: `photos` URLs are present for both, and a different
   farmer cannot read another farmer's photo list.
4. A photo row whose file was deleted from disk: the document/PDF builder skips it instead of failing.
5. Double-submit of the same confirmation: no duplicate photo rows (the recipient confirmation checks the status first; the
   on-behalf request already refuses a second pending request).
