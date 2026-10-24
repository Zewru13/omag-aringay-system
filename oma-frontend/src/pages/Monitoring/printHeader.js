// The letterhead of the printed documents built by disasterReportDocument.js (no screen, no assets, no network, so it can be tested).
//
// Two forms of it:
//   - the individual Farmer / Fisherfolk Disaster Reports (spec.officeHeader): the official seal, enlarged by exactly 25%, with the
//     centered name "Office of the Municipal Agriculturist" and "Aringay, La Union" under it. No system-name tagline.
//   - every other document that shares the print builder (the harvest, force harvest and assistance reports): the header it always had.
// The Reports page's own reports are built by the server (reports app) and do not use this file at all.

export const OFFICE_NAME = 'Office of the Municipal Agriculturist'

// The seal's rendered box in the print page, in CSS pixels. The disaster reports show it at exactly 125% of the size it had.
export const LOGO_PX = 56
export const OFFICE_LOGO_PX = LOGO_PX * 1.25   // 70

export const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// The header's CSS. The box is square with object-fit: contain, so the seal keeps its own proportions at either size.
export function headerCss({ office = false } = {}) {
  const size = office ? OFFICE_LOGO_PX : LOGO_PX
  return `
  header { text-align: center; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 10px; }
  header img { width: ${size}px; height: ${size}px; object-fit: contain; }
  header .org { font-weight: bold; color: #15803d; font-size: 14px; margin-top: ${office ? 4 : 2}px; }
  header .sub { color: #475569; font-size: 10px; }`
}

// The header's markup. `systemTitle` is only used by the documents that still show it under the logo.
export function headerHtml({ office = false, logoUrl, systemTitle = '' }) {
  const img = `<img src="${escapeHtml(logoUrl)}" alt="">`
  if (office) {
    return `<header>
    ${img}
    <div class="org">${escapeHtml(OFFICE_NAME)}</div>
    <div class="sub">Aringay, La Union</div>
  </header>`
  }
  return `<header>
    ${img}
    <div class="org">OMAg</div>
    <div class="sub">Aringay, La Union</div>
    <div class="sub">${escapeHtml(systemTitle)}</div>
  </header>`
}
