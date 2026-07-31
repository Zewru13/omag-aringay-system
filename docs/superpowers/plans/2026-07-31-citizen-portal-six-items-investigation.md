# Citizen Portal — Six Work Items: Investigation & Roadmap

> **Status: INVESTIGATION ONLY. No code was changed in this pass.**
>
> **Scope note (writing-plans "Scope Check"):** these six items are independent
> subsystems. Per the skill's own guidance they should NOT share one
> implementation plan. This document is the investigation record plus a
> per-item approach sketch; each item gets its own bite-sized TDD plan
> written at the start of its own execution cycle, once the open questions
> below are answered.

**Investigated:** 2026-07-31
**Backend:** Django + DRF, `oma_aringay/` (apps: accounts, farmers, fisheries, production, interventions, associations, core, reports, monitoring, auditlog)
**Frontend:** React + Vite + Tailwind **v4**, `oma-frontend/`
**Live DB probed:** MariaDB via XAMPP, read-only queries only

---

## Global facts established (apply to several items)

| Fact | Evidence |
|---|---|
| Roles are `ADMIN`, `EVALUATOR`, `CITIZEN` only | `accounts/models.py:6-12` |
| A CITIZEN is linked to exactly one of 4 record types via `(linked_record_type, linked_record_id)` | `accounts/models.py:55-58` |
| Type-safe accessors exist and must be used for scoping | `get_linked_farmer_id()` / `get_linked_fisherfolk_id()`, `accounts/models.py:81-96` |
| Account population | 5 ADMIN, 8 EVALUATOR, **4274 CITIZEN** (3392 FARMER, 874 FISHERFOLK, 7 FARMERS_ORG, 1 FISHERFOLK_ORG) |
| Domain rows | 3567 Farmer, 873 Fisherfolk, 18 CropMonitoringRecord, 21 StockingRecord, 20 Pond |
| Farmer/Fisherfolk citizen screens do **not** use `PageLayout`/`Sidebar` | `CitizenScreen` shell, `pages/Citizen/citizenUI.jsx:71-79` |
| Tailwind v4 — **no `tailwind.config.js`**; tokens live in `@theme{}` in `src/index.css` | citizen tokens are the `cz-*` namespace |
| Known cascade trap: unlayered `button,input,select,textarea{font:inherit}` in `index.css` beats `@layer utilities` | documented at `pages/Citizen/citizenUI.jsx:18-25`; button labels must be wrapped in `<span>` |

---

## ITEM 1 — Mobile-first responsive layout (Farmer / Fisherfolk / Organization)

### Confirmed locations

| Thing | Location |
|---|---|
| Citizen route entry | `App.jsx:77-84` → `/my-account`, `allowedRoles={["CITIZEN"]}` |
| Role fork | `pages/Citizen/CitizenHomePage.jsx:64-69` |
| Farmer screen (already mobile-first) | `pages/Citizen/FarmerHomeScreen.jsx` |
| Fisherfolk screen (already mobile-first) | `pages/Citizen/FisherfolkHomeScreen.jsx` |
| Shared mobile shell | `pages/Citizen/citizenUI.jsx` — `CitizenScreen`, `max-w-[340px] sm:max-w-[380px]` |
| **Organization screen (NOT mobile-first)** | `CitizenHomePage.jsx:71-131` — `max-w-4xl`, `sm:grid-cols-2` |
| Staff sidebar (accordion) | `components/Layout/Sidebar.jsx:244` (`open` state), `:334` (`md:hidden` scrim), `:344-348` (off-canvas drawer) |

### Mismatch from the brief

