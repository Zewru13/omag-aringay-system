# Fisheries: Due/Ready/Overdue Harvest Split + Fisherfolk Stocking History Report

Date: 2026-09-19

## Context

Crop and Fisheries are parallel domains in this codebase (Farmer/CropMonitoringRecord
vs. Fisherfolk/StockingRecord) that usually get the same feature built at different
times, one side ahead of the other. Two crop-side features have no fisheries
equivalent yet. This spec covers building both mirrors. Both are read-only/display-only
additions — no schema or migration changes, confirmed against the real model files.

The originating prompt for this work described the Task 2 source file as
`Citizen/FarmerCropHistoryView.jsx`. That file was read and found to be a different
thing entirely (a per-crop-record activity/harvest/disaster screen inside the citizen
portal, not a report). The actual report living at `/reports?tab=farmer_crop_history`
is `FarmerCropHistoryTab` inside `Reports/ReportsPage.jsx`, backed by
`FarmerCropHistoryReport` in `reports/views.py`. The user confirmed (2026-09-19) that
this is the correct pattern to mirror; this spec targets that pattern, not
`FarmerCropHistoryView.jsx`.

## Task 1 — Due/Ready/Overdue harvest display split for Fisheries

### Source of truth (crop side)

`oma-frontend/src/pages/Monitoring/CropMonitoringPage.jsx`, function
`getCropDisplayStatus(rec)` (introduced in commit `53f0694`, extended to 3 labels in
`ff4d9ff`):

```js
function getCropDisplayStatus(rec) {
  if (rec.status !== 'Near Harvest' || !rec.expected_harvest_date) return rec.status
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expected = new Date(rec.expected_harvest_date + 'T00:00:00')
  const diffDays = Math.round((expected - today) / (1000 * 60 * 60 * 24))
  if (diffDays < -7) return 'Overdue'
  return diffDays <= 0 ? 'Ready for Harvest' : 'Due Harvest'
}
```

Thresholds (confirmed via `git show ff4d9ff`): `diffDays > 0` → "Due Harvest" (still
counting down); `-7 <= diffDays <= 0` → "Ready for Harvest" (harvest date has arrived,
through a week past); `diffDays < -7` → "Overdue" (more than a week past due,
unharvested — the `-7` mirrors the width of the existing 7-day Near-Harvest window,
the only other day-count already meaningful in this codebase). This is purely a
display re-labelling of the single real `Near Harvest` backend status; the backend
enum/model/stored value is never touched.

Paired `STATUS_TONES` entries: `'Due Harvest': 'amber'`, `'Ready for Harvest': 'rose'`,
`Overdue: 'rose'` (Overdue intentionally shares the rose tone with Ready for
Harvest/Total Loss rather than inventing a new hue — text+dot already distinguishes
same-tone states elsewhere in this system).

### Target: `oma-frontend/src/pages/FisheriesRecords/FisheriesRecordsPage.jsx`

Currently: `STATUS_TONES` has only the 4 real values (`Stocked`, `Near Harvest`,
`Harvested`, `Total Loss`); `status_cell` renders raw `rec.status`; the filter
`<select>` has no split options; `fetchRecords` sends `statusFilter` straight through
as the backend `status` param.

