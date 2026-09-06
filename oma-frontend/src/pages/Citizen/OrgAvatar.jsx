// Batch 2: initials avatar for organization member / officer lists.
//
// Its own file rather than a second export from OrganizationHomeScreen:
// mixing component and non-component exports in one module breaks React
// Fast Refresh for that module (react-refresh/only-export-components), and
// three screens import this.
//
// Phase 1 re-verification (2026-09-07) against the actual reference images
// found every avatar in image2/9/10 uses ONE uniform domain tint (light
// green bg, dark green text for Farmers) — never a rotating rainbow. The
// previous rainbow AVATAR_TINTS palette this file shipped with was not
// actually sampled from the reference correctly; replaced with the same
// `theme.tileSelectedBg`/`tileSelectedText` pair every other domain-tinted
// surface already uses, so member identity comes from the initials alone,
// same as the reference.
function initialsOf(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function Avatar({ name, theme, size = 40 }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-[13px] font-medium ${theme.tileSelectedBg} ${theme.tileSelectedText}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  )
}