1. **Farmer and Fisherfolk are already done.** Batches E/F plus the visual re-skin (commit `c5a3f1b`) rebuilt both as phone-shaped columns at every breakpoint, with 44px touch targets enforced throughout. Re-doing them is not the work.
2. **The accordion sidebar is a non-issue for Farmer/Fisherfolk** — those screens never mount `Sidebar` or `PageLayout` at all. And the staff sidebar is *already* an off-canvas hamburger drawer below `md` (`-translate-x-full md:translate-x-0`), so it isn't desktop-only either. No bottom-nav decision is actually forced by the current code.
3. **The real item-1 gap is elsewhere**, in three places:
   - **Organization citizens** still get the pre-Batch-E desktop layout (`max-w-4xl` centred card, 2-col grid, horizontally scrolling tab strip).
   - **Three data tables have no mobile fallback beyond `overflow-x-auto`**, and they render *inside* the 340px citizen column:
     - `MyYieldAnalysisSection.jsx:28-60` — 6 columns
     - `MyAssistanceHistorySection.jsx:26-47` — 4 columns
     - `MyOrgReportingSection.jsx:131-164` — 5 columns
   - `MyOrgReportingSection` / `MyAssistanceHistorySection` / `MyYieldAnalysisSection` still use the **staff** palette (`#E2E8E2`, `#7A8E7A`, `#1A2B1A`) rather than `cz-*` tokens, so the two secondary Farmer/Fisherfolk views visibly break style with their own home screen.

### Open questions

- **Q1.1** Organization accounts: re-skin to the same `CitizenScreen` phone column as Farmer/Fisherfolk, or leave desktop-width (only 8 org accounts exist, and their job is bulk member reporting which is plausibly a desktop task)?
- **Q1.2** For the three tables — convert to stacked cards on mobile, or keep the table and only restyle to `cz-*` tokens?

### Approach sketch

Cycle 1a: convert the three shared sections to `cz-*` tokens + a card-list layout below `sm`, reusing `citizenUI.jsx` primitives. Cycle 1b (gated on Q1.1): Organization home screen. No API changes in either.

---

## ITEM 2 — Editable profile

### Confirmed locations

| Thing | Location |
|---|---|
| Existing self-service endpoint | `GET`/`PATCH /accounts/me/` — `accounts/views.py:263-277`, `permission_classes = [IsAuthenticated]` |
| Read serializer | `UserSerializer`, `accounts/serializers.py:20-52` (already returns `linked_record` for citizens) |
| Write serializer | `MeUpdateSerializer`, `accounts/serializers.py:132-140` — **only** `full_name`, `contact_number`, `email` |
| Existing UI | `pages/Profile/ProfilePage.jsx` |
| Route | `App.jsx:85-92` — `/profile`, `allowedRoles={["ADMIN","EVALUATOR"]}` |
| Farmer profile fields | `farmers/models.py:40-84` |
| Fisherfolk profile fields | `fisheries/models.py:62-132` |
| Media config | `settings.py:131-133` — `MEDIA_URL`/`MEDIA_ROOT` set; `urls.py:39` serves it **only under `DEBUG`** |

### Mismatch from the brief

1. **A reusable self-service endpoint already exists** (`/accounts/me/`) and citizens can already call it — but it edits the **`User`** row, not the Farmer/Fisherfolk/Organization row. Everything a citizen would actually recognise as "my profile" (barangay, RSBSA/FishR number, birthdate, civil status, ponds/parcels) lives on the domain record and has **no** self-service write path. The admin-only paths are the staff CRUD views in `farmers/views.py` / `fisheries/views.py`.
2. `ProfilePage.jsx:198-200` hardcodes the role pill to `ADMIN ? "Admin" : "Evaluator"` — a CITIZEN would render as "Evaluator". The page is not currently reachable by citizens, but it is not citizen-safe either.
3. **No avatar/photo field exists anywhere** — zero `ImageField`/`FileField` in the entire backend. Photo upload is genuinely new work: Pillow dependency, model field + migration, multipart handling, **and** production media serving (`urls.py:39` only wires media under `DEBUG`, so `settings_production.py` has no media route at all). This is the single biggest complexity multiplier in item 2.
4. **Latent bug to avoid inheriting:** `MeUpdateSerializer` accepts `email` with **no** uniqueness validation and **no** `username` sync, whereas `UserUpdateSerializer` has both (`serializers.py:117-129`). Since citizens log in by RSBSA/org number, letting them PATCH `email` through this serializer risks a duplicate-email `IntegrityError` and a desynced `username`.

