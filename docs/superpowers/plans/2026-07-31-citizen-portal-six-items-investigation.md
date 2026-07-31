# Citizen Portal — Six Work Items: Investigation & Roadmap

> **Status: PLANNING. No application code has been changed.**
> **Revision 2 (2026-07-31)** — decisions applied, scope adjusted. Execution has NOT begun.
>
> **Scope note (writing-plans "Scope Check"):** these items are independent
> subsystems and should NOT share one implementation plan. This document is
> the investigation record, the decision log, and a per-item approach sketch.
> Each item gets its own bite-sized TDD plan written at the start of its own
> execution cycle.

**Investigated:** 2026-07-31
**Backend:** Django + DRF, `oma_aringay/` **Frontend:** React + Vite + Tailwind **v4**, `oma-frontend/`
**Live DB probed:** MariaDB via XAMPP, read-only queries only

---

## Decision log (revision 2)

| ID | Decision | Source |
|---|---|---|
| **Q3.1** | Hide the Recommendations input on the **citizen** fisheries form only. Evaluator "Remedy Performed *" control untouched. **No schema change, no migration.** | User |
| **Q6.1** | Evaluator link = **barangay-based assignment**. An evaluator is assigned one or more barangays. | User |
| **Q6.2** | It is a **visibility restriction**, not just notification routing. | User |
| **Q2.1** | Profile **photo upload out of scope**. Text fields only. | User |
| **Q1.2** | The 3 overflowing tables become a **card layout below `md`**, matching the pattern shipped in `c5a3f1b`. | User |
| **Q4a.1** | Add the missing `min` to the citizen date picker so the UI blocks backdating before the server 400s. | User |
| **Q4b.1** | **Reject explicitly** on null `area_hectares` with a clear message — do not silently bypass the cap, do not auto-backfill. | User |
| **Q4c-drift** | Fold the `feed_type` drift fix into item 4c. | User |
| **Q3.2 / Q3.3** | **Moot** — no schema change means no column drop, so no remedy-field replacement and no prod-dump question. Retained below for the record. | Follows from Q3.1 |
| **Q6.4** | `notify_all_except` fix is a **separate follow-up**, deliberately kept out of this plan. See the final section. | User |
| **Q2.2** | Citizen **cannot** edit `email` — not in the approved field list, and they don't log in with it. | Judgment |
| **Q4c.1** | **Yes**, add the missing `disease_type` dropdown to the citizen fisheries form. Pure parity, existing endpoint, existing seeded data, no new model. | Judgment |
| **Q5.1** | Hand-rolled inline **SVG sparkline**, not Recharts. Recharts *is* already a dependency (`package.json:19`, `^3.8.1`) but is not currently imported on the citizen route; pulling it in would add a chart library to the one bundle that rural mobile users load. A single trend line does not justify it. | Judgment |
| **Q1.1** | Organization screen becomes **fluid mobile-first** (works from 360px up) but **keeps its desktop width** — it is not forced into the 380px phone column. Its job is member search + bulk reporting, which is plausibly a desktop task, and there are only 8 such accounts. Easy to overrule if you'd rather it match Farmer/Fisherfolk exactly. | Judgment |

**Still open and genuinely product-level — listed in "Flagged for your decision" below:**
Q2.3, Q4c.2, Q4c.3, Q5.2, Q6.3, plus **six new questions** (N1–N6) raised by the decisions above.

---

## Global facts established

