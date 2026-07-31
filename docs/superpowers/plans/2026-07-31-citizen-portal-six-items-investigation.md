# Citizen Portal — Six Work Items: Investigation & Roadmap

> **Status: PLANNING — awaiting final review. No application code has been changed.**
> **Revision 3 (2026-07-31)** — barangay-restriction scope resolved, execution order added. Execution has NOT begun.

**Backend:** Django + DRF, `oma_aringay/` **Frontend:** React + Vite + Tailwind **v4**, `oma-frontend/`
**Live DB probed:** MariaDB via XAMPP, read-only queries only

---

## EXECUTION ORDER

Seven batches. Each ends with its own verification and gates; each is independently reviewable and independently revertable.

| # | Batch | Items | Touches | Risk | Blocked on |
|---|---|---|---|---|---|
| **A** | Quick citizen-facing fixes | 3, 4b | FE + 4 serializer call sites | Low | — |
| **B** | Stage-endpoint widening + date guard | 4a | 2 permission classes, FE | Low | — |
| **C** | Citizen presentation rework | 1a, 1b | FE only | Low | — |
| **D** | Self-service yield view | 5 | FE only | Low | Q5.2 |
| **E** | Fisheries dropdown parity + drift | 4c-fisheries | FE + data reconciliation | Medium | Q4c.3 |
| **F** | **Barangay assignment mechanism** | 6 — part 1 | New model + migration + admin UI | Medium | — |
| **G** | **Evaluator visibility restriction** | 6 — part 2 | ~162 permission call sites | **High** | **F**, Q6.3, N7 |
| **H** | Citizen profile editing | 2 | New endpoint + serializers + FE | Medium | — |
| **I** | Crop reference models | 4c-crop | New models + migrations + settings UI | Medium | Q4c.2, Q4c.3 |

**Why this order.** A–D are self-contained, low-risk, and fully decided — they ship value while the item-6 questions settle. **F is deliberately split from G**: the assignment mechanism is a purely additive model + admin surface that changes no existing behaviour, so it can land, be reviewed, and have all 8 evaluators assigned *before* any query starts filtering on it. That split is what makes the fail-closed decision safe (see **⚠️ Deployment ordering** below). G is the highest-risk work in the whole roadmap and goes last among the decided items. H and I are independent of the item-6 track and can run in parallel with it if you prefer.

**Out of scope, recommended as its own PR:** the `notify_all_except` broadcast fix — see the final section.

### ⚠️ Deployment ordering constraint (created by the fail-closed decision)

Fail-closed means an evaluator with zero assigned barangays sees **nothing**. There are **8 existing evaluator accounts**. If batch G deploys before those 8 are assigned, **every evaluator is locked out of the entire system simultaneously.**

Mitigation, and it must be in batch F's plan, not G's:
1. Batch **F** ships the model + admin UI only. No query changes. Nothing breaks.
2. All 8 evaluators are assigned their barangays through the admin UI, and this is **verified by an explicit count query** (`0 evaluators with empty assignment`) as F's exit gate.
3. Only then does batch **G** ship the filtering.

A data migration that bulk-assigns all 24 barangays to all 8 evaluators is the alternative, but it silently grants municipality-wide access under a system whose whole point is to restrict it. **Recommend the explicit-assignment route** with the count query as a hard gate.

---

## Decision log

### Revision 2

| ID | Decision | Source |
|---|---|---|
| **Q3.1** | Hide the Recommendations input on the **citizen** fisheries form only. Evaluator "Remedy Performed *" untouched. **No schema change.** | User |
| **Q6.1 / Q6.2** | Evaluator link = **barangay-based assignment**, enforced as a **visibility restriction**. | User |
| **Q2.1** | Profile **photo upload out of scope**. | User |
| **Q1.2** | The 3 overflowing tables → **card layout below `md`**, matching `c5a3f1b`. | User |
| **Q4a.1** | Add the missing `min` to the citizen date picker. | User |
| **Q4b.1** | **Reject explicitly** on null `area_hectares`; no silent bypass, no auto-backfill. | User |
| **Q4c-drift** | Fold the `feed_type` drift fix into item 4c. | User |
| **Q3.2 / Q3.3** | **Moot** — no schema change. | Follows Q3.1 |
| **Q2.2** | Citizen **cannot** edit `email`. | Judgment — **approved** |
| **Q4c.1** | **Yes**, add `disease_type` to the citizen fisheries form. | Judgment — **approved** |
| **Q5.1** | Inline **SVG sparkline**, not Recharts (avoids a chart lib on the rural-mobile bundle). | Judgment — **approved** |
| **Q1.1** | Organization screen **fluid mobile-first, keeps desktop width**. | Judgment — **approved** |