### Recommended editable / read-only split

| Field | Farmer | Fisherfolk | Organization | Rationale |
|---|---|---|---|---|
| `contact_number` | edit | edit | edit | Changes often, no downstream integrity |
| `civil_status`, `highest_education` | edit | edit | — | Self-declared, low risk |
| `is_pwd`, `is_4ps_beneficiary`, `is_icc_ip_member` | **read-only** | **read-only** | — | Drives assistance eligibility — self-editing is an integrity risk |
| `barangay`, `municipality` | **read-only** | **read-only** | **read-only** | Barangay is the de-facto scoping key across the whole app |
| `rsbsa_number` / `fishr_number` / `lgu_registration_number` | **read-only** | **read-only** | **read-only** | Login identifier + unique key |
| `first/middle/last_name`, `birthdate`, `gender` | **read-only** | **read-only** | — | Registry identity |
| `fisherfolk_type`, `farmers_organization` | — | **read-only** | — | Drives permission and log eligibility (`FishingTripLog.clean()`) |
| Parcels / ponds | **read-only** | **read-only** | — | Out of scope; ponds already have a staff CRUD path |

### Open questions

- **Q2.1** Is photo/avatar in scope, or deferred? (Recommend **deferred** — it is the only sub-item requiring a new dependency, a migration, and a production infrastructure change.)
- **Q2.2** Should a citizen be able to change their own `email`? They have none by design and don't log in with it. Recommend **no** (leaves `MeUpdateSerializer`'s missing-uniqueness bug untriggered rather than needing a fix).
- **Q2.3** Should edits apply immediately, or land in a staff review queue? The whole app treats the registry as authoritative; immediate self-edit is a policy change, not just a feature.

### Approach sketch

New `CitizenProfileView` (`GET`/`PATCH /accounts/me/profile/`) gated by a permission that resolves the caller's own linked record. Per-type serializers with the read-only split above enforced **server-side** (`read_only_fields`), not just by hiding inputs. New citizen-styled profile screen under `pages/Citizen/`; leave `/profile` staff-only and untouched.

---

## ITEM 3 — Remove "Recommendation Input" from Fisheries

### Confirmed locations

| Thing | Location |
|---|---|
| **The field** | `FisheriesActivityLog.recommendations` — `fisheries/models.py:614` (`TextField(blank=True)`) |
| Serializer exposure | `FisheriesActivityLogSerializer.fields`, `fisheries/serializers.py:408` |
| Staff/evaluator input | `pages/FisheriesRecords/StockingMonitoringModals.jsx:843-850` |
| Citizen input | `pages/Citizen/CitizenActivityLogModal.jsx:557-565` (shown only when activity = `Disease Control`) |
| Citizen payload write | `CitizenActivityLogModal.jsx:244` (written **unconditionally** for fisheries, so non-Disease-Control logs POST `recommendations: ''`) |
| Label | `pages/Citizen/labels.js:205` |
| Read-back display | `StockingMonitoringModals.jsx:997` |

### Confirmed: fisheries-only, not a shared component

`CropActivityLog` has **no** `recommendations` field. The crop side's similarly-labelled control (`CropMonitoringPage.jsx:830-833`, `CropMonitoringDetailModal.jsx:298` "Recommendations / Notes") writes to `CropActivityLog.notes`. Different component, different column — removing the fisheries field cannot affect farmers.

**Do not confuse with these other `recommendation` fields, none of which are in scope:**
`CropActivityStage.recommendation`, `SpeciesActivityStage.recommendation`, `DisasterResponseRule.recommendation`, `FisheriesDisasterResponseRule.recommendation`, `DiseaseResponseGuide.recommended_treatment`, `PestDiseaseReport.recommended_action`. These are staff-configured reference text that *feeds* the form; they are not the input being removed.

### Backend data — measured, not assumed

