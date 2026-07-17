# OMAg Aringay UI/UX Redesign — "Cultivated Ground"

Date: 2026-07-17
Status: Approved (foundation + Dashboard + Login pilot)

## Thesis

The app already has a custom forest-green agricultural identity. The problems are
structural, not stylistic: the palette is hardcoded as arbitrary hex across dozens of
files (no real token system), the two most-visible pages (Login, Dashboard) leak generic
`slate-*` grays, depth is flat (one shadow), neutrals read cold/clinical, the favicon is
an off-brand purple blob, and there is dead code (`App.css`, default README).

This is an **elevation** of the existing identity into a maintainable token system with
warmer neutrals, a distinctive civic type pairing, real elevation, and one coherent
motion language. Register: **professional / institutional** (municipal government).

## Design decisions (approved)

- **Typography:** Fraunces (warm optical serif) for display/titles/stat numerals;
  Public Sans (U.S. federal design-system sans) for all body/UI/table text. Tabular
  numerals for data.
- **Scope, pass 1:** token foundation + shared primitives, then Dashboard + Login.
  Heavy data pages (CropMonitoring, FisheriesRecords, Forecasting, etc.) follow in a
  later pass once the direction is approved in-app.

## Token system (src/index.css — single source of truth)

Replace the de-facto hardcoded palette with CSS variables consumed via Tailwind v4
`@theme`. Components reference tokens (`bg-primary`, `text-secondary`, `shadow-md`),
never raw hex.

### Color — "Cultivated Ground"

| Role | Token | Value | Notes |
|---|---|---|---|
| Brand primary | `--color-primary` | `#1B4D2E` | forest — unchanged anchor |
| Brand hover | `--color-primary-hover` | `#235E38` | moss |
| Brand deep | `--color-primary-deep` | `#163318` | canopy — headers/depth |
| Brand tint | `--color-primary-light` | `#EBF5EE` | fern — active nav / soft fills |
| Brand muted | `--color-primary-muted` | `#C8E6D0` | |
| Accent (CTA/highlight) | `--color-accent` | `#B45309` | harvest gold — NOT a status color |
| Accent tint | `--color-accent-light` | `#FBEED6` | |
| Page bg | `--color-bg` | `#F6F5F1` | warm parchment (was cold `#F5F7F5`) |
| Surface | `--color-surface` | `#FFFFFF` | |
| Surface raised | `--color-surface-2` | `#FAFAF7` | warm off-white |
| Border | `--color-border` | `#E7E5DE` | warm hairline |
| Border strong | `--color-border-strong` | `#D8D5CC` | |
| Text primary | `--color-text-primary` | `#1C2A1E` | warm ink |
| Text secondary | `--color-text-secondary` | `#4A5A4C` | |
| Text muted | `--color-text-muted` | `#6B7669` | darkened for AA (~4.6:1) |
| Safe | `--color-semantic-safe` | `#2D7A4F` / bg `#E7F5EC` | |
| Warning | `--color-semantic-warning` | `#C2740A` / bg `#FBEED6` | |
| Critical | `--color-semantic-critical` | `#B4271B` / bg `#FBE3E0` | deepened for AA |
| Completed | `--color-semantic-info` | `#275E63` / bg `#DCEEF0` | slate-teal, replaces off-brand indigo |

All text/background pairs verified ≥ 4.5:1 (AA). Status colors always pair with an
icon/dot (color-not-alone).

### Elevation (forest-tinted shadows — cohesion vs. neutral black)

- `--shadow-xs`: `0 1px 2px rgba(22,51,24,.06)`
- `--shadow-sm`: `0 1px 3px rgba(22,51,24,.08), 0 1px 2px rgba(22,51,24,.05)`
- `--shadow-md`: `0 4px 12px rgba(22,51,24,.07), 0 2px 4px rgba(22,51,24,.05)` (cards/panels)
- `--shadow-lg`: `0 12px 28px rgba(22,51,24,.10), 0 4px 10px rgba(22,51,24,.06)`
- `--shadow-modal`: `0 24px 60px rgba(22,51,24,.16)`

### Radius / motion tokens

- Radius: `--radius-sm 8px`, `--radius-md 12px`, `--radius-lg 16px`
- Motion: `--dur-fast 140ms`, `--dur-base 220ms`, `--dur-slow 320ms`;
  `--ease-out cubic-bezier(.22,.61,.36,1)`, `--ease-spring cubic-bezier(.34,1.4,.64,1)`

## Motion language (one system, gated by prefers-reduced-motion)

- **Staggered entrance:** cards/table rows fade+rise (`translateY(8px)→0`, opacity), ~40ms
  cascade per item, `--ease-out`, `--dur-base`. Cap at first ~10 items.
- **Press feedback:** `scale(0.98)` on interactive cards/buttons.
- **Skeleton shimmer** for loads > 300ms.
- **Modals** spring-scale from center (`--ease-spring`).
- `@media (prefers-reduced-motion: reduce)` disables all transforms/animations → instant.

## Structural device — "strata rail"

A 3px left accent rail encodes panel role: forest (`--color-primary`) for primary panels
and active nav; harvest (`--color-accent`) for highlighted/accent panels and KPIs. Rail
sits on full-radius cards via absolute-positioned bar (no single-sided rounded borders).

## Files

Foundation:
- `src/index.css` — token system, fonts, keyframes, motion, reduced-motion
- `index.html` — Fraunces + Public Sans, favicon, meta description, theme-color
- `public/favicon.svg` — green seal-derived mark
- `src/components/UI/Button.jsx`, `DataTable.jsx`, `StatusPill.jsx`, `ModalShell.jsx`,
  `EmptyState.jsx`, `LoadingSpinner.jsx`
- `src/components/Layout/Sidebar.jsx`, `Navbar.jsx`, `PageLayout.jsx`
- delete `src/App.css`

Pilot:
- `src/pages/Dashboard/DashboardPage.jsx` + `src/components/dashboard/*`
- `src/pages/Login/LoginPage.jsx`

## Accessibility checklist

- Contrast ≥ 4.5:1 all text pairs; focus-visible rings (2px, `--color-accent`/primary);
  min 44×44 touch targets; status color-not-alone; reduced-motion honored; keyboard nav
  preserved; tabular numerals prevent layout shift.