| Fact | Evidence |
|---|---|
| Roles are `ADMIN`, `EVALUATOR`, `CITIZEN` only | `accounts/models.py:6-12` |
| CITIZEN linked to one record via `(linked_record_type, linked_record_id)` | `accounts/models.py:55-58` |
| Type-safe scoping accessors exist and must be used | `get_linked_farmer_id()` / `get_linked_fisherfolk_id()`, `accounts/models.py:81-96` |
| Accounts | 5 ADMIN, 8 EVALUATOR, **4274 CITIZEN** (3392 FARMER, 874 FISHERFOLK, 7 FARMERS_ORG, 1 FISHERFOLK_ORG) |
| Domain rows | 3567 Farmer, 873 Fisherfolk, 18 CropMonitoringRecord, 21 StockingRecord, 20 Pond, 141 CropActivityLog, 401 FisheriesActivityLog |
| Farmer/Fisherfolk citizen screens don't use `PageLayout`/`Sidebar` | `CitizenScreen`, `pages/Citizen/citizenUI.jsx:71-79` |
| Tailwind v4 — **no `tailwind.config.js`**; tokens in `@theme{}` in `src/index.css`, `cz-*` namespace | — |
| Cascade trap: unlayered `button,input,select,textarea{font:inherit}` beats `@layer utilities` | `pages/Citizen/citizenUI.jsx:18-25`; wrap button labels in `<span>` |

---

## ITEM 1 — Mobile-first responsive layout

**Scope (revised):** Organization screen + the 3 overflowing tables. **Farmer and Fisherfolk are already done** (`c5a3f1b`) and are out of scope.

### Confirmed locations

| Thing | Location |
|---|---|
| Role fork | `pages/Citizen/CitizenHomePage.jsx:64-69` |
| **Organization screen** | `CitizenHomePage.jsx:71-131` — `max-w-4xl`, `sm:grid-cols-2` |
| Table 1 — 6 columns | `MyYieldAnalysisSection.jsx:28-60` |
| Table 2 — 4 columns | `MyAssistanceHistorySection.jsx:26-47` |
| Table 3 — 5 columns | `MyOrgReportingSection.jsx:131-164` |
| Card/shell primitives to reuse | `pages/Citizen/citizenUI.jsx` |

All three tables render inside the 340px citizen column with only `overflow-x-auto`, and all three still use the **staff** palette (`#E2E8E2`, `#7A8E7A`, `#1A2B1A`) rather than `cz-*` tokens — so the two secondary Farmer/Fisherfolk views visibly break style with their own home screen.

Note on the sidebar: it is **not** part of this item. Farmer/Fisherfolk screens never mount it, and it is already an off-canvas hamburger drawer below `md` (`Sidebar.jsx:334`, `:344-348`).

### Approach

- **1a** — convert the 3 sections to `cz-*` tokens + card list below `md`, reusing `citizenUI.jsx`. Frontend only, no API change. Unblocks item 5.
- **1b** — Organization screen fluid mobile-first per Q1.1.

---

## ITEM 2 — Editable profile (text fields only)

### Confirmed locations

| Thing | Location |
|---|---|
| Existing self-service endpoint | `GET`/`PATCH /accounts/me/` — `accounts/views.py:263-277`, `[IsAuthenticated]` |
| Read serializer | `UserSerializer`, `accounts/serializers.py:20-52` |
| Write serializer | `MeUpdateSerializer`, `accounts/serializers.py:132-140` — only `full_name`, `contact_number`, `email` |
| Staff UI (unchanged) | `pages/Profile/ProfilePage.jsx`; route `App.jsx:85-92` is ADMIN/EVALUATOR-only |
| Farmer fields | `farmers/models.py:40-84` |
| Fisherfolk fields | `fisheries/models.py:62-132` |

### Key finding

`/accounts/me/` edits the **`User`** row. Everything a citizen would recognise as "my profile" — barangay, RSBSA/FishR number, birthdate, civil status, ponds/parcels — lives on the **domain record** and has no self-service write path. That's the gap; a new endpoint is required.

**Latent bug not to inherit:** `MeUpdateSerializer` accepts `email` with no uniqueness validation and no `username` sync, whereas `UserUpdateSerializer` has both (`serializers.py:117-129`). Q2.2 (citizen cannot edit email) sidesteps this rather than needing to fix it.

### Editable / read-only split