| Metric | Value |
|---|---|
| `FisheriesActivityLog` rows total | 401 |
| Rows with non-empty `recommendations` | **327** |
| …verbatim copies of a `SpeciesActivityStage.recommendation` (seed script `seed_fisheries_demo_data.py:407`) | **316** |
| …carrying the explicit `SEED_TAG` (`seed_fisheries_demo_data.py:510`) | **11** |
| …**human-authored** | **0** |

Every single populated row is machine-generated by the demo seeder. In *this* database, a hard delete destroys nothing real.

### Blocking finding — the field is load-bearing

`StockingMonitoringModals.jsx` reuses this one textarea for two purposes:

```
line 845:  {showRemedyFields ? 'Remedy Performed *' : 'Recommendations'}
line 512:  if (!recommendations.trim()) { showToast('Please describe the remedy performed.', 'error'); return }
```

When `activity === 'Disaster Remedy'` (`:410`) it becomes a **mandatory** "Remedy Performed" input and is the only place that text is captured. Deleting the column outright would break the evaluator disaster-remedy flow.

(For context: `activity='Disaster Remedy'` currently has **0** rows — the code path exists but is unexercised in data.)

### Hide-only vs. full removal — the tradeoff

| | Hide-only (frontend) | Full removal (FE + serializer + model + migration) |
|---|---|---|
| Effort | ~1 hour | ~half day + migration + backup |
| Reversible | Yes | No (327 rows dropped) |
| Leaves dead column | Yes | No |
| Breaks Disaster Remedy | No | **Yes**, unless a replacement field is added first |
| Risk to prod data | None | Depends on prod contents — **this DB is not prod** |

**Recommendation: hide-only from the citizen form now**, and treat the full column drop as a separate follow-up gated on Q3.2.

### Open questions

- **Q3.1** Does "remove from Fisheries accounts" mean *citizen* fisherfolk accounts only, or the evaluator fisheries form too? The phrase "Fisheries accounts" reads as citizen-side, but the evaluator form is where the field is actually used.
- **Q3.2** If full removal is wanted: what replaces the mandatory "Remedy Performed" capture — a new dedicated `remedy_performed` column, or fold it into `treatment_applied`?
- **Q3.3** Has this dev database ever been loaded from a production dump? The "0 human-authored rows" finding is a statement about this database only.

### Approach sketch

Cycle 3a (safe, unblocked): drop the `recommendations` `FieldBlock` from `CitizenActivityLogModal.jsx`, stop writing the key at `:244`, remove the label. No backend change. Cycle 3b (gated on Q3.1/Q3.2/Q3.3): the evaluator form and the column drop, with a fresh DB backup first.

---

## ITEM 4 — Consistent validation across farmer, fisherfolk, and evaluator

### 4a — No backdating before the start date

**Fisheries start-date field confirmed:** `StockingRecord.date_stocked` (`fisheries/models.py:432`). Not "date stocked" as a display string — the column is `date_stocked`.

| Layer | Crop | Fisheries |
|---|---|---|
| Backend rule | `production/serializers.py:222-233` | `fisheries/serializers.py:446-457` |
| Escape hatch | `CropActivityStage.allows_pre_planting` (`production/models.py:120`) — **25 of 200** stages | `SpeciesActivityStage.allows_pre_planting` (`fisheries/models.py:272`) — **6 of 41** stages |
| Future-date guard | `production/serializers.py:194-197` | `fisheries/serializers.py:419-422` |
| Evaluator frontend `min` | — | `StockingMonitoringModals.jsx:667` (`min={allowsPrePlanting ? undefined : record.date_stocked}`) |
| **Citizen frontend `min`** | **absent** | **absent** |

**Mismatch from the brief:** the assumption was that this validation is evaluator-only and must be *added* for citizens. It is not — it lives in the **serializer**, and citizens post through the same serializers (`StockingActivityLogListCreateView`, `fisheries/views.py:521-523`; the crop equivalent in `production/views.py`). It is therefore **already enforced identically for all three account types, and is not bypassable from the frontend.**

