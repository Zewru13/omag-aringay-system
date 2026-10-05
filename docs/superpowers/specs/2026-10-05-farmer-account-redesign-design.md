# Farmer account redesign: the system's own pages, on desktop and phone

Status: draft for review (2026-10-05). Nothing in this spec is built yet.

## 1. Goal

A farmer account should look and feel like the fisherfolk account does today: the system's real pages (the same
tables, forms and modals staff use), limited to the farmer's own records, with the farmer phone layout built the
same way as the fisherfolk one. The farmer's current purpose-built Tagalog portal is replaced.

What the user said: "redesign the farmer account into something that matches the system, just like the
fisheries account ... the tables, forms, and so on ... do both windows and phone POV".

## 2. Decisions already made

| Question | Decision |
|---|---|
| Language | English, like the fisheries account ("for now") |
| Can a farmer create crop records? | No. Today's abilities are unchanged: OMAg staff register crops |
| Approach | Mirror the fisherfolk implementation (role-aware existing pages + an own-records backend rule). Not a shared refactor of both roles, and not wrapper pages |

A farmer keeps exactly what they can do today: view their crops, log and edit activity on them, record a harvest,
report and resolve a disaster, see yield results, see assistance and confirm or report not received, and request
profile changes (name, barangay, contact number, picture, password). A farmer with no crop records can log
nothing (nothing to log against).

## 3. Out of scope

- Self-service crop creation, import, edit or delete of crop records.
- Organization accounts and the fisherfolk account (unchanged).
- A Tagalog version of the new screens.
- Any change to the fisheries code (his), except where a shared component gains an optional theme setting.

## 4. Backend: the "own records" rule for farmers

Mirrors `accounts/permissions.py` for fisherfolk (`IsStaffOrFisherfolk`, `fisherfolk_scope`, `scope_to_fisherfolk`):