| Field | Farmer | Fisherfolk | Org | Rationale |
|---|---|---|---|---|
| `contact_number` | **edit** | **edit** | **edit** | Changes often, no integrity risk |
| `civil_status`, `highest_education` | **edit** | **edit** | — | Self-declared |
| `barangay`, `municipality`, `province` | display-only | display-only | display-only | Barangay is the scoping key app-wide — and, after item 6, the **evaluator-assignment key** |
| Farm parcel / pond IDs | display-only | display-only | — | Per decision |
| `rsbsa_number` / `fishr_number` / `lgu_registration_number` | display-only | display-only | display-only | Login identifier + unique key |
| `birthdate`, `gender` | display-only | display-only | — | Registry identity |
| `is_pwd`, `is_4ps_beneficiary`, `is_icc_ip_member` | display-only | display-only | — | Drives assistance eligibility |
| `fisherfolk_type`, `farmers_organization` | — | display-only | — | Drives permissions + `FishingTripLog.clean()` |
| **`first/middle/last_name`** | ⚠️ see **N1** | ⚠️ see **N1** | — | You listed "name" as editable; flagged below |

Read-only status must be enforced **server-side** via `read_only_fields`, not by hiding inputs.

### Approach

New `CitizenProfileView` (`GET`/`PATCH /accounts/me/profile/`) with a permission resolving the caller's own linked record; per-type serializers enforcing the split above; new citizen-styled screen under `pages/Citizen/`. `/profile` and `ProfilePage.jsx` untouched.

---

## ITEM 3 — Hide Recommendations input (citizen fisheries form only)

### Confirmed locations

| Thing | Location |
|---|---|
| The column | `FisheriesActivityLog.recommendations` — `fisheries/models.py:614` |
| Serializer exposure (**stays**) | `fisheries/serializers.py:408` |
| **Citizen input — REMOVE** | `pages/Citizen/CitizenActivityLogModal.jsx:557-565` |
| **Citizen payload write — REMOVE** | `CitizenActivityLogModal.jsx:244` (currently writes `recommendations` **unconditionally** for fisheries, so even non-Disease-Control logs POST `''`) |
| Label — remove | `pages/Citizen/labels.js:205` |
| **Evaluator input — UNTOUCHED** | `StockingMonitoringModals.jsx:843-850` |
| Read-back display — untouched | `StockingMonitoringModals.jsx:997` |

### Why the evaluator control stays (validates the decision)

`StockingMonitoringModals.jsx` reuses the one textarea for two purposes:

```
line 845:  {showRemedyFields ? 'Remedy Performed *' : 'Recommendations'}
line 512:  if (!recommendations.trim()) { showToast('Please describe the remedy performed.', 'error'); return }
```

When `activity === 'Disaster Remedy'` (`:410`) it is a **mandatory** capture and the only place that text is recorded. Functionally distinct despite sharing the column — exactly as decided.

### Confirmed fisheries-only

`CropActivityLog` has no `recommendations` field; the crop side's similarly-labelled control (`CropMonitoringPage.jsx:830-833`) writes to `CropActivityLog.notes`. Removing the citizen input cannot affect farmers.

**Not in scope, do not confuse:** `CropActivityStage.recommendation`, `SpeciesActivityStage.recommendation`, `DisasterResponseRule.recommendation`, `FisheriesDisasterResponseRule.recommendation`, `DiseaseResponseGuide.recommended_treatment`, `PestDiseaseReport.recommended_action` — staff-configured reference text that *feeds* forms.

### Data (retained for the record; no longer gating)

327 of 401 rows have non-empty `recommendations`. All 327 are machine-generated: **316** verbatim copies of a `SpeciesActivityStage.recommendation` (`seed_fisheries_demo_data.py:407`), **11** carrying `SEED_TAG` (`:510`), **0 human-authored**. `activity='Disaster Remedy'` has 0 rows.

Since no schema change is happening, **Q3.2** (remedy-field replacement) and **Q3.3** (has this DB seen a prod dump?) are moot.

### Approach

Frontend only, fully reversible. Existing rows keep their data; the evaluator UI keeps displaying it.

---

## ITEM 4 — Consistent validation

### 4a — No backdating before the start date

**Fisheries start-date column confirmed:** `StockingRecord.date_stocked` (`fisheries/models.py:432`).