The actual gap is **UX symmetry, not security**: `CitizenActivityLogModal.jsx:346-354` sets `max={todayISO()}` but no `min`. Worse, the "Yesterday" shortcut (`:193`) can silently produce a date before `date_planted`/`date_stocked` — the citizen only discovers this as a raw 400 surfaced through the generic error toast at `:256-260`.

- **Q4a.1** Should the citizen date picker hard-block pre-start dates (`min=`), or allow selection and show an inline explanation? Hard-blocking is simpler but the `allows_pre_planting` exception makes it activity-dependent, which means fetching the stage list into the citizen screen — the citizen form does not currently load `CropActivityStage`/`SpeciesActivityStage`.

### 4b — Area affected must not exceed registered area

| Layer | Crop | Fisheries |
|---|---|---|
| Activity log, backend | `production/serializers.py:240-253` | `fisheries/serializers.py:464-477` |
| Disaster report, backend | `production/serializers.py:297-310` | `fisheries/serializers.py:521-534` |
| Citizen frontend | `CitizenActivityLogModal.jsx:182-188` | same function |
| Evaluator frontend | `CropMonitoringPage.jsx` | `StockingMonitoringModals.jsx:414-422` |

Registered-area source: `CropMonitoringRecord.area_planted_ha` vs `StockingRecord.area_hectares` (which `save()` syncs from `Pond.area_hectares`, `fisheries/models.py:477-481`).

**Confirmed gap — fisheries only.** Every cap is written as `if stocking_record.area_hectares and ...`. `StockingRecord.area_hectares` is **nullable** (`models.py:433`), so a NULL area makes the guard fall through silently — backend *and* frontend (`CitizenActivityLogModal.jsx:167` yields `plantedArea = null`, and `validateAreaAffected` then skips the cap).

Measured: **2 of 21 StockingRecords have `area_hectares` NULL**; **1 of 20 Ponds has `area_hectares` NULL**. Crop side: `area_planted_ha` is non-nullable and **0 of 18** records are NULL, so crop is fully covered.

- **Q4b.1** For a stocking record with no recorded area: reject the area-affected entry with "pond area not recorded — ask OMAg staff to set it", or accept it uncapped as today?

### 4c — Standardized dropdowns instead of free text

| Field | Domain | Current input | Reference table? |
|---|---|---|---|
| `feed_type` | Fisheries | `ComboboxWithOther` from `/fisheries/feed-types/?species=` (`CitizenActivityLogModal.jsx:460-470`) | **`FeedType`** + `species_options` M2M (`fisheries/models.py:291-306`) |
| `disease_type` | Fisheries | Evaluator: `ComboboxWithOther` from `/fisheries/disease-types/?species=` (`StockingMonitoringModals.jsx:389`). **Citizen: field is entirely absent** | **`DiseaseType`** + `species_options` M2M (`fisheries/models.py:314-330`) |
| `fertilizer_type` | Crop | free-text `<input>` (`CitizenActivityLogModal.jsx:387-393`; evaluator `CropMonitoringPage.jsx:528`) | **none exists** |
| `pest_disease_name` | Crop | free-text `<input>` (`CitizenActivityLogModal.jsx:424-430`) | **none exists** |

**Measured drift, already happening:**
- `FeedType` reference table holds exactly 2 rows: `Commercial Pellet Feed`, `Natural/Pond Feed`.
- Actual `FisheriesActivityLog.feed_type` values in the DB include `worm`, **`Commercial fellet`** (typo), `Commercial Pellets, 32% CP` — **none of which match either reference row.** The combobox has an "Other" branch and `feed_type` is a plain `CharField` with no FK, so free text wins.
- Crop free-text columns hold only demo values so far (`Demo`, `Pest Attack`) — the drift hasn't started there yet, which makes now the cheap moment to standardize.

