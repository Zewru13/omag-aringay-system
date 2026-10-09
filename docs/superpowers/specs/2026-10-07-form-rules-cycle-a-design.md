# Form rules (cycle A): organization dates, guarded inputs, Total Loss

Status: draft for review (2026-10-07). Nothing in this spec is built yet.

This is cycle A of a 12-item request. The other cycles (accounts/email/passwords, crops, organization imports,
photos, organization profile edits) are separate specs. Focal person means the existing Evaluator role.

## 1. Goal

Make three kinds of form mistakes impossible instead of reported afterwards:

1. An organization cannot be registered before it was organized.
2. A field with a fixed format stops the user from typing anything that breaks the format (wrong characters,
   too many characters), in every form that has one.
3. A disaster cannot be marked a Total Loss unless the whole area is affected.

What the user said: "we should not be able to register an organization behind the date organized, please use common
sense" / "every form that has a format, make it fixed so it reduces the typing of the user, limit exceeding inputs,
apply that logic to all" / "disable the total loss in report disaster, both crops and pond, when the area affected is
not the max; you can only click total loss if the area affected is whole".

## 2. Decisions already made

| Question | Decision |
|---|---|
| Date registered vs date organized | Registered must be on or after organized (the same day is allowed). Neither may be in the future (already enforced) |
| Existing records that already break the rule | Left alone; flagged only when someone edits them |
| How strict are guarded inputs | Hard limits while typing (wrong characters are not accepted, extra length is not accepted), plus the same rule on the backend |
| Total Loss | Disabled until the area affected equals the full area; changing the area away from full unticks it; the backend refuses a total loss with a smaller area |

## 3. Out of scope

- Free-text fields with no fixed format (names, addresses, remarks).
- Password rules and email behaviour (cycle B), photos (cycle E), imports (cycle D).
- Rewriting existing stored data to match the new rules.

## 4. Item 1: organization dates

- Frontend: `CreateOrganizationModal` and `EditOrganizationModal`. The Date Registered picker gets `min` equal to Date
  Organized; changing Date Organized to a day after the current Date Registered clears Date Registered; the inline
  error reads "Date registered cannot be before the date organized." Both keep their existing `max` (today).
- Backend: `validate()` on `FarmersOrganizationDetailSerializer`, `FisherfolkOrganizationDetailSerializer` and the
  organization list/create serializers (whichever the create and import paths use) rejects
  `date_registered < date_organized` with an error keyed to `date_registered`. A partial update (PATCH) of only one of
  the two dates is checked against the stored other one.
- The organization import (`FarmersOrganizationImportView`, `FisherfolkOrganizationImportView`) applies the same
  rule per row, so a spreadsheet cannot bypass it.

## 5. Item 2: guarded inputs

### Shared inputs (new, small, in `components/UI`)
Built on the helpers that already exist in `utils/validation.js` and the existing `SegmentedIdInput`:

| Input | Behaviour |
|---|---|
| `PhoneInput` | digits only; typing anything else is ignored; capped at 11; the first two digits must be `09` (a first digit other than 0, or a second other than 9, is ignored); shows the 09XXXXXXXXX hint |
| `EmailInput` | spaces cannot be typed; capped at 254; lower-cased on blur; invalid format shown on blur |
| Segmented ID inputs (existing `SegmentedIdInput`) | used for every ID with a fixed shape: RSBSA (where one shape applies), PhilSys `NNNN-NNNN-NNNN-NNNN`, LGU registration `YYYY-03302-NNNN`, FishR `01-33-02-YYYY-NNNN`, parcel number, tax declaration number |
| `DecimalInput` | numbers only; a set number of decimals (hectares: 4, quantities: 2); no negative values; no value above a stated maximum (for example the parcel or planted area) |

### Forms to change (the plan starts with a grep audit that makes this list exhaustive)
Known gaps today: phone inputs are `type="tel"` with `maxLength=11` but still accept letters
(Create/Edit organization, Add/Edit farmer, Add/Edit fisherfolk, Edit user); PhilSys is free text in Add/Edit farmer
and Add fisherfolk; email is `type="email"` only in Add farmer, Add fisherfolk, Create/Edit organization,
Create/Edit user and the profile page; area fields in the parcel, crop and disaster forms have no decimal or maximum
guard. The citizen profile and the organization profile already sanitize their phone input and move to `PhoneInput`
too, so there is one implementation.

### Backend
Every format that has a frontend guard must have a backend validator, so the rule holds without the form:
- Organization contact number: `_validate_contact` currently strips non-digits and counts what is left; it becomes an
  exact `^09\d{9}$` check on the submitted value.
- Any format with no validator found by the audit gets one in `core/validators.py` (the existing format validators
  for RSBSA, PhilSys, LGU, FishR, parcel and tax declaration stay unchanged).

## 6. Item 10: Total Loss

- Crop disaster form (`DisasterReportModal` in `CropMonitoringPage.jsx`), the fisherfolk pond disaster form
  (`FisherfolkStockDisasterModal.jsx`) and the staff pond disaster forms (`StockingMonitoringModals.jsx` /
  `FisheriesRecordsPage.jsx`): the Total Loss checkbox is disabled, with a short reason shown ("Available only when the
  whole area is affected"), until Area Affected equals the full area (planted area for a crop, pond area for a pond).
  Typing a smaller area unticks it. Ticking it keeps the area at the full amount (today ticking it fills the area in).
- Backend (`production/serializers.py` crop disaster serializers, `fisheries/serializers.py` pond disaster serializer):
  `is_total_loss=True` with an area below the full area is a validation error on `is_total_loss`.
- The older Tagalog portal forms for farmers (`FarmerDisasterReportForm.jsx`, `CitizenDisasterScreen.jsx`) are dead code
  kept only because other dead files import them; they are not changed.

## 7. Risks and how they are covered

- **Over-strict inputs block a legitimate value** (for example an RSBSA that has one of the five valid shapes, or a
  contact number with a landline): the inputs follow the backend validators exactly; the audit lists any field where
  the backend accepts more than one shape, and that field keeps a looser guard rather than a wrong one.
- **Existing records fail on edit**: the new rules apply to what is submitted; an edit that does not touch the guarded
  field is not blocked by an old bad value in another field. Tests cover a PATCH of an unrelated field on a record that
  already breaks the date rule.
- **Staff pages regress** (the forms are shared by many pages): each change is in the shared input, and every touched
  form is opened in the browser; build and lint are compared with the committed files.

## 8. Phases (each usable on its own)

1. **Organization dates** (item 1): backend tests first, then the two forms and the import.
2. **Total Loss** (item 10): backend tests first, then the crop and pond forms.
3. **Guarded inputs** (item 2): shared inputs, backend validators with tests, then the audited forms one family at a
   time (organizations, farmers, fisherfolk, users, profiles, area fields).

## 9. Verification

Backend tests (new, written first) and the full suite on a throwaway MariaDB; browser checks on a throwaway database
and its own backend (never the live server), at desktop and 375 px; the touched forms opened as staff, farmer,
fisherfolk and organization where they apply; build; per-file lint compared with the committed files.

## 10. Open items to settle while planning

- Whether the RSBSA field is segmented (one shape) or free-text-with-mask, since the backend accepts five shapes.
- The exact maximum for each area field (parcel area, planted area, pond area) as the audit finds them.