### Revision 3

| ID | Decision | Source |
|---|---|---|
| **N2** | Barangay restriction applies to **EVALUATOR only**. **ADMIN keeps full municipality-wide visibility** — dashboards, reports, forecasting, audit log, and delete capability all unchanged. | User |
| **N3** | Restriction enforced at the **parent-record queryset**: `Farmer`, `Fisherfolk`, `Pond`, `CropMonitoringRecord`, `StockingRecord` **and** their activity logs, all by the same check. No see-the-record-but-not-its-logs split. | User |
| **N4** | An evaluator's **own** dashboard/aggregate views are scoped to their assigned barangays. **Municipality-wide** aggregate / forecasting / reports / audit log stay **admin-only**, matching the existing staff-only aggregate boundary from item 5. | User |
| **N5** | Zero-barangay evaluator → **fail closed**. Empty state telling them to contact the administrator. Never default to full visibility. | User |
| **N6** | The blank-barangay orphan row → **fail closed too**: ADMIN-visible only until backfilled. Added to the backfill list. | User |
| **N1** | `first/middle/last_name` are **read-only** for citizens. No self-edit, no approval workflow, this pass. | User |
| **Q2.3** | **Immediate self-edit**, no review queue. Now low-stakes: with names read-only per N1, the editable set is `contact_number`, `civil_status`, `highest_education` only. | Follows N1 |

**Still open — see "Flagged for your decision":** Q4c.2, Q4c.3, Q5.2, Q6.3, and one new question **N7**.

---

## Global facts established

| Fact | Evidence |
|---|---|
| Roles are `ADMIN`, `EVALUATOR`, `CITIZEN` only | `accounts/models.py:6-12` |
| CITIZEN linked via `(linked_record_type, linked_record_id)` | `accounts/models.py:55-58` |
| Type-safe scoping accessors exist and must be used | `get_linked_farmer_id()` / `get_linked_fisherfolk_id()`, `accounts/models.py:81-96` |
| Accounts | 5 ADMIN, **8 EVALUATOR**, 4274 CITIZEN (3392 FARMER, 874 FISHERFOLK, 7 FARMERS_ORG, 1 FISHERFOLK_ORG) |
| Domain rows | 3567 Farmer, 873 Fisherfolk, 18 CropMonitoringRecord, 21 StockingRecord, 20 Pond, 141 CropActivityLog, 401 FisheriesActivityLog |
| Farmer/Fisherfolk citizen screens don't use `PageLayout`/`Sidebar` | `pages/Citizen/citizenUI.jsx:71-79` |
| Tailwind v4 — no `tailwind.config.js`; tokens in `@theme{}` in `src/index.css`, `cz-*` namespace | — |
| Cascade trap: unlayered `button,input,select,textarea{font:inherit}` beats `@layer utilities` | `citizenUI.jsx:18-25`; wrap button labels in `<span>` |

---

## BATCH A — Item 3 + Item 4b

### Item 3 — hide Recommendations input (citizen fisheries form only)

| Thing | Location | Action |
|---|---|---|
| The column | `FisheriesActivityLog.recommendations`, `fisheries/models.py:614` | **keep** |
| Serializer exposure | `fisheries/serializers.py:408` | **keep** |
| Citizen input | `CitizenActivityLogModal.jsx:557-565` | **remove** |
| Citizen payload write | `CitizenActivityLogModal.jsx:244` — writes `recommendations` **unconditionally** for fisheries, so even non-Disease-Control logs POST `''` | **remove** |
| Label | `labels.js:205` | **remove** |
| Evaluator input | `StockingMonitoringModals.jsx:843-850` | **untouched** |
| Read-back display | `StockingMonitoringModals.jsx:997` | **untouched** |

**Why the evaluator control stays.** That one textarea is dual-purpose:

