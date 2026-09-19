# Crop Cycle Trend + Growth-Stage Input Recommendation (Fisheries → Crop)

Date: 2026-09-19

## Context

Two fisheries-only features have no crop equivalent: `StockingRecord.compute_production_cycle_no()`
(repeat-stocking cycle numbering, feeding a "Cycle Trend" chart) and
`SpeciesOption.growth_stage_for_day()` / `StockingRecord.compute_growth_stage()` /
`compute_recommended_feed_type()` (day-threshold growth staging with a matching feed
recommendation). Unlike the earlier fisheries-harvest-split spec, these are **not**
mechanical ports — crops and fish don't grow the same way, and the crop side has no
1:1 equivalent to copy. This design was reached by querying the real, live
`oma_aringay_db` database directly (not the review-export file) and reading git
history for provenance, per explicit instruction. All real-data findings below are
from that live database as of 2026-09-19.

## Task 1 — Crop Cycle Trend (repeat plantings)

### Real-data investigation

- `StockingRecord.compute_production_cycle_no()` groups strictly by
  `(fisherfolk_id, species_id)` — it does **not** include `pond`, even though
  `StockingRecord.pond` is a real, often-populated FK. The literal mirror of the real
  precedent is farmer+crop_type, not farmer+crop_type+parcel.
- `CropMonitoringRecord.farm_parcel` (nullable FK to `FarmParcel`) is **0/1921 (0%)**
  populated in real data, despite being exposed in the Add/Edit Crop Monitoring form.
  A parcel-based grouping would ship empty today.