**Confirmed parity gap:** the citizen fisheries `Disease Control` form (`CitizenActivityLogModal.jsx:495-567`) shows area / severity / mortality / vet / treatment / outcome / recommendations but **not** `disease_type` — so a fisherfolk logging a disease cannot categorize it at all, while an evaluator can, from the same `DiseaseType` list. This is straight drift between the two account types on the *same* activity.

**Where a 1:1 mapping should not be forced** (flagged for review as instructed): crop `pest_disease_name` and fisheries `disease_type` are not the same concept — the fisheries list is species-scoped aquatic pathology plus water-quality stress (`Poor Water Quality / Ammonia-Nitrite Stress` is one of the 5 seeded rows), while the crop equivalent spans insect pests *and* plant pathogens. Proposal: **parallel but domain-specific** reference models following the exact `DiseaseType` shape (name / description / is_active / `crop_types` M2M scoping), not a shared table.

- **Q4c.1** Add the missing `disease_type` dropdown to the citizen fisheries form? (Recommend **yes** — pure parity, reuses an existing endpoint and existing seeded data, no new model.)
- **Q4c.2** Create new crop reference models (`FertilizerType`, `CropPestDiseaseType`), each with a `crop_types` M2M and an admin settings page under `CropSettingsHub`? Who supplies the initial list — OMAg staff, or seed empty and let them populate?
- **Q4c.3** Keep the "Other" free-text escape hatch? Keeping it preserves field usability but is exactly what produced `Commercial fellet`. Suggest keeping it but adding a staff "unmatched values" review surface later.

### Item 4 approach sketch

Three genuinely separate cycles. 4a and 4b are small, backend-anchored, and unblocked once their single question each is answered. 4c is the largest — new models + migrations + settings UI + form rewiring on both sides of both domains — and should be split again into 4c-fisheries (parity only, no new models) and 4c-crop (new models).

---

## ITEM 5 — Self-service yield/analysis view

### Confirmed locations

| Thing | Location |
|---|---|
| Crop queryset + citizen scoping | `production/views.py:913-947` |
| Crop endpoint | `YieldAnalysisView`, `production/views.py:1046-1058` — `permission_classes = [IsAuthenticated]` |
| Crop aggregate (staff-only) | `YieldAnalysisSummaryView`, `production/views.py:1061-1062` — `[IsAuthenticated, IsAdminOrEvaluator]` |
| Fisheries queryset + citizen scoping | `fisheries/views.py:1182-1209` |
| Fisheries endpoints | `fisheries/urls.py:109-110` |
| Per-record analysis | `_analyze_crop()`, `production/views.py:1000-1043` |
| Activity completion | `_activity_completion()`, `production/views.py:950-997` |
| Citizen UI | `pages/Citizen/MyYieldAnalysisSection.jsx` |
| Mount points | `FarmerHomeScreen.jsx:106-114`, `FisherfolkHomeScreen.jsx:~164` |

### Mismatch from the brief

**This already exists and is already scoped.** Batch 11 built it; Batches E/F surfaced it. The question "can it be scoped down or does it need a separate query?" is already answered — it was scoped down, in place, with the aggregate view deliberately left staff-only.

### Data-access boundary — verified, no leak

```python
# production/views.py:919-931
if request.user.role == 'CITIZEN':
    farmer_id = request.user.get_linked_farmer_id()
    qs = qs.filter(farmer_id=farmer_id if farmer_id else -1)
```

Three properties confirmed by reading:
1. The citizen filter is applied **before** the query-param filters (`:932-946`), and all are chained `.filter()` → ANDed. A citizen passing `?farmer=999` gets `farmer_id=own AND farmer_id=999` = empty set. **No leak via query params.**
2. `get_linked_farmer_id()` returns `None` for any non-FARMER `linked_record_type`, so an org-linked or unlinked citizen falls to the unreachable `-1` sentinel rather than matching a same-numbered row in another table.
3. The fisheries mirror (`fisheries/views.py:1188-1196`) is structurally identical with `get_linked_fisherfolk_id()`.

### The actual remaining work

