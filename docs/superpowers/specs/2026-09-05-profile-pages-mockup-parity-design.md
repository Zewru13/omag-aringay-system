# Profile Pages — Exact Mockup Parity

Date: 2026-09-05
Status: Approved, ready for implementation planning

## Reference sources

Two files, treated as the literal source of truth for UI — copied exactly, not adapted:

- `D:\SAMPLE FORMS\PROFILE BASIS.docx` — 16 pasted screenshots, no text. Covers: Admin/Staff
  profile (resting view, Edit Profile modal — Profile Info tab, Change Password tab) and an
  early pass of the Farmer / Fisherfolk-Org citizen profiles.
- `D:\Downloads\screenshots\` — 13 images, each labeled with a Figma-style frame tag
  (`B — Staff`, `B1 — Individual`, `B2 — Organization`, `~1440px` / phone width, `DESKTOP`).
  Covers all 5 account types across Windows POV (desktop) and Phone POV (mobile), plus 4
  Help ("Tulong") screens. This is the fuller, more current reference; where it and the docx
  differ, the screenshots folder wins (it's the more complete/recent set).

## Audit — what already matches vs. what's a real gap

Verified by reading the actual current frontend code and comparing every screenshot
side-by-side, both POVs, not assumed from one sample.

**Already exact matches — no changes needed:**

| Account type | Component | Verified against |
|---|---|---|
| Farmer (individual) | `src/pages/Citizen/CitizenProfileScreen.jsx` | 02 (mobile), 03 (desktop) |
| Fisherfolk (individual) | same component, `recordType='FISHERFOLK'` | 04 (mobile), 05 (desktop) |
| Farmers Organization | `src/pages/Citizen/OrganizationHomeScreen.jsx` | 06 (mobile), 07 (desktop) |
| Fisherfolk Organization | same component, fisherfolk variant | 08 (mobile), 09 (desktop) |

These were built in an earlier session directly against this same reference material
(confirmed by the "Re-built against the Desktop POV reference's actual layout" comment
already in `CitizenProfileScreen.jsx`). Nothing in this spec touches them.

**Real gaps — this spec's scope:**

1. Staff/Admin profile (Desktop POV only — no phone mockup exists for this account type)
2. Farmer Help page (both POVs)
3. Fisherfolk Help page (both POVs)

## 1. Staff/Admin profile

Replaces `src/pages/Profile/ProfilePage.jsx` entirely. Reference: docx images 1–4.

**Resting view** (docx image 1 / screenshot `01-staff-desktop.png`'s intent, minus its
duplicated fields):
- Left card: cover-banner (green, `--color-primary-deep`), circular avatar with initials,
  camera-icon overlay for photo upload, full name, role badge (Admin / Focal Person),
  "● Active" status dot
- Right card, single **"Account Details"** section (not split across two cards like the
  interim screenshot showed): Full Name, Email Address (read-only), Username (read-only),
  Role (read-only), Date Joined (read-only), Status row with an "Edit Profile" button

**Edit Profile modal** (docx images 2–4):
- Header: "Edit Profile" title, "{name} · {role}" subtitle, close X
- Two tabs: **Profile Info** (default) and **Change Password**
- Profile Info tab: Profile Photo (avatar + camera icon + "Click the camera to upload a
  new photo"), editable Full Name field, then Email/Username/Role/Date Joined grouped as
  read-only rows, "Account Active" status line, Cancel / Save Changes footer
- Change Password tab: "Voluntary password change" info banner (key icon), Current
  Password, New Password + Confirm New Password (side by side), "Update Password" button
  — reuses the existing `PasswordRequirementChecklist` and the same confirm-before-logout
  flow already in `ProfilePage.jsx` (`ConfirmDialog` warning the session ends after a
  password change)

**Backend changes required:**
- `accounts/serializers.py` — `UserSerializer.Meta.fields`: add `'username'` (already a
  real field on `AbstractUser`; read-only, not accepted on update)
- `accounts/models.py` — add `profile_picture` (ImageField) to `User`, migration to match
- New/extended endpoint for uploading it — mirror the existing citizen pattern (Farmer/
  Fisherfolk/Org already validate extension + MIME + real Pillow decode, 5MB cap; reuse
  that same validator, don't reinvent it)
- `PATCH /accounts/me/` already handles full_name/email/contact_number; extend to accept
  the photo upload (multipart) the same way the citizen self-edit endpoints do

## 2. Farmer Help & Fisherfolk Help pages

Two new pages, reachable from the existing "Tulong" row already present on the Farmer/
Fisherfolk `CitizenProfileScreen`. Modeled structurally on the existing
`OrgHelpScreen.jsx`, but **desktop and mobile are genuinely different layouts here** —
build both explicitly, not one responsive component pretending to be both.

**Desktop POV** (screenshots 11, 13):
- Plain white page header (breadcrumb-style, matches rest of app), "← Bumalik sa Profile",
  "Tulong" title + subtitle
- Left: "MGA MADALAS NA TANONG" FAQ accordion card
- Right sidebar: "MAKIPAG-UGNAYAN SA OMAG ARINGAY" contact card (Opisina / Adres / Telepono
  / Oras ng Opisina — every value literally `[... — placeholder]`, plus the explicit
  "hindi pa pinal ang opisyal na impormasyon" notice — do not invent real contact details),
  and a "FIELD BEHAVIORS" legend card (Instant edit / Request-a-change / Read-only)

**Mobile POV** (screenshots 10, 12):
- Colored cover-banner header (green for Farmer / blue for Fisherfolk) containing the back
  arrow, "OMAG ARINGAY" eyebrow, "Tulong" title, subtitle — matches the profile page's own
  cover-banner treatment, not the desktop's plain header
- FAQ accordion card (same content as desktop)
- Contact card (same placeholder content as desktop)
- **No Field Behaviors card on mobile** — instead a "Mag-logout" row (red, logout icon) at
  the bottom. This is a real content difference from desktop, not an oversight to fix.

**FAQ content** (from the mockups, per domain):
- Farmer: crop activity logging, harvest recording + the 50% duration gate, disaster
  reporting + recovery, Yield Variance Analysis, requesting name/barangay changes +
  "Nakabinbin sa pagsusuri", instant-edit vs. request-a-change
- Fisherfolk: feeding log + "Ulitin ang pakain kahapon", harvest recording per pond,
  disaster reporting (incl. fish kill) + recovery, disease/mortality logging + why only
  general care guidance is shown, requesting name/barangay changes, instant-edit vs.
  request-a-change

No backend changes needed — this is static FAQ content, same pattern as `labels.js`
already uses for `OrgHelpScreen`.

## Out of scope

- Any change to Farmer/Fisherfolk/Org profile pages — already correct, untouched
- Any change to the citizen inline-edit / request-a-change mechanism itself