Changes, mirroring the crop side exactly (local duplicate function, not a shared
util — matches this codebase's existing convention of independent per-domain copies):

1. Add a local `getStockingDisplayStatus(rec)` function with identical logic/thresholds
   to `getCropDisplayStatus`, gated on `rec.status === 'Near Harvest'` and
   `rec.expected_harvest_date` (both fields already exist on `StockingRecord`/the
   stocking serializer).
2. Extend `STATUS_TONES` with the same 3 new entries/tones.
3. `status_cell` calls `getStockingDisplayStatus(rec)` for both the `StatusPill` tone
   lookup and the displayed label, instead of raw `rec.status`.
4. Filter `<select>`: insert `Due Harvest` / `Ready for Harvest` / `Overdue`
   `<option>`s between `Near Harvest` and `Harvested`.
5. `fetchRecords`: when `statusFilter` is one of the 3 display values, the `status`
   query param sent to the backend is `'Near Harvest'` (the real value) — same
   redirect trick as the crop side.
6. Add a client-side `filtered` narrowing step (new, since `FisheriesRecordsPage`
   doesn't currently have one for status): when `statusFilter` is one of the 3 display
   values, filter the fetched Near-Harvest page down to
   `getStockingDisplayStatus(rec) === statusFilter`. Carries the same known limitation
   as the crop side (`totalCount`/pagination still reflect the full Near-Harvest count,
   not the narrower client-side split) — acceptable per the existing precedent.

No backend changes for Task 1.

## Task 2 — Fisherfolk Stocking History report

### Source of truth (crop side)

`FarmerCropHistoryTab` (`Reports/ReportsPage.jsx:908-1142`) + `FarmerCropHistoryReport`
(`reports/views.py:2301`, endpoint `/reports/farmer-crop-history/`). Structure:
farmer-search box (`FarmerFilterSearch`, debounced `/farmers/?search=`), crop
type/barangay/season/year filters, 2-or-4 summary tiles (4 when a farmer is selected),
an expandable preview table (one row per `CropMonitoringRecord`, click to expand into
Activity Timeline + Harvest Records), and a signed PDF/Excel export via
`SignatureModal` + `downloadFile`. Registered in `ReportsPage`'s `TABS` array and in
`Sidebar.jsx`'s `REPORTS_GROUP.items`.

### Backend: new `FisherfolkStockingHistoryReport`

New `APIView` in `reports/views.py`, registered at
`/reports/fisherfolk-stocking-history/` in `reports/urls.py`, same
`[IsAuthenticated, IsAdminOrEvaluator]` permission as `FarmerCropHistoryReport`.
Mirrors its structure directly:

- Query params: `fisherfolk`, `species` (substitutes `crop_type`), `barangay`,
  `season`, `year`, `format`.
- `StockingRecord.objects.select_related('fisherfolk', 'species').prefetch_related('logs', 'harvests').order_by('-date_stocked')`,
  filtered by each param when present (`fisherfolk_id`, `species_id`,
  `pond_location_barangay__iexact` with a `fisherfolk.barangay` fallback exactly like
  crop's `_barangay()` helper, `season`, `year`).
- Field substitutions vs. crop: `farmer.full_name` → `fisherfolk.full_name`,
  `crop_type.name` → `species.species_name`, `variety_used` → `culture_type`,
  `date_planted` → `date_stocked`, `activity_logs`/`rec.activity_logs` →
  `logs` (`FisheriesActivityLog`, fields `activity`/`date_of_activity`),
  `harvest_records` → `harvests` (`FisheriesHarvestRecord`, fields
  `quantity_kg`/`harvest_date` — one date, not a start/end pair, so
  `harvest_end_date` is always `null` in the JSON; the frontend's existing
  `h.harvest_end_date && h.harvest_end_date !== h.harvest_start_date` conditional
  already handles that correctly without changes). No `actual_harvest_date` equivalent
  exists on `StockingRecord` (confirmed — crop's `CropMonitoringRecord.actual_harvest_date`
  has no fisheries counterpart), so that JSON key is simply omitted rather than
  fabricated.
- `row_data()` columns (PDF/Excel):
  `['Fisherfolk', 'Barangay', 'Species', 'Culture Type', 'Date Stocked', 'Status', '# Act', 'First Activity', 'Last Activity', '# Harvests']`.
- JSON summary: `total_stockings`, `total_harvests`, plus
  `fisherfolk_total_activities`/`fisherfolk_stockings_harvested` (status `Harvested`)
  when a `fisherfolk` filter is active — same conditional-summary pattern as crop's
  `farmer_total_activities`/`farmer_crops_harvested`.
- PDF via `_build_pdf` (reusing `build_official_header`, `build_stats_row`,
  `build_ledger_table`, `build_signature_block`, `NumberedCanvas`, `_finish_pdf`,
  `_sig_params`, `PAGE_WIDTH`, `LOGO_PATH` — all already imported/available in
  `reports/views.py`), title "Fisherfolk Stocking History Report".
- Excel via `_build_excel` (openpyxl, same header-row/styling structure as crop's),
  sheet title "Fisherfolk Stocking History", activity-timeline and harvest-detail text
  columns appended same as crop's `Activity Timeline`/`Harvest Details` columns.
- Filenames: `fisherfolk_stocking_history_report_<date>.{pdf,xlsx}`.

### Frontend: new `FisherfolkStockingHistoryTab`

New component in `Reports/ReportsPage.jsx`, added to the `TABS` array as
`{ id: 'fisherfolk_stocking_history', icon: Fish, label: 'Fisherfolk Stocking History' }`
(reuses the `Fish` icon already imported for the Fisheries Production tab).

- New `FisherfolkFilterSearch` component: direct copy of `FarmerFilterSearch`, hitting
  `/fisheries/fisherfolk/?search=` instead of `/farmers/?search=`. Confirmed the
  fisherfolk list endpoint already returns `full_name` and `barangay` directly
  (`fisheries/serializers.py:96`, `FisherfolkListSerializer`), so no shape mismatch.
- Filters: fisherfolk search, species select (populated from `/fisheries/species/`,
  already used elsewhere in `FisheriesRecordsPage.jsx`), barangay (`BarangaySelect`),
  season, year — 1:1 substitution of crop's `crop_type` → `species`, everything else
  identical. (Deliberately not adding a `culture_type` filter on top — the brief calls
  for the exact same structure, not new filter dimensions the crop side doesn't have.)
- Summary tiles: "Stocking Records in Scope" / "Total Harvests" always shown; "{name}'s
  Total Activities" / "Stockings Harvested" shown when a fisherfolk is selected —
  same 2-vs-4-tile grid logic as crop's tab.
- Preview table columns:
  `['', 'FISHERFOLK', 'BARANGAY', 'SPECIES', 'CULTURE TYPE', 'DATE STOCKED', 'STATUS', '# ACT', 'FIRST ACT', 'LAST ACT', '# HARVESTS', 'TOTAL HARVESTED (KG)']`.
  Same expand/collapse row behavior (click row → toggle `expanded` Set → show Activity
  Timeline + Harvest Records detail panel), same `totalHarvested()` reducer pattern
  over `rec.harvests`.
- Export: same `SignatureModal` + `showSig`/`sigPurpose` state + `downloadFile` flow as
  crop's tab, filenames as above.
- Sidebar: add
  `{ to: "/reports?tab=fisherfolk_stocking_history", icon: Fish, label: "Fisherfolk Stocking History" }`
  to `REPORTS_GROUP.items` in `components/Layout/Sidebar.jsx`, matching the existing
  `farmer_crop_history` entry's placement/convention.

## Non-goals / explicitly out of scope

- No backend/database schema changes in either task (re-confirmed against the real
  model files: `StockingRecord`, `FisheriesActivityLog`, `FisheriesHarvestRecord` all
  already have every field needed). No migration, no mysqldump backup required.
- No shared-util extraction for `getCropDisplayStatus`/`getStockingDisplayStatus` —
  kept as independent per-domain copies, matching existing codebase convention.
- No new filter dimensions beyond what the crop-side patterns already have.
- Task 2 targets `FarmerCropHistoryTab`/`FarmerCropHistoryReport` as the mirrored
  pattern, not `Citizen/FarmerCropHistoryView.jsx` (see Context section).

## Testing plan

Both tasks live-tested in-browser against real data (per standing project
convention — code compiling is not sufficient):

1. **Task 1**: Load Fisheries Records, filter by each of Due Harvest / Ready for
   Harvest / Overdue against real `Near Harvest` stocking records with
   `expected_harvest_date` values spanning the three windows; confirm pill label,
   tone, and filter results match `getStockingDisplayStatus`'s thresholds with no gap
   or overlap at the day-0 and day-(-7) boundaries.
2. **Task 2**: Load Reports → Fisherfolk Stocking History, search a real fisherfolk
   with actual stocking/activity/harvest history, verify summary tiles, expandable
   table rows (timeline + harvest detail), and a real PDF and Excel download each
   open correctly with the expected data.