```
line 845:  {showRemedyFields ? 'Remedy Performed *' : 'Recommendations'}
line 512:  if (!recommendations.trim()) { showToast('Please describe the remedy performed.', 'error'); return }
```

When `activity === 'Disaster Remedy'` (`:410`) it is a **mandatory** capture and the only place that text is recorded.

**Confirmed fisheries-only:** `CropActivityLog` has no `recommendations` field; the crop side's similarly-labelled control (`CropMonitoringPage.jsx:830-833`) writes to `CropActivityLog.notes`.

**Not in scope, do not confuse:** `CropActivityStage.recommendation`, `SpeciesActivityStage.recommendation`, `DisasterResponseRule.recommendation`, `FisheriesDisasterResponseRule.recommendation`, `DiseaseResponseGuide.recommended_treatment`, `PestDiseaseReport.recommended_action`.

**Data, for the record:** 327 of 401 rows have non-empty `recommendations`; all 327 machine-generated (**316** verbatim copies of a `SpeciesActivityStage.recommendation` per `seed_fisheries_demo_data.py:407`, **11** carrying `SEED_TAG` per `:510`, **0 human-authored**). `activity='Disaster Remedy'` has 0 rows.

### Item 4b — explicit rejection on null area

| Call site | File |
|---|---|
| Fisheries activity log | `fisheries/serializers.py:464-477` |
| Fisheries disaster report | `fisheries/serializers.py:521-534` |
| Citizen frontend | `CitizenActivityLogModal.jsx:182-188` (`plantedArea` from `:167`) |
| Evaluator frontend | `StockingMonitoringModals.jsx:414-422` |

Every cap reads `if stocking_record.area_hectares and ...`; `StockingRecord.area_hectares` is nullable (`models.py:433`), so NULL silently skips the cap in **both** layers.

**Change:** raise a validation error instead of skipping, with a citizen-legible message via `labels.js` — e.g. *"The pond area on file is missing. Please contact your evaluator."*

Crop needs no change: `area_planted_ha` is non-nullable, 0 of 18 NULL.

### Backfill list (operational, not code) — exact rows

| Row | Problem | Fix path |
|---|---|---|
| `Pond` id=**1** (`Pond 1`, San Juan West, fisherfolk 18) | `area_hectares` NULL | Set pond area **first** |
| `StockingRecord` id=**5** (pond_id=1, San Juan West) | `area_hectares` NULL | Inherits from Pond 1 — resolves once Pond 1 is fixed and the record is re-saved |
| `StockingRecord` id=**110** (pond_id=**None**, fisherfolk 856) | `area_hectares` NULL **and** `pond_location_barangay` blank | **Cannot** be fixed via a pond — needs a pond link or direct entry of both fields |

Two distinct fix paths, not one. `StockingRecord.save()` re-derives `area_hectares` from the linked Pond (`fisheries/models.py:477-481`), so **Pond before StockingRecord** — as you confirmed. Row 110 has no pond at all and is also the **N6 orphan** that will be invisible to every evaluator under batch G until fixed.

---

## BATCH B — Item 4a

| Layer | Crop | Fisheries |
|---|---|---|
| Backend rule (**already correct**) | `production/serializers.py:222-233` | `fisheries/serializers.py:446-457` |
| Exemption flag | `CropActivityStage.allows_pre_planting` — 25 of 200 | `SpeciesActivityStage.allows_pre_planting` — 6 of 41 |
| Future-date guard | `production/serializers.py:194-197` | `fisheries/serializers.py:419-422` |
| Evaluator `min` | — | `StockingMonitoringModals.jsx:667` |
| **Citizen `min`** | **absent** | **absent** |

The rule is in the **serializer**, so it already applies to citizens and staff alike and is **not frontend-bypassable**. This is a UX fix. Today the "Yesterday" shortcut (`CitizenActivityLogModal.jsx:193`) can silently produce an invalid date surfacing only as a raw 400 (`:256-260`).

### ⚠️ A blanket `min` would be a bug

Exempt activities, measured live:

- **Crop:** `Land Preparation`, `Seed Bed Preparation`, `Seed Soaking`, `Seed Sowing`, `Soil Preparation & Leveling`
- **Fisheries:** `Pond Preparation`