| Layer | Crop | Fisheries |
|---|---|---|
| Backend rule (**already correct**) | `production/serializers.py:222-233` | `fisheries/serializers.py:446-457` |
| Exemption flag | `CropActivityStage.allows_pre_planting` — **25 of 200** stages | `SpeciesActivityStage.allows_pre_planting` — **6 of 41** stages |
| Future-date guard | `production/serializers.py:194-197` | `fisheries/serializers.py:419-422` |
| Evaluator frontend `min` | — | `StockingMonitoringModals.jsx:667` |
| **Citizen frontend `min`** | **absent** | **absent** |

The rule lives in the **serializer**, so it already applies identically to citizens and staff and is **not frontend-bypassable**. This is a UX fix, not a security fix. Today the "Yesterday" shortcut (`CitizenActivityLogModal.jsx:193`) can silently produce an invalid date that surfaces only as a raw 400 through the generic toast (`:256-260`).

#### ⚠️ Correctness trap — a blanket `min` would be wrong

The exempt activities, measured from the live DB:

- **Crop:** `Land Preparation`, `Seed Bed Preparation`, `Seed Soaking`, `Seed Sowing`, `Soil Preparation & Leveling`
- **Fisheries:** `Pond Preparation`

**`Pond Preparation` is in the citizen fisherfolk dropdown** (`citizenDomainConfig.js:50`) and is the *only* pre-stocking-exempt fisheries activity. A blanket `min={date_stocked}` would wrongly block the single most common legitimate pre-stocking log. The `min` must therefore be **activity-conditional**, mirroring `StockingMonitoringModals.jsx:667`.

(Crop is subtler: none of the 5 exempt names are in the citizen crop dropdown, but they *can* arrive via prefill from a task card, so the same conditional logic is needed.)

#### ⚠️ Backend prerequisite — this is not a frontend-only change

To know which activities are exempt, the citizen form must read the stage list. Both endpoints are currently **staff-only**:

- `GET /production/crop-types/<id>/stages/` — `CropActivityStageListCreateView`, `production/views.py:1875` → `[IsAuthenticated, IsAdminOrEvaluator]`
- `GET /fisheries/species/<id>/stages/` — `SpeciesActivityStageListCreateView`, `fisheries/views.py:204` → `[IsAuthenticated, IsAdminOrEvaluator]`

So 4a needs a **GET-only permission widening** first, following the established precedent (Batch E on `CropActivitySuggestionsView`; Batch F on `FeedTypeListCreateView`). Writes stay `IsAdminOrEvaluator`.

### 4b — Area affected must not exceed registered area

| Layer | Crop | Fisheries |
|---|---|---|
| Activity log, backend | `production/serializers.py:240-253` | `fisheries/serializers.py:464-477` |
| Disaster report, backend | `production/serializers.py:297-310` | `fisheries/serializers.py:521-534` |
| Citizen frontend | `CitizenActivityLogModal.jsx:182-188` (both domains) | same |
| Evaluator frontend | `CropMonitoringPage.jsx` | `StockingMonitoringModals.jsx:414-422` |

Every cap is written `if stocking_record.area_hectares and ...`. `StockingRecord.area_hectares` is **nullable** (`models.py:433`), so NULL makes the guard fall through silently — backend *and* frontend (`CitizenActivityLogModal.jsx:167` → `plantedArea = null`, cap skipped).

**Per decision: reject explicitly instead of bypassing.** All four fisheries call sites change from "skip the cap" to "raise a validation error", with a citizen-legible message routed through `labels.js` (e.g. *"The pond area on file is missing. Please contact your evaluator."*). Crop side needs no change — `area_planted_ha` is non-nullable and 0 of 18 records are NULL.

**Records needing an evaluator/admin backfill (separate from the code change):**

| Model | Count | Field |
|---|---|---|
| `StockingRecord` | **2 of 21** | `area_hectares` IS NULL |
| `Pond` | **1 of 20** | `area_hectares` IS NULL |

Note the coupling: `StockingRecord.save()` overwrites `area_hectares` from `Pond.area_hectares` when a pond is linked (`fisheries/models.py:477-481`), so **the Pond must be backfilled first** or the stocking record's value will be re-nulled on next save. See **N6**.