Presentation, not access control:
- `MyYieldAnalysisSection.jsx` renders a **6-column table** inside a **340px** column with only `overflow-x-auto` (overlaps item 1).
- It shows only the flat per-record row. The brief asks for **yield trend**, **expected vs actual variance**, and **harvest history** — of these, variance is already returned (`variance_kg`, `variance_pct`) and harvest dates are already returned (`harvest_dates`, `production/views.py:1014-1017`). **Trend over time is the only genuinely new thing**, and it needs no new query — it is the existing record list sorted by `date_planted`/`date_stocked`, which the endpoint already orders (`:947`, `:1209`).
- `missed_high_priority` and `activity_breakdown` are already returned and currently unused by the citizen UI — that's the "possible contributing factors" story, already computed.

- **Q5.1** Chart or no chart? A trend line means a charting dependency in the citizen bundle (the staff dashboard uses Recharts — check whether pulling it into the citizen route is acceptable) versus a hand-rolled inline SVG sparkline.
- **Q5.2** Should the citizen view surface `missed_high_priority`? It is already computed and already scoped, but it reads as "you missed these activities" — worth a wording decision given the endpoint's own disclaimer (`YIELD_ANALYSIS_DISCLAIMER`, `production/views.py:906-910`) explicitly says missed activities are *not* proven causes.

### Approach sketch

Frontend-only in the common case. Rebuild `MyYieldAnalysisSection` as citizen-styled cards + a variance summary + an optional sparkline, consuming the **existing** payload unchanged. No permission or queryset change. Re-verify the boundary with a disposable account regardless, since this touches a scoping-sensitive surface.

---

## ITEM 6 — Link farmer/fisherfolk/organization activity to their evaluator

### Confirmed finding: **no such link exists, in any form, for any account type**

Searched the whole backend for `assigned_evaluator`, `evaluator_id`, `assigned_to`, `reviewer`. Zero results outside role-string comparisons. Specifically:

- There is **no** evaluator-assignment FK on `Farmer`, `Fisherfolk`, `FarmersOrganization`, `FisherfolkOrganization`, `CropMonitoringRecord`, `StockingRecord`, `CropActivityLog`, or `FisheriesActivityLog`.
- There is **no** barangay-based evaluator scoping either. `IsAdminOrEvaluator` (`accounts/permissions.py:22-28`) is a flat role check — **every evaluator can see and act on every record in the municipality.** The `?barangay=` filters are user-chosen query params, not enforced scoping.
- The FKs that *do* exist — `recorded_by`, `logged_by`, `registered_by`, `reported_by`, `recovered_by` — record **who encoded a row**, i.e. an authorship trail. They are not assignment, are nullable, and are `SET_NULL` on user deletion.

So the brief's premise ("confirm the actual structure — assigned by barangay? association membership?") resolves to: **neither. There is nothing to confirm consistent, because nothing is implemented for any of the three submitting account types.** The item is a greenfield build, not a gap-fill.

### What currently routes staff attention

`core/notifications.py:10-43` — `notify_all_except(actor, ...)`:

```python
recipients = User.objects.filter(is_active=True)
if actor is not None:
    recipients = recipients.exclude(pk=actor.pk)
```

**No role filter.** Every activity log, harvest, and disaster report fans out one `Notification` row to every active user.

**Two problems this creates, both measured:**
1. **Correctness/privacy:** citizens are recipients. **74 notification rows are already addressed to CITIZEN recipients**, telling them about other people's records. (They are not currently *rendered* — `CitizenHomePage` doesn't mount `NotificationBell` — but the rows exist and the endpoint is role-agnostic.)
2. **Scalability:** with **4274 active citizen accounts**, a single citizen logging one activity attempts a `bulk_create` of ~4274 rows. `Notification` total today is 281, which means this has not yet been exercised at scale — but it will be the moment citizen accounts are used in earnest.

This is a pre-existing defect independent of item 6, surfaced by it. Flagging rather than fixing, per the investigation-only instruction.