**`Pond Preparation` is in the citizen fisherfolk dropdown** (`citizenDomainConfig.js:50`) and is the *only* pre-stocking-exempt fisheries activity — a flat `min={date_stocked}` would block a legitimate log. The `min` must be **activity-conditional**, mirroring `StockingMonitoringModals.jsx:667`. Crop is subtler: none of its 5 exempt names are in the citizen dropdown, but they arrive via **prefill from a task card**, so the same logic is needed.

### Prerequisite — GET-only permission widening (do this first)

Both stage endpoints are staff-only today:

- `GET /production/crop-types/<id>/stages/` — `production/views.py:1875` → `[IsAuthenticated, IsAdminOrEvaluator]`
- `GET /fisheries/species/<id>/stages/` — `fisheries/views.py:204` → `[IsAuthenticated, IsAdminOrEvaluator]`

Widen **GET only**, following the established precedent (Batch E on `CropActivitySuggestionsView`, Batch F on `FeedTypeListCreateView`). Writes stay `IsAdminOrEvaluator`.

---

## BATCH C — Item 1

**Scope:** Organization screen + the 3 overflowing tables. **Farmer and Fisherfolk are already done** (`c5a3f1b`) and are out of scope. The sidebar is not part of this item — Farmer/Fisherfolk never mount it, and it is already an off-canvas drawer below `md` (`Sidebar.jsx:334`, `:344-348`).

| Target | Location |
|---|---|
| Organization screen — `max-w-4xl`, `sm:grid-cols-2` | `CitizenHomePage.jsx:71-131` |
| Table 1 — 6 columns | `MyYieldAnalysisSection.jsx:28-60` |
| Table 2 — 4 columns | `MyAssistanceHistorySection.jsx:26-47` |
| Table 3 — 5 columns | `MyOrgReportingSection.jsx:131-164` |
| Primitives to reuse | `pages/Citizen/citizenUI.jsx` |

All three tables render inside the 340px citizen column with only `overflow-x-auto`, and all three still use the **staff** palette (`#E2E8E2`, `#7A8E7A`, `#1A2B1A`) instead of `cz-*` tokens — so the secondary Farmer/Fisherfolk views visibly break style with their own home screen.

---

## BATCH D — Item 5

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

1. Citizen filter applied **before** the query-param filters (`:932-946`), all chained `.filter()` → ANDed. `?farmer=999` yields `own AND 999` = empty. **No leak via query params.**
2. `get_linked_farmer_id()` returns `None` for any non-FARMER link → unreachable `-1` sentinel, never a same-numbered row in another table.
3. Fisheries mirror structurally identical with `get_linked_fisherfolk_id()`.

**Note for batch G:** this citizen branch is keyed on `role == 'CITIZEN'`, so the new evaluator branch is additive and must not disturb it.

### Remaining work is presentation only

Already in the payload and unused by the citizen UI: `variance_kg`, `variance_pct`, `harvest_dates` (`:1014-1017`), `missed_high_priority`, `activity_breakdown`. **Trend needs no new query** — the list is already ordered by `date_planted`/`date_stocked` (`:947`, `:1209`).

---

## BATCH E — Item 4c (fisheries)

| Field | Current input | Reference table |
|---|---|---|
| `feed_type` | `ComboboxWithOther` from `/fisheries/feed-types/?species=` (`CitizenActivityLogModal.jsx:460-470`) | `FeedType` + `species_options` M2M (`fisheries/models.py:291-306`) |
| `disease_type` | Evaluator: combobox from `/fisheries/disease-types/?species=`. **Citizen: absent entirely** | `DiseaseType` + `species_options` M2M (`fisheries/models.py:314-330`) |

**Parity gap (Q4c.1 → add it):** the citizen `Disease Control` form (`CitizenActivityLogModal.jsx:495-567`) shows area / severity / mortality / vet / treatment / outcome but **not** `disease_type` — a fisherfolk cannot categorize a disease at all, while an evaluator can from the same 5-row list.

**The drift, measured:** `FeedType` holds exactly **2** canonical rows (`Commercial Pellet Feed`, `Natural/Pond Feed`). Stored `FisheriesActivityLog.feed_type` values include `worm`, **`Commercial fellet`** (typo), `Commercial Pellets, 32% CP` — **none matching either canonical row**. The combobox has an "Other" branch and `feed_type` is a plain `CharField` with no FK, so free text wins. Remedy gated on **Q4c.3**.