### 4c — Standardized dropdowns (now includes the feed_type drift fix)

| Field | Domain | Current input | Reference table |
|---|---|---|---|
| `feed_type` | Fisheries | `ComboboxWithOther` from `/fisheries/feed-types/?species=` (`CitizenActivityLogModal.jsx:460-470`) | **`FeedType`** + `species_options` M2M (`fisheries/models.py:291-306`) |
| `disease_type` | Fisheries | Evaluator: combobox from `/fisheries/disease-types/?species=`. **Citizen: absent entirely** | **`DiseaseType`** + `species_options` M2M (`fisheries/models.py:314-330`) |
| `fertilizer_type` | Crop | free-text `<input>` (`CitizenActivityLogModal.jsx:387-393`) | **none exists** |
| `pest_disease_name` | Crop | free-text `<input>` (`CitizenActivityLogModal.jsx:424-430`) | **none exists** |

#### The feed_type drift, measured

`FeedType` holds exactly **2** canonical rows: `Commercial Pellet Feed`, `Natural/Pond Feed`.
Actual stored `FisheriesActivityLog.feed_type` values include `worm`, **`Commercial fellet`** (typo), `Commercial Pellets, 32% CP` — **none matching either canonical row**. The combobox has an "Other" branch and `feed_type` is a plain `CharField` with no FK, so free text wins.

Crop free-text columns still hold only demo values (`Demo`, `Pest Attack`) — drift hasn't started there, which is why doing this now is cheap.

#### Citizen/evaluator parity gap

The citizen fisheries `Disease Control` form (`CitizenActivityLogModal.jsx:495-567`) shows area / severity / mortality / vet / treatment / outcome but **not** `disease_type` — so a fisherfolk cannot categorize a disease at all, while an evaluator can, from the same 5-row `DiseaseType` list. **Q4c.1 resolved: add it.**

#### Domain mapping — deliberately not 1:1

Crop `pest_disease_name` and fisheries `disease_type` are not the same concept: the fisheries list is species-scoped aquatic pathology *plus* water-quality stress (`Poor Water Quality / Ammonia-Nitrite Stress` is one of the 5 seeded rows), while the crop equivalent spans insect pests *and* plant pathogens. Proposal remains **parallel but domain-specific** models on the `DiseaseType` shape (name / description / is_active / `crop_types` M2M), not a shared table. Gated on **Q4c.2**.

### Item 4 approach — four cycles

- **4a** — GET-permission widening on both stage endpoints, then activity-conditional `min` in the citizen form.
- **4b** — explicit rejection at the 4 fisheries call sites + `labels.js` message. Backfill tracked separately (**N6**).
- **4c-fisheries** — add `disease_type` to the citizen form; decide the drift remedy (**Q4c.3**). No new models.
- **4c-crop** — new reference models + migrations + settings UI. Gated on **Q4c.2**.

---

## ITEM 5 — Self-service yield/analysis view

### Already exists and is already scoped

| Thing | Location |
|---|---|
| Crop queryset + citizen scoping | `production/views.py:913-947` |
| Crop endpoint | `YieldAnalysisView`, `:1046-1058` — `[IsAuthenticated]` |
| Crop aggregate (**stays staff-only**) | `YieldAnalysisSummaryView`, `:1061-1062` |
| Fisheries mirror | `fisheries/views.py:1182-1209`; `fisheries/urls.py:109-110` |
| Per-record analysis | `_analyze_crop()`, `production/views.py:1000-1043` |
| Citizen UI | `pages/Citizen/MyYieldAnalysisSection.jsx` |

### Boundary verified — no leak

```python
# production/views.py:919-931
if request.user.role == 'CITIZEN':
    farmer_id = request.user.get_linked_farmer_id()
    qs = qs.filter(farmer_id=farmer_id if farmer_id else -1)
```

