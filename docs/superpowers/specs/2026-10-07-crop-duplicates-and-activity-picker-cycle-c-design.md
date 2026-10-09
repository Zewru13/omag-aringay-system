# Cycle C — Duplicate crops and the crop activity picker

Date: 2026-10-07. Third of six cycles from the user's 12-item request (items 8 and 9). Cycles A and B are committed.

## The request (user's words)

8. "duplicate crops name and variety"
9. "sequential suggestions activity" (when adding a crop activity, applicable steps in order, no repeating activities already done)

Answers to my questions: duplicates apply to BOTH the crop options list (Crop Information) and the farmers' crop records;
the activity picker follows "next steps only".

## What the code does today (verified)

- `CropType.name` is unique (the serializer compares case-insensitively, `CropTypeSerializer.validate_name`).
  `CropVariety` is unique per crop type by case-insensitive exact name (`CropVarietySerializer.validate`); a variety with
  no crop type is its own group. `Rc 222`, `RC222` and `Rc-222` are all accepted as different varieties.
- A crop record is `CropMonitoringRecord` (farmer, `farm_parcel` nullable, `farm_location_barangay`, `crop_type` FK,
  `variety_used` free text, status Planted / Near Harvest / Harvested / Total Loss). `CropMonitoringRecordSerializer.validate`
  already resolves farmer and parcel for create and update, and already infers a parcel on a new record.
- `CropDuplicateCheckView` (`/production/monitoring/check-duplicate/`) returns active Planted records for a farmer and crop
  type (no variety, no parcel); `AddCropMonitoringPage` shows an amber warning only. The server never refuses a duplicate.
- The crop record file import (`crop_record_import_views.py`) detects duplicates on (farmer, crop, exact variety, planting date).
- The staff activity modal (`CropMonitoringPage.jsx`, around line 480-560) builds "Suggested now" in the browser from the crop's
  `CropActivityStage` rows (due within 7 days, or overdue and never logged) and puts every other active activity type under
  "Other", so a step already done is still offered. The server already computes per-step status (`done`, `due_now`,
  `overdue`, `upcoming`) in `CropActivitySuggestionsView` (`/production/monitoring/<id>/suggestions/`), matching a log by
  `target_day` or by date within the stage's `window_days`.
- `PlantingRecord` (a parcel-level planting history row with free-text `crop_name`) is a separate model and is not touched.

## Decisions

### 1. One normalized comparison for names

New helper `production.naming.normalize_name(value) -> str`: Unicode NFKC, case-folded, every character that is not a letter
or digit removed. `'Rc 222'`, `'RC222'`, `'Rc-222'`, `' rc 222 '` all become `rc222`. An input that normalizes to the empty
string (for example `'---'`) is refused by the serializers as "not a real name".

### 2. Crop options (Crop Information)