---

## BATCH F — Item 6, part 1: barangay assignment mechanism

### ✅ Confirmed: evaluators have NO barangay attribute today

`accounts.User` has `email`, `role`, `full_name`, `suffix`, `contact_number`, `must_change_password`, `is_email_verified`, `email_verification_token`, `email_verification_sent_at`, `linked_record_type`, `linked_record_id`. **No barangay field; no separate evaluator-profile model.** The only `barangay` references in `accounts` are two read-only passthroughs of the *citizen's* linked record (`serializers.py:44`, `:51`).

Confirmed absent by search: `assigned_evaluator`, `evaluator_id`, `assigned_to`, `reviewer` — zero results outside role-string comparisons. `IsAdminOrEvaluator` (`accounts/permissions.py:22-28`) is a flat role check, so **every evaluator currently sees every record**. The `?barangay=` filters are user-chosen query params, not enforced scoping. `recorded_by` / `logged_by` / `registered_by` / `reported_by` record *authorship*, not assignment.

### The barangay data supports it

| Table | Rows | Blank |
|---|---|---|
| `Farmer.barangay` | 3567 | **0** |
| `Fisherfolk.barangay` | 873 | **0** |
| `Pond.barangay` | 20 | **0** |
| `CropMonitoringRecord.farm_location_barangay` | 18 | **0** |
| `StockingRecord.pond_location_barangay` | 21 | **1** (id=110 — see backfill list) |

`BARANGAY_CHOICES` is a fixed 24-entry list (`core/constants.py:1-25`).

### Batch F scope — additive only

`User.assigned_barangays`: a `ManyToManyField` to a small `Barangay` table, or a validated `JSONField` of `BARANGAY_CHOICES` values. In-repo precedent for scoping M2Ms: `FeedType.species_options` / `DiseaseType.species_options` (`fisheries/models.py:295`, `:321`). Assignment managed on the existing user-admin surface (`pages/Users/UserManagementPage.jsx`, `EditUserModal.jsx`).

**No query behaviour changes in this batch.** Exit gate: an explicit count query proving **0 evaluators have an empty assignment** — see the deployment-ordering constraint at the top.

---

## BATCH G — Item 6, part 2: evaluator visibility restriction

### Blast radius

`IsAdminOrEvaluator` is used **162 times across 8 files**: `production/views.py` (52), `fisheries/views.py` (36), `reports/views.py` (21), `associations/views.py` (18), `interventions/views.py` (16), `farmers/views.py` (12), `monitoring/views.py` (5), `accounts/views.py` (2). Per **N2**, every one of these must keep ADMIN unrestricted while filtering EVALUATOR.

### Enforcement points (per N3 — parent-record level)

`Farmer`, `Fisherfolk`, `Pond`, `CropMonitoringRecord`, `StockingRecord`, plus their activity logs. Because logs are nested under their parent:

```
production/urls.py:88   monitoring/<int:monitoring_id>/logs/
production/urls.py:94   monitoring/logs/<int:id>/detail/
fisheries/urls.py:86    stocking/<int:stocking_id>/logs/
fisheries/urls.py:88    stocking/logs/<int:id>/detail/
```

scoping the parent queryset covers list access transitively. But the **detail/delete routes are keyed by log id directly**, so queryset filtering alone is insufficient — they need `has_object_permission`, exactly the lesson recorded in `IsStaffOrOwnRecordCitizen`'s docstring (`accounts/permissions.py:48-56`).

### Aggregates (per N4)

Evaluator's own dashboard/aggregate views scoped to assigned barangays; municipality-wide aggregate / forecasting / `reports/views.py` exports / audit log stay admin-only. Note `YieldAnalysisSummaryView` (`production/views.py:1061-1062`) is currently `IsAdminOrEvaluator` — under N4 it becomes admin-only or evaluator-scoped, which is a **behaviour change for evaluators who use it today.**

### Fail-closed (per N5, N6)

Zero-barangay evaluator → empty result + an empty state directing them to the administrator. `StockingRecord` id=110 (blank barangay) → ADMIN-visible only until backfilled.