- Repeat-planting distribution, `(farmer_id, crop_type_id)`, all 1921 records:
  `1 planting → 1911 pairs, 2 plantings → 5 pairs, 3+ → 0 pairs.` Fisheries'
  `(fisherfolk_id, species_id)`: `1 → 5, 2 → 7, 3 → 1` (13 pairs, 61% repeat, vs.
  crops' 0.26%).
- That gap is mostly a data-collection artifact, not an agronomic fact: **1901 of
  1921 crop records (99%) were entered on a single day, 2026-09-12** — a one-time
  bulk historical-registry import (confirmed against commit `ff4d9ff`'s own
  description of this exact batch). Excluding that day, the "organic" subset is 20
  records / 17 pairs, of which 3 repeat (17.6%) — much closer to the fisheries rate.
  1906/1921 records (99.2%) are Corn (Mais).
- The 5 real repeat pairs (Santos/Palay, Reyes/Corn, Santiago/Corn, Udaundo/Corn,
  Fontanilla/Corn) are real, usable data for this feature once built — thin, but
  genuine, and the backend gate below (`len(buckets) >= 2 and total_n >= 3`) is
  satisfiable by them today.

**Decision: Option A — group by `(farmer_id, crop_type_id)` only.** It's the literal
mirror of the real fisheries precedent (which itself ignores pond/location), it's the
only grouping today's real data can support (`farm_parcel` is unused in practice), and
it has real, if thin, data to exercise it.

### Backend changes

All mirror the fisheries implementation function-for-function, kept as independent
per-domain copies (this codebase's established convention — see the September 19
fisheries-harvest-split spec's same choice for `getCropDisplayStatus`).

1. `CropMonitoringRecord.compute_crop_cycle_no()` in `production/models.py`, copying
   `StockingRecord.compute_production_cycle_no()`'s body with `farmer_id`/`crop_type_id`
   in place of `fisherfolk_id`/`species_id`, and `date_planted` in place of
   `date_stocked`.
2. `CropMonitoringRecordSerializer` (`production/serializers.py`): add
   `crop_cycle_no = serializers.SerializerMethodField()` +
   `get_crop_cycle_no(self, obj): return obj.compute_crop_cycle_no()`, mirroring
   `StockingRecordSerializer.production_cycle_no` exactly (`fisheries/serializers.py:786,870`).
3. `_analyze_crop(rec)` in `production/views.py:1118`: add
   `'crop_cycle_no': rec.compute_crop_cycle_no()` to its returned dict, mirroring
   `_analyze_stocking`'s `'production_cycle_no'` key.
4. New `_crop_cycle_trend_note(analyzed)` helper in `production/views.py`, a direct
   copy of `fisheries/views.py:1817`'s `_cycle_trend_note()` reading `crop_cycle_no`
   instead of `production_cycle_no` — same bucketing (`1 / 2 / 3+`), same gate
   (`len(buckets) >= 2 and total_n >= 3`), same "descriptive only, never a claim about
   why" framing.
5. `YieldAnalysisSummaryView.get()` (`production/views.py:1183`): add
   `'cycle_trend': _crop_cycle_trend_note(analyzed)` to the response, mirroring
   `FisheriesYieldAnalysisSummaryView`'s identical addition
   (`fisheries/views.py:1908-1914`).
6. `YieldAnalysisReport` (`reports/views.py:2528`, the PDF/Excel export counterpart):
   add the same `crop_cycle_no`/cycle-trend wiring `FisheriesYieldAnalysisReport`
   already has (detail-row `Cycle #` column, PDF/Excel cycle-trend block), mirroring
   `reports/views.py:2741-2955`.

### Frontend changes

`oma-frontend/src/pages/Forecasting/ForecastingPage.jsx` — currently has an
`AggregatePanel` (barangay/crop_type toggle) with no cycle-trend prop at all (confirmed
by reading the file; `FisheriesForecastingTab.jsx`'s `AggregatePanel` is the only one
with `cycleTrend`).

1. Add `cycleTrend` state, populated from the (now-extended) `/production/yield-analysis/summary/`
   response, mirroring `FisheriesForecastingTab.jsx:680,726` (`setCycleTrend(r.data.cycle_trend || null)`).
2. Pass `cycleTrend` into `AggregatePanel` and render the same "Cycle Trend (Repeat
   Plantings)" block (title substituted) as `FisheriesForecastingTab.jsx:492-509` —
   identical markup, same descriptive-disclaimer copy adapted to "farmer and crop
   type."
3. Add a `Cycle #` column to the per-record detail table (`ForecastingPage.jsx:709`'s
   header row and its matching cell), mirroring `detail_headers`'s `'Cycle #'` /
   `a['production_cycle_no']` in `reports/views.py:2788,2798` — this is the natural
   per-row counterpart sitting next to the same aggregate chart, not a separate
   feature.

## Task 2 — Growth-stage input recommendation (mechanism only)

**Scope, exactly as approved:** build the mechanism (schema + computation + admin
surfaces to configure it), seeded with **no invented agronomic values**. Real
day-thresholds and real fertilizer-per-stage guidance are explicitly out of scope
here — Corn's thresholds are the subject of a separate, following research task using
the `days_to_harvest`-precedent sourcing standard.

### Real-data investigation

- `CropMonitoringRecord.current_growth_stage` already has a real, established choice
  vocabulary (`Land Preparation / Planted / Vegetative / Flowering / Fruiting /
  Maturity / Near Harvest / Harvested`) but is **100% blank — 0 of 1921 real
  records** have it set, and it has no per-record UI entry point at all (its only
  frontend usage, `EncodeBarangayReportModal.jsx`/`BarangayCropDetailModal.jsx`, is an
  unrelated barangay-aggregate report, a different model). A computed version
  conflicts with no existing manual workflow.
- `SpeciesOption.fingerling_start_day/juvenile_start_day/adult_start_day` are
  nullable, seeded NULL, with an explicit in-code comment: *"nothing is fabricated as
  a default, same discipline as DiseaseResponseGuide being seeded empty."* `FeedType`
  itself ships with only 2 "PROVISIONAL generic" starter rows, explicitly not real
  per-species formulations. Fisheries never solved "what are the real numbers" either
  — it built the mechanism and deferred real values to BFAR/OMAg staff via admin.
- `CropActivityStage` (200 real rows / 20 crop types, seeded in migration
  `0023_seed_activity_stages.py`) looks superficially similar but is structurally
  different — its `stage_name` values are farm **tasks** ("Fertilizer Application,"
  "Pest Control," "Harvesting"), not phenological stages, and its `recommendation`
  free text carries fertilizer specifics (e.g. *"Apply 14-14-14 NPK basal, 1-2
  bags/ha"*) repeated near-verbatim across unrelated crops, with **no source
  citation** — unlike `f85037b`'s `CropVariety.days_to_harvest`, which explicitly
  cited PhilRice/PSA/PCAARRD/university extension/seed catalogs per variety and
  flagged a real naming ambiguity. This data does not meet this project's later,
  established sourcing bar and is **not** reused as ground truth here.
- `FarmInputLog` (`production/models.py:772`) already has a real, usable
  `INPUT_TYPE_CHOICES` taxonomy (`Fertilizer / Pesticide / Herbicide / Fungicide /
  Other`) but 0 real rows and zero frontend usage anywhere — dead backend
  scaffolding, reused here only for its vocabulary, not its (nonexistent) data.
- 1906/1921 real records (99.2%) are Corn — the highest-value (and effectively only
  real) target for the follow-up sourced-research task.

### Backend changes

1. `CropType` (`production/models.py`): add nullable
   `vegetative_start_day` / `flowering_start_day` / `fruiting_start_day` /
   `maturity_start_day` (`PositiveIntegerField(null=True, blank=True)`), mirroring
   `SpeciesOption.fingerling_start_day` et al. exactly, including the same
   "left unconfigured means unavailable, nothing fabricated" comment.
2. `CropType.growth_stage_for_day(self, days_since_planting)`, mirroring
   `SpeciesOption.growth_stage_for_day()`: returns `None` if any threshold is unset;
   otherwise maps onto the **existing** `CropMonitoringRecord.GROWTH_STAGE_CHOICES`
   subset that a day-count can actually classify (`Vegetative / Flowering /
   Fruiting / Maturity` — `Land Preparation/Planted/Near Harvest/Harvested` stay
   event-driven, not day-threshold-driven, matching how fish's `Fry` stage is
   likewise the day-0 default before any threshold applies).
3. `CropVariety`: add nullable per-stage day overrides
   (`vegetative_start_day`/etc.), mirroring its own existing `days_to_harvest`
   override-the-crop-type pattern — same nullable-means-"use crop type's own value"
   semantics already established there.
4. `CropMonitoringRecord`: add `days_since_planting` property (mirrors
   `days_since_stocking`) and `compute_growth_stage()` method (mirrors
   `compute_growth_stage()`), consulting the variety override first, then the crop
   type, exactly matching `CropVariety.days_to_harvest`'s own fallback order.
5. New `CropInputType` model in `production/models.py`, mirroring `FeedType`:
   `name`, `description`, `is_active`, `crop_types` (M2M to `CropType`, blank = any
   crop — mirrors `FeedType.species_options`), `input_type` (reusing
   `FarmInputLog.INPUT_TYPE_CHOICES`, not inventing a new vocabulary), `growth_stage`
   (blank = any stage, choices restricted to the 4 day-threshold-derived stages
   above). **Seeded empty — zero rows, no migration data.** OMAg/DA staff populate it
   via admin, same as `FeedType`.
6. `CropMonitoringRecord.compute_recommended_input()`, mirroring
   `compute_recommended_feed_type()`: `None` if stage unknown; otherwise the active
   `CropInputType` tagged for this record's crop type + current stage, falling back
   to a stage-agnostic (`growth_stage=''`) entry for the crop type.
7. `CropMonitoringRecordSerializer`: add `growth_stage` (SerializerMethodField →
   `compute_growth_stage()`), `recommended_input_type_id`/`recommended_input_type_name`
   (SerializerMethodField → `compute_recommended_input()`), mirroring
   `StockingRecordSerializer`'s identical `growth_stage`/`recommended_feed_type_*`
   fields (`fisheries/serializers.py:876-884`) field-for-field.

### Frontend changes

1. `oma-frontend/src/pages/CropOption/CropOptionPage.jsx` (the `CropType` settings
   page, under `CropSettings/CropSettingsHub.jsx` — confirmed as the direct crop-side
   counterpart of `FisheriesSettings/SpeciesOptionPage.jsx`): add the 4 new
   Vegetative/Flowering/Fruiting/Maturity day-input fields to the crop-type edit
   form, mirroring `SpeciesOptionPage.jsx`'s existing fingerling/juvenile/adult-day
   fields (same layout, same "leave blank = not yet configured" empty-state).
2. New `CropInputTypePage.jsx` under `CropSettings/CropSettingsHub.jsx`, a direct
   structural copy of `FisheriesSettings/FeedTypePage.jsx` (list/add/edit/toggle-active
   for `CropInputType`, crop-type + growth-stage tagging UI).
3. Activity-log form inside `CropMonitoringPage.jsx` (the crop side has no separate
   modal file the way fisheries has `StockingMonitoringModals.jsx` — this logic lives
   inline): when the selected `activity_type` corresponds to an input-application
   activity (e.g. "Fertilizer Application" — matched the same way the existing
   `harvestGateInfo`/activity-suggestion code already keys off `activity_type`
   strings), show the same inline hint pattern as
   `StockingMonitoringModals.jsx:757-760`: *"{growth_stage} stage — recommended:
   **{recommended_input_type_name}** [Use this]"*, shown only when it differs from
   whatever the user already has entered, with a one-click autofill — same
   conditional, same button behavior, crop fields substituted for fish fields.

## Non-goals / explicitly out of scope

- **No real agronomic values in this spec** — no invented day-thresholds, no invented
  fertilizer-per-stage recommendations, no reuse of `CropActivityStage`'s uncited
  `recommendation` text as if it were vetted. Every new nullable field/model here
  ships empty, exactly like `SpeciesOption`'s thresholds and `FeedType`'s seed data.
- Real Corn growth-stage thresholds are a **separate follow-up task**, done after this
  mechanism lands, using the same sourcing discipline as `f85037b`
  (PhilRice/PSA/PCAARRD/DA/university extension, cited, anything unconfirmed flagged
  rather than guessed) — not part of this spec's implementation.
- No changes to `CropActivityStage` or the existing Activity Suggestion Engine — the
  new mechanism is additive and independent; `CropActivityStage`'s sourcing quality
  is flagged for awareness, not remediated here (out of scope for this task).
- No cycle-number column added to the main Crop Records/Monitoring list table
  (`CropMonitoringPage.jsx`) — the approved scope was the Cycle Trend *chart* and its
  own detail table (Forecasting/Yield Analysis), matching what was actually asked
  about (`FisheriesForecastingTab.jsx`), not the separately-scoped main records list.
- No schema changes beyond what's listed above; all new fields are nullable/optional,
  all new models start empty — no backfill migration, no mysqldump backup required
  per standing project convention (re-confirmed: nothing here touches existing data).

## Testing plan

1. **Task 1**: live-test Forecasting → Yield Analysis with real data — confirm the 5
   real repeat-planting pairs produce a real, correct Cycle Trend block (cycle 1 vs.
   cycle 2 average variance, counts matching the live-DB query above), confirm the new
   `Cycle #` detail column matches `compute_crop_cycle_no()`'s real output per record,
   confirm PDF/Excel export includes the same data.
2. **Task 2**: live-test with disposable test data (create a test `CropType` with all
   4 thresholds configured and a test `CropInputType` tagged to a stage) — confirm
   `compute_growth_stage()`/`compute_recommended_input()` return correctly at each
   threshold boundary, confirm the `CropOptionPage.jsx` and new `CropInputTypePage.jsx`
   admin screens work end-to-end, confirm the activity-log hint appears/autofills
   correctly and disappears once the two values match, confirm every *real* crop
   record still returns `growth_stage: null` / `recommended_input_type_id: null`
   (since real `CropType` rows have no thresholds configured) — proving nothing here
   silently fabricates a stage or recommendation for real data. All test data (crop
   type, input type, monitoring record) cleaned up and confirmed at zero after.