1. The citizen filter is applied **before** the query-param filters (`:932-946`) and all are chained `.filter()` → ANDed. `?farmer=999` yields `own AND 999` = empty. **No leak via query params.**
2. `get_linked_farmer_id()` returns `None` for any non-FARMER link, falling to the unreachable `-1` sentinel rather than matching a same-numbered row in another table.
3. The fisheries mirror is structurally identical with `get_linked_fisherfolk_id()`.

### Remaining work is presentation only

Already returned by the existing payload and currently unused by the citizen UI: `variance_kg`, `variance_pct`, `harvest_dates` (`:1014-1017`), `missed_high_priority`, `activity_breakdown`. **Trend needs no new query** — it is the existing list, already ordered by `date_planted` / `date_stocked` (`:947`, `:1209`).

### Approach

Frontend only. Rebuild `MyYieldAnalysisSection` as citizen-styled cards + variance summary + inline-SVG sparkline (Q5.1), consuming the existing payload unchanged. No permission or queryset change. Re-verify the boundary with a disposable account anyway, since this is a scoping-sensitive surface.

---

## ITEM 6 — Evaluator link (barangay-based visibility restriction)

### ✅ Requested confirmation: **evaluators have NO barangay attribute today. It must be added first.**

`accounts.User` has: `email`, `role`, `full_name`, `suffix`, `contact_number`, `must_change_password`, `is_email_verified`, `email_verification_token`, `email_verification_sent_at`, `linked_record_type`, `linked_record_id`. **No barangay field, and no separate evaluator-profile model exists.** The only `barangay` references in the whole `accounts` app are two read-only passthroughs of the *citizen's* linked record (`serializers.py:44`, `:51`).

Confirmed absent by search: `assigned_evaluator`, `evaluator_id`, `assigned_to`, `reviewer` — zero results outside role-string comparisons. `IsAdminOrEvaluator` (`accounts/permissions.py:22-28`) is a flat role check: **every evaluator currently sees every record in the municipality.** The `?barangay=` filters are user-chosen query params, not enforced scoping. `recorded_by` / `logged_by` / `registered_by` / `reported_by` record *authorship*, not assignment, and are nullable `SET_NULL`.

So step 1 of item 6 is building the assignment mechanism itself.

### Good news — the barangay data is essentially complete

| Table | Rows | Blank barangay |
|---|---|---|
| `Farmer.barangay` | 3567 | **0** |
| `Fisherfolk.barangay` | 873 | **0** |
| `Pond.barangay` | 20 | **0** |
| `CropMonitoringRecord.farm_location_barangay` | 18 | **0** |
| `StockingRecord.pond_location_barangay` | 21 | **1** |

`BARANGAY_CHOICES` is a fixed 24-entry list (`core/constants.py:1-25`). Exactly **one** orphan row needs handling before the restriction goes live — and it is plausibly the same record family as the null-area rows in 4b (see **N6**).

### Proposed mechanism

`User.assigned_barangays` — a `ManyToManyField` to a small `Barangay` table, or a validated `JSONField` of `BARANGAY_CHOICES` values. The in-repo precedent for scoping M2Ms is `FeedType.species_options` / `DiseaseType.species_options` (`fisheries/models.py:295`, `:321`). Assignment is managed on the existing user-admin surface (`pages/Users/UserManagementPage.jsx`, `EditUserModal.jsx`).

### ⚠️ The restriction's blast radius is larger than "activity logs"

`IsAdminOrEvaluator` is used **162 times across 8 files**: `production/views.py` (52), `fisheries/views.py` (36), `reports/views.py` (21), `associations/views.py` (18), `interventions/views.py` (16), `farmers/views.py` (12), `monitoring/views.py` (5), `accounts/views.py` (2).

And every activity-log endpoint is **nested under a parent record**:

```
production/urls.py:88   monitoring/<int:monitoring_id>/logs/
production/urls.py:94   monitoring/logs/<int:id>/detail/
fisheries/urls.py:86    stocking/<int:stocking_id>/logs/
fisheries/urls.py:88    stocking/logs/<int:id>/detail/
```