---

## BATCH H — Item 2: citizen profile editing

| Thing | Location |
|---|---|
| Existing endpoint | `GET`/`PATCH /accounts/me/` — `accounts/views.py:263-277`, `[IsAuthenticated]` |
| Read serializer | `UserSerializer`, `accounts/serializers.py:20-52` |
| Write serializer | `MeUpdateSerializer`, `accounts/serializers.py:132-140` — only `full_name`, `contact_number`, `email` |
| Staff UI (**unchanged**) | `pages/Profile/ProfilePage.jsx`; route `App.jsx:85-92` is ADMIN/EVALUATOR-only |

`/accounts/me/` edits the **`User`** row. Everything a citizen would recognise as "my profile" lives on the **domain record** and has no self-service write path — hence a new endpoint.

**Latent bug not to inherit:** `MeUpdateSerializer` accepts `email` with no uniqueness validation and no `username` sync, unlike `UserUpdateSerializer` (`serializers.py:117-129`). Q2.2 sidesteps this rather than requiring a fix.

### Field split (final)

| Field | Farmer | Fisherfolk | Org |
|---|---|---|---|
| `contact_number` | **edit** | **edit** | **edit** |
| `civil_status`, `highest_education` | **edit** | **edit** | — |
| `first/middle/last_name` | read-only (**N1**) | read-only (**N1**) | — |
| `barangay`, `municipality`, `province` | read-only | read-only | read-only |
| Farm parcel / pond IDs | read-only | read-only | — |
| `rsbsa_number` / `fishr_number` / `lgu_registration_number` | read-only | read-only | read-only |
| `birthdate`, `gender` | read-only | read-only | — |
| `is_pwd`, `is_4ps_beneficiary`, `is_icc_ip_member` | read-only | read-only | — |
| `fisherfolk_type`, `farmers_organization` | — | read-only | — |

Barangay read-only matters twice over now: it is the citizen-scoping key **and**, after batch G, the evaluator-assignment key. Read-only status enforced **server-side** via `read_only_fields`, not by hiding inputs.

New `CitizenProfileView` (`GET`/`PATCH /accounts/me/profile/`), per-type serializers, new citizen-styled screen under `pages/Citizen/`. `/profile` and `ProfilePage.jsx` untouched.

---

## BATCH I — Item 4c (crop)

| Field | Current | Reference table |
|---|---|---|
| `fertilizer_type` | free-text `<input>` (`CitizenActivityLogModal.jsx:387-393`) | **none exists** |
| `pest_disease_name` | free-text `<input>` (`CitizenActivityLogModal.jsx:424-430`) | **none exists** |

Crop free-text columns still hold only demo values (`Demo`, `Pest Attack`) — drift hasn't started, which is why doing this now is cheap.

**Deliberately not 1:1 with fisheries.** Crop `pest_disease_name` and fisheries `disease_type` are different concepts: the fisheries list is species-scoped aquatic pathology *plus* water-quality stress (`Poor Water Quality / Ammonia-Nitrite Stress` is 1 of the 5 seeded rows), while the crop equivalent spans insect pests *and* plant pathogens. Proposal: **parallel but domain-specific** models on the `DiseaseType` shape (name / description / is_active / `crop_types` M2M). Gated on **Q4c.2**.

---

## 🚩 Flagged for your decision

### New — raised by the revision-3 decisions

- **N7 — When a person's residence barangay differs from their record's location barangay, which one governs?**

  Measured: **5 of 21 StockingRecords** have a pond in a different barangay from the fisherfolk's residence. Fisherfolk 18 lives in **Poblacion** but has ponds in **San Juan West** and **Alaska**; fisherfolk 107 lives in **Gallano** with a pond in **San Antonio**.

  N3 says scope `Fisherfolk` *and* `Pond` *and* `StockingRecord` by "the same evaluator-barangay check" — but they don't share one barangay. As written this produces broken states:
  - the **Poblacion** evaluator sees fisherfolk 18 but none of their ponds or stocking records;
  - the **Alaska** evaluator sees the ponds and stocking records but **not the fisherfolk who owns them** — the record would render with a missing owner.

  Three candidate rules:
  1. **Residence governs everything** — scope all three by `Fisherfolk.barangay`. Simplest, one key. But a pond physically in Alaska is invisible to the Alaska evaluator.
  2. **Location governs operational records, residence governs the person, with a union read** — an evaluator additionally sees a person record when any of that person's operational records is in scope. Correct-feeling, more query complexity.
  3. **Either matches** — widest; an evaluator sees a record if residence *or* location is theirs.

  Crop shows **0 divergence today** (18 of 18 match), so it doesn't discriminate — but nothing prevents it: `farm_location_barangay` is a free `CharField` and `FarmParcel.barangay` is separate from `Farmer.barangay`. This needs a rule before batch G can be planned; it is the last real blocker on the item-6 track.