- `is_farmer_citizen(user)`, `farmer_scope(user)` (None for staff, the user's own Farmer id for a farmer account),
  `scope_to_farmer(queryset, user, lookup)`, and a permission class `IsStaffOrFarmer` with
  `farmer_blocked_methods` for staff-only HTTP methods.
- Staff behave exactly as today. A farmer sees only rows of their own farmer record; another farmer's id is a 404.
  Any other role (organization, unlinked citizen) is rejected.
- Farmer and fisherfolk ids are different tables: every check compares the linked record TYPE as well as the id
  (the existing `owner_record_type` convention), so a farmer id can never match a fisherfolk's.

### Endpoints (from a route-by-route review of what the farmer-mode pages call)

Already open to a farmer and own-scoped today (no change beyond a review): monitoring list, suggestions, activity
log list/create/detail, crop disaster list/create under a crop and resolve, harvest create, yield analysis,
activity types, input types, assistance history, confirm received / report not received, profile requests and
picture, record locks.

To open to a farmer, own records only:

| Route | View | Farmer may |
|---|---|---|
| `production/monitoring/<id>/` | CropMonitoringDetailView | GET only (PATCH, DELETE stay staff) |
| `production/disaster-logs/`, `<id>/`, `<id>/pdf/` | CropDisasterLog* views | read, print, download own logs |
| `production/crop-types/` | CropTypeListView | GET only (reference data) |
| `production/crop-types/<id>/stages/` | CropActivityStageListCreateView | GET only |
| `reports/farmer-crop-history/` | FarmerCropHistoryReport | own history (the farmer filter is forced to them) |

Stay staff-only: crop record create/import/edit/delete, `yield-analysis/summary/`, activity log delete, harvest
edit/delete, remarks, labor, inputs, pest/disease, varieties, seed sources, all farmer/parcel registry endpoints.

### Backend tests (written first, per endpoint)

Own record works; another farmer's id is 404; a create is forced onto the farmer's own record; a fisherfolk
account, an organization account and an unlinked citizen are rejected; staff unchanged; a farmer cannot reach any
staff-only route in the list above. The whole existing suite (164 tests) stays green.

## 5. Frontend

### Routing and navigation
- `AuthContext` gains `isFarmer` (like `isFisherfolk`); `ProtectedRoute` gains `allowFarmer`. The crop pages'
  routes allow a farmer account in.
- Desktop sidebar for a farmer (`FARMER_NAV`, same plain top-level links as `FISHERFOLK_NAV`): Crop Monitoring,
  Forecasting, Disaster, Assistance, My Profile. The landing page (`/my-account` on desktop) forwards to Crop
  Monitoring, like fisherfolk land on Fisheries Monitoring.
- Phone (under 768 px): the existing `FisherfolkPhoneShell` becomes a shared `CitizenPhoneShell` with a theme
  (crop green or fisheries blue). Same five tabs (Home, Monitoring, Disaster, Forecasting, Assistance) and the
  same avatar menu (My Profile, Help, Log out). The fisherfolk phone view must look and behave exactly as before.

### Pages in farmer mode (the same pattern as `FisheriesAssistancePage`'s `isFisherfolk` branch)
- **Crop Monitoring**: the farmer's own crops in the standard table and card list. No add, import, bulk, edit or
  delete. Opening a crop shows its details, the activity log (log, edit), suggestions, harvest, and its disasters.
- **Forecasting**: the farmer's own yield analysis and crop history; no farmer picker; no aggregate comparison.
- **Disaster**: the Crop Disaster view only, own logs (view, print, download, resolve). Log Disaster chooses among
  the farmer's own crops and is disabled with an explanation when they have none.
- **Assistance**: "Assistance Received" with Confirm Received and Report Not Received; distribution, import and
  edit stay staff tools.
- **My Profile / Help**: the existing citizen profile and help components in their embeddable mode, English help
  text for farmers (like `FISHERFOLK_HELP_EN`). The profile shows the RSBSA number.

### Phone Home (new `FarmerPhoneHome`, like `FisherfolkPhoneHome`)
Four tiles (parcels, active crops, total area, harvests this month), a needs-attention card for overdue or
due-today activity suggestions, and one card per active crop with Open crop and Report disaster. It reads the
endpoints the current farmer home already uses.

### Retiring the old portal
After the new routes are verified: remove the Tagalog farmer portal screens (`FarmerHomeScreen` and the Farmer*
files they alone use, `CitizenFarmerActivityScreen`, the farmer parts of `labels.js`). The organization and shared
citizen components stay. This is the last phase, so the old screens remain available until the new ones pass.

## 6. Risks and how they are covered

- **Data exposure** (one unscoped endpoint shows another farmer's data): per-endpoint tests, plus a scripted sweep
  of every API route as a farmer, expecting 403/404 on everything outside section 4.
- **Staff pages regress** (the crop pages are large and shared): every farmer-mode change is behind `isFarmer`;
  staff screens are re-checked in the browser; frontend build and lint compared against the committed versions.
- **Fisheries regress** (shared phone shell and chrome): the theme setting defaults to today's behaviour, and the
  fisherfolk phone and desktop views are re-checked after the change.
- **Zero-crop farmers**: nothing to log; every action that needs a crop shows the explanation instead of a form.

## 7. Phases (each is usable on its own)

1. **Backend scoping and tests** (section 4). Done when the farmer-route sweep passes and the suite is green.
2. **Desktop farmer mode**: routing, `FARMER_NAV`, the five pages. Done when a farmer account can do everything in
   section 2 through the system's pages on a desktop-size window and nothing outside it.
3. **Phone**: shared phone shell, `FarmerPhoneHome`, the same five tabs. Done when the same is true at 375 px.
4. **Retire the old portal**, then update the help text and notes.

## 8. Verification at the end of each phase

Backend tests and the full suite; browser checks as a farmer (desktop and 375 px), as staff and as a fisherfolk
(to prove nothing moved); frontend build; lint compared with the committed versions; temporary login tokens
revoked afterwards. Only two farmer accounts are currently ready to log in (both have crops); a zero-crop farmer
is tested at the API level and with a stubbed response in the browser.

## 9. Open items to settle while planning

- Whether the farmer's Forecasting page keeps the By Farmer and By Crop tabs or only the yield analysis table
  (decided from what the page does when the farmer picker is hidden).
- Exact English wording for the farmer help text (drafted from the existing Tagalog help).
