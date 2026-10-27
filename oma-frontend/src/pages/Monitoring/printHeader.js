// The letterhead of the printed documents built by disasterReportDocument.js (no screen, no assets, no network, so it can be tested):
// the official seal with the office's full name and "Aringay, La Union" centered under it. Every printed document uses this one header:
// no system-name tagline and never the OMAg acronym. The Reports page's own reports are built by the server (reports app), which prints
// the same office name.

export const OFFICE_NAME = 'Office of the Municipal Agriculturist'

// The seal's rendered box in the print page, in CSS pixels.
export const LOGO_PX = 70

export const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// The header's CSS. The box is square with object-fit: contain, so the seal keeps its own proportions.
export function headerCss() {
  return `
  header { text-align: center; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 10px; }
  header img { width: ${LOGO_PX}px; height: ${LOGO_PX}px; object-fit: contain; }
  header .org { font-weight: bold; color: #15803d; font-size: 14px; margin-top: 4px; }
  header .sub { color: #475569; font-size: 10px; }`
}

// The header's markup.
export function headerHtml({ logoUrl }) {
  return `<header>
    <img src="${escapeHtml(logoUrl)}" alt="">
    <div class="org">${escapeHtml(OFFICE_NAME)}</div>
    <div class="sub">Aringay, La Union</div>
  </header>`
}

// The line under every printed document: when it was printed and from which saved record, signed by the office (never the system).
export const printedFooter = (printedAt, label, reference) => `Printed ${printedAt} from the saved ${label} ${reference} — ${OFFICE_NAME}, Aringay, La Union.`