### Carried over

- **Q6.3 — How do organizations link to an evaluator?** More pressing now that N3 puts the restriction at parent-record level: `associations/views.py` has 18 `IsAdminOrEvaluator` usages, and orgs surface inside the Farmer registry via `farmers_organization`. An organization spans multiple barangays by membership, so barangay assignment doesn't map cleanly. Options: the org's own registered barangay; the union of its members' barangays; or orgs stay unrestricted. Related: `interventions/views.py` (16 usages) — beneficiary records hang off a Farmer/Fisherfolk, so they'd scope transitively, but that should be confirmed rather than assumed.
- **Q4c.2 — Create `FertilizerType` / `CropPestDiseaseType`?** And **who supplies the initial lists** — OMAg staff, or seed empty and let them populate via a settings page under `CropSettingsHub`? Seeding agronomic content is not something I should invent. **Blocks batch I.**
- **Q4c.3 — Keep the "Other" free-text escape hatch?** Keeping it preserves field usability and is also exactly what produced `Commercial fellet`. Middle path: keep "Other" but add a staff "unmatched values" review surface so drift stays visible and reconcilable — that surface is extra scope worth deciding now. **Blocks batches E and I.**
- **Q5.2 — Surface `missed_high_priority` to citizens?** Already computed, already scoped. But it reads as *"you missed these activities"*, while the endpoint's own `YIELD_ANALYSIS_DISCLAIMER` (`production/views.py:906-910`) says missed activities are **not proven causes**. A judgment about the OMAg–farmer relationship, not a technical one. **Blocks batch D.**

---

## ⛔ Out of scope — recommended follow-up (separate PR)

### `notify_all_except` broadcasts to every active user

`core/notifications.py:10-43`:

```python
recipients = User.objects.filter(is_active=True)
if actor is not None:
    recipients = recipients.exclude(pk=actor.pk)
```

**No role filter.** Every activity log, harvest, and disaster report fans out one `Notification` row per active user.

1. **Misrouting / privacy** — **74 rows already address CITIZEN recipients** about other people's records. Not currently rendered (`CitizenHomePage` never mounts `NotificationBell`), but the rows exist and the endpoint is role-agnostic — one UI change from being visible.
2. **Production risk** — with **4274 active citizen accounts**, one citizen logging one activity attempts a `bulk_create` of ~4274 rows. `Notification` total is 281 today, so this has **not yet been exercised at scale**.

Call sites include `fisheries/views.py:559-566` and the crop equivalent.

**Minimal fix:** filter recipients to `role__in=('ADMIN','EVALUATOR')` — one line, clear test, removes both problems.

**Interaction with batch G:** once evaluators are barangay-restricted, broadcasting to *all* evaluators is doubly wrong — an evaluator would be notified about records they cannot open. Doing this fix **before** G is cheaper than reworking it after; it is still its own PR either way.

---

## Standing constraints for every execution cycle

Carried forward from the 2026-07-29 incident, non-negotiable:

1. Any mutating call (POST/PATCH/DELETE) during verification targets a **disposable, clearly-tagged test account only** — never a real farmer/fisherfolk/organization record.
2. **Every mutating command's actual response is inspected before proceeding** — nothing piped away, nothing assumed.
3. Full cleanup of test fixtures afterward, including FK-dependent rows (`core_notification` via **both** `actor_id` and `recipient_id`, `core_recordlock.locked_by_id`, `token_blacklist_outstandingtoken.user_id`), with absence re-verified by explicit existence queries.
4. Gates before any batch is called done: `python manage.py check`, `python manage.py makemigrations --check`, `npm run build`.