### Design questions that must be answered before any code

- **Q6.1** What *is* an evaluator link, operationally? Three plausible models, materially different:
  - **(a) Barangay assignment** — `Evaluator ↔ barangay` (many-to-many; there are 8 evaluators and a fixed barangay list in `core/constants.py`). Derives the link for every record automatically from existing `barangay` / `farm_location_barangay` / `pond_location_barangay` columns. **No per-record FK, no backfill.** Cheapest and most robust.
  - **(b) Per-person assignment** — `Farmer.assigned_evaluator` / `Fisherfolk.assigned_evaluator` FK. Explicit, but needs a backfill decision for 3567 + 873 existing rows and an ongoing "who assigns new registrants" process.
  - **(c) Per-record/per-submission assignment** — a reviewer FK on each activity log. Most granular, most write-amplification, and implies a review *workflow* (pending/accepted/rejected) that does not exist anywhere in this codebase today.
- **Q6.2** Does "link" mean **routing** (this evaluator gets notified / sees it in a work queue) or **restriction** (this evaluator is the *only* one who may act on it)? Restriction is a substantially larger change — it means rewriting `IsAdminOrEvaluator` and every queryset that currently returns municipality-wide data, including reports and the dashboard.
- **Q6.3** Should organizations link the same way? An org spans multiple barangays by membership, so barangay assignment (a) does not map cleanly onto it — orgs may need their own rule.
- **Q6.4** Should the notification fan-out be fixed as part of this item (route to the linked evaluator instead of broadcasting), or as its own separate fix first?

### Approach sketch — deliberately not written yet

This item cannot be responsibly planned until Q6.1 and Q6.2 are answered; the three options differ by roughly an order of magnitude in scope, and option (c) implies building a review workflow that is currently absent. **Recommendation: answer Q6.1/Q6.2 first, then treat item 6 as its own brainstorming pass**, not a straight plan-and-execute cycle like the other five.

---

## Sequencing recommendation

| Order | Item | Why here | Blocked on |
|---|---|---|---|
| 1 | **4a** date `min` on citizen form | Smallest; backend already correct | Q4a.1 |
| 2 | **4b** null-area cap | Small, quantified, backend + frontend one-liner each | Q4b.1 |
| 3 | **3a** hide citizen recommendations input | Frontend-only, fully reversible | Q3.1 |
| 4 | **1a** citizen table/section re-skin | Unblocks item 5's presentation work | Q1.2 |
| 5 | **5** yield view rebuild | Depends on 1a's card primitives; no API change | Q5.1, Q5.2 |
| 6 | **4c-fisheries** add `disease_type` to citizen form | Parity, reuses existing endpoint/data | Q4c.1 |
| 7 | **2** editable profile | New endpoint + serializers; largest self-contained backend item | Q2.1–Q2.3 |
| 8 | **1b** organization screen | Only 8 accounts; lowest reach | Q1.1 |
| 9 | **4c-crop** new reference models | New models + migrations + settings UI | Q4c.2, Q4c.3 |
| 10 | **3b** full column removal | Destructive; needs backup + remedy-field replacement | Q3.2, Q3.3 |
| — | **6** evaluator link | Needs a design decision, not a plan | Q6.1–Q6.4 |

---

## Standing constraints for every execution cycle

Carried forward from the 2026-07-29 incident, non-negotiable:

1. Any mutating call (POST/PATCH/DELETE) during verification targets a **disposable, clearly-tagged test account only** — never a real farmer/fisherfolk/organization record.
2. **Every mutating command's actual response is inspected before proceeding** — nothing piped away, nothing assumed.
3. Full cleanup of test fixtures afterward, including FK-dependent rows (`core_notification` via **both** `actor_id` and `recipient_id`, `core_recordlock.locked_by_id`, `token_blacklist_outstandingtoken.user_id`), with absence re-verified by explicit existence queries.
4. Gates before any cycle is called done: `python manage.py check`, `python manage.py makemigrations --check`, `npm run build`.