- `CropTypeSerializer.validate_name` compares by `normalize_name` against every other crop type.
- `CropVarietySerializer.validate` compares by `normalize_name` against the other varieties of the same crop type (varieties
  without a crop type are compared with each other). Both messages name the existing entry: `A variety named 'RC 222' already
  exists for Rice.` / `A crop type named 'Rice' already exists.` (the existing entry's own spelling is shown).
- Only create and edit are checked. Existing duplicates already in the database are left alone, and editing a duplicate
  without changing its name is not blocked (compare against the other rows only).

### 3. Farmers' crop records

A record is a duplicate of another when ALL of these hold: same farmer; same crop type; same variety by `normalize_name`
(both blank counts as the same); the other record is ACTIVE (status Planted or Near Harvest); and the same parcel — when
the new record has a parcel, the other has that same parcel; when it has none, compare `farm_location_barangay` instead,
case-insensitively, and treat two records with neither as the same place.

- `CropMonitoringRecordSerializer.validate` runs the check for create and update (the record being edited is excluded),
  using the farmer, crop, variety and parcel the request would leave on the record (submitted value or stored one).
- It raises `{'crop_type': 'This farmer already has an active <crop> (<variety>) record on this parcel (record #<id>, planted <date>). Harvest or close it first, or choose a different parcel.'}`
  (variety part omitted when blank; "on this parcel" is "in <barangay>" when there is no parcel).
- No override flag. A Total Loss or Harvested record never blocks. Existing duplicates are not touched, and a PATCH that does
  not change farmer, crop, variety or parcel on a record that is already a duplicate is allowed (the check runs only when one
  of those four fields is in the request).
- `CropDuplicateCheckView` gains optional `variety` and `parcel` (and `exclude`) query parameters and uses the same rule and
  the same function (`production.duplicates.find_active_duplicates(...)`), so the warning and the refusal never disagree; it
  now returns both Planted and Near Harvest records. The add-crop form passes the variety and parcel it already holds.
- The bulk add page posts all rows to `/production/monitoring/bulk/`, which validates every row before saving any (all or
  nothing, per-row errors). Each row goes through the same serializer check; the bulk view additionally refuses a row that
  duplicates an EARLIER row of the same submission (same farmer, crop, normalized variety and parcel or barangay) with the
  same message pointing at that row ("duplicates row 2 of this form"). Nothing is saved when any row is refused, as today.
- The crop record file import is unchanged: it keeps its own (farmer, crop, exact variety, planting date) check and does not
  apply the active-duplicate refusal (it loads historical registrations). Out of scope for this cycle.

### 4. Activity picker ("next steps only")

- The staff activity modal reads `/production/monitoring/<id>/suggestions/` (already fetched elsewhere on the page) instead of
  working out "due" itself. Scheduled steps are grouped by activity name.
- Suggested now: activity names that have at least one step with status `due_now` or `overdue`, ordered by the smallest
  `day_after_planting` of those steps; the picker shows the step ("Day 20") beside the name.
- Other: activity types with no schedule for this crop (including Other and Disaster Remedy as today), plus scheduled names
  whose remaining steps are all `upcoming`.
- Hidden: a scheduled activity name whose every step is `done`. When editing an existing log, the log's own activity name
  stays selectable.
- When a crop's `date_planted_is_estimated` is true, the suggestions endpoint returns no steps (existing behaviour): every
  scheduled name is then treated as unscheduled and shown under Other, as no step can be judged done or due.
- Logging is not blocked on the server: the server still accepts a repeated or early activity (irrigation really repeats). The
  picker only guides.
- Refresh: after a log is saved or deleted the suggestions are refetched, so a just-done step leaves the list.

## Out of scope

Fisheries activity picker and fisheries duplicates; `PlantingRecord`; cleaning up duplicates already in the database; the
citizen activity modal (it has no picker of its own); server-side refusal of repeated activity logs.

## Risks and costs

- A farmer who legitimately plants the same crop and variety twice on the same parcel while the first is still active is
  blocked until the first is harvested or closed. Chosen deliberately (no override).
- A parcel-less record compares by barangay, which can over-block two real plots in one barangay when parcels are not set;
  the message tells staff to choose a parcel, and the parcel inference already links most new records.
- Normalizing strips punctuation, so `Rc 222` and `Rc 22-2` count as the same name; real distinct varieties differing only
  by punctuation or spacing must be named differently.

## Testing

Backend (throwaway database, never Supabase; tests only): `normalize_name` cases; crop type and variety duplicates
(case, spaces, punctuation, same name under a different crop allowed, editing the entry itself, empty-after-normalizing);
crop record duplicate rule (same parcel blocked, different parcel allowed, no-parcel barangay fallback, harvested or total-loss
earlier record allowed, variety normalized, blank varieties equal, Near Harvest blocks, update excluding itself, PATCH of
another field on an existing duplicate allowed, PATCH changing the variety into a duplicate refused); the duplicate-check
endpoint agrees with the refusal; the import reports an active duplicate.
Frontend: the picker grouping is a pure function in `utils/activityPicker.js` (steps in, groups out), checked by a node
script (same style as the guard checks); build; lint compared with HEAD; browser checks on the throwaway stack (add a crop
with a duplicate variety spelling, the picker before and after logging a due step).

## Review focus (inputs the tests above do not name)

1. Two crop records for the same farmer and crop where one has a parcel and the other has only a barangay.
2. A variety typed with a trailing space or different Unicode form (`Rc 222 ` / full-width digits).
3. The activity with several steps (days 20, 40, 60): after step 20 is done it must not be "Suggested now" again until step 40 is due, and must not be hidden.
4. A step whose log was entered with a date inside the window but a different `target_day`.
5. Editing a log whose activity name would otherwise be hidden.