Restricting *only* the log querysets would be **leaky and inconsistent**: an evaluator would be blocked from an out-of-area record's logs while still seeing that record, its farmer, its yield analysis, and its dashboard contribution. The natural enforcement point is the **parent record queryset** (`CropMonitoringRecord`, `StockingRecord`), which then transitively covers logs.

Also note the detail/delete routes are keyed by **log id directly**, so queryset filtering alone is insufficient — they need `has_object_permission`, exactly the lesson recorded in `IsStaffOrOwnRecordCitizen`'s docstring (`accounts/permissions.py:48-56`).

This makes item 6 substantially the largest of the six. See **N2**, **N3**, **N4** before it can be planned.

---

## 🚩 Flagged for your decision

Real product/UX calls I have deliberately not made.

### Carried over

- **Q2.3 — Immediate self-edit, or a staff review queue?** The registry is treated as authoritative everywhere in this app; letting citizens write to it directly is a policy change, not just a feature. My read of "ship text-field profile editing" is *immediate*, but confirming matters because it interacts with **N1**.
- **Q4c.2 — Create `FertilizerType` / `CropPestDiseaseType` reference models?** And if so, **who supplies the initial lists** — OMAg staff, or seed empty and let them populate via a new settings page under `CropSettingsHub`? Seeding agronomic content is not something I should invent.
- **Q4c.3 — Keep the "Other" free-text escape hatch?** Keeping it preserves field usability; it is also exactly what produced `Commercial fellet`. Suggested middle path: keep "Other", but add a staff "unmatched values" review surface so drift is visible and reconcilable. That surface is extra scope — worth deciding now.
- **Q5.2 — Surface `missed_high_priority` to citizens?** It is already computed and already scoped. But it reads as *"you missed these activities"*, while the endpoint's own `YIELD_ANALYSIS_DISCLAIMER` (`production/views.py:906-910`) explicitly says missed activities are **not proven causes**. Wording and whether to show it at all is a judgment about the OMAg–farmer relationship, not a technical one.
- **Q6.3 — How do organizations link to an evaluator?** An organization spans multiple barangays by membership, so barangay assignment doesn't map cleanly. Options: the org's own registered barangay; the union of its members' barangays; or orgs stay unrestricted.

### New — raised by the revision-2 decisions

- **N1 — Should citizens really be able to edit their own name?** You listed "name" as editable. `first_name`/`middle_name`/`last_name` are registry identity: they appear in RSBSA/BFAR matching, in every report and export, and in `Farmer.full_name`, which is what evaluators search on. A citizen renaming themselves silently breaks that trail, and there is no audit coverage for it (`AuditLogEntry` does not track these models — established during the 2026-07-29 incident review). Recommend **display-only**, or editable-with-review per Q2.3. Everything else on your list is uncontroversial.
- **N2 — Does the barangay restriction apply to ADMIN as well as EVALUATOR?** You wrote "evaluator/admin queries", and `IsAdminOrEvaluator` covers both — but restricting ADMIN would cut municipality-wide dashboards, reports/exports, forecasting, and the audit log, and ADMIN is the only role that may delete stocking records (`fisheries/views.py:503`). **Strong recommendation: EVALUATOR only; ADMIN stays municipality-wide.** Please confirm, because it changes the design fundamentally.
- **N3 — Restrict at the parent-record level, or logs only?** Logs-only is leaky and inconsistent (reasoning above). Recommend parent-record level. This is a scope decision, not an implementation detail.
- **N4 — Do the aggregate surfaces get restricted too?** Dashboard, `YieldAnalysisSummaryView`, Forecasting, and the PDF/Excel reports in `reports/views.py` (21 `IsAdminOrEvaluator` usages) are all municipality-wide today. If an evaluator is barangay-restricted for records but still sees municipality-wide totals, the restriction is partly cosmetic. Restricting them is a significant additional scope.
- **N5 — What happens to an evaluator with zero assigned barangays?** Fail closed (sees nothing) or fail open (sees everything)? Fail-open is friendlier during rollout across the existing 8 evaluator accounts; fail-closed is safer. This also determines whether a data migration must assign all 24 barangays to all 8 existing evaluators before deploy.
- **N6 — Who backfills the orphan rows, and when?** 2 `StockingRecord.area_hectares` NULL, 1 `Pond.area_hectares` NULL, 1 `StockingRecord.pond_location_barangay` blank. These are almost certainly overlapping rows. They block clean rollout of both 4b (records become un-loggable, by design) and item 6 (a blank-barangay record is invisible to every restricted evaluator). Order matters: **Pond first, then StockingRecord**, because `StockingRecord.save()` re-derives its values from the linked Pond (`fisheries/models.py:477-481`). I can produce the exact row list on request — no mutations.

---

## Sequencing recommendation

| Order | Item | Why here | Blocked on |
|---|---|---|---|
| 1 | **3** hide citizen recommendations input | Frontend-only, fully reversible, fully decided | — |
| 2 | **4b** explicit null-area rejection | Small, quantified, 4 call sites + one label | N6 (rollout, not code) |
| 3 | **4a** stage-endpoint widening + conditional `min` | Small, but needs the backend widening first | — |
| 4 | **1a** citizen table/section card rework | Unblocks item 5's presentation work | — |
| 5 | **5** yield view rebuild | Depends on 1a's card primitives; no API change | Q5.2 |
| 6 | **4c-fisheries** `disease_type` parity + drift remedy | Reuses existing endpoint and data | Q4c.3 |
| 7 | **2** editable profile | New endpoint + serializers; largest self-contained backend item | Q2.3, N1 |
| 8 | **1b** Organization screen | Only 8 accounts; lowest reach | — (Q1.1 resolved) |
| 9 | **4c-crop** new reference models | New models + migrations + settings UI | Q4c.2, Q4c.3 |
| 10 | **6** barangay assignment + visibility restriction | Largest; 162 permission call sites in blast radius | N2, N3, N4, N5, N6, Q6.3 |

---

## ⛔ Out of scope — recommended immediate follow-up (separate PR)

**Deliberately excluded from the citizen-portal plan so it doesn't get buried in a larger PR.**

### `notify_all_except` broadcasts to every active user

`core/notifications.py:10-43`:

```python
recipients = User.objects.filter(is_active=True)
if actor is not None:
    recipients = recipients.exclude(pk=actor.pk)
```

**No role filter.** Every activity log, harvest, and disaster report fans out one `Notification` row per active user.

**Two measured problems:**

1. **Misrouting / privacy** — citizens are recipients. **74 notification rows already address CITIZEN recipients** about other people's records. They aren't currently *rendered* (`CitizenHomePage` never mounts `NotificationBell`), but the rows exist and the endpoint is role-agnostic, so this is one UI change away from being visible.
2. **Production risk** — with **4274 active citizen accounts**, a single citizen logging one activity attempts a `bulk_create` of ~4274 rows. `Notification` total is only 281 today, which means this has **not yet been exercised at scale** — it will be the moment citizen accounts see real use.

Call sites include `fisheries/views.py:559-566` (`StockingActivityLogListCreateView.perform_create`) and the crop equivalent.

**Suggested minimal fix:** filter recipients to `role__in=('ADMIN','EVALUATOR')`. That alone removes both problems and is a one-line change with a clear test. Routing to the *assigned* evaluator becomes possible later, once item 6 lands.

---

## Standing constraints for every execution cycle

Carried forward from the 2026-07-29 incident, non-negotiable:

1. Any mutating call (POST/PATCH/DELETE) during verification targets a **disposable, clearly-tagged test account only** — never a real farmer/fisherfolk/organization record.
2. **Every mutating command's actual response is inspected before proceeding** — nothing piped away, nothing assumed.
3. Full cleanup of test fixtures afterward, including FK-dependent rows (`core_notification` via **both** `actor_id` and `recipient_id`, `core_recordlock.locked_by_id`, `token_blacklist_outstandingtoken.user_id`), with absence re-verified by explicit existence queries.
4. Gates before any cycle is called done: `python manage.py check`, `python manage.py makemigrations --check`, `npm run build`.
