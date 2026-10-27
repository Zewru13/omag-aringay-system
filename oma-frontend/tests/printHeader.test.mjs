import assert from 'node:assert/strict'

const { OFFICE_NAME, LOGO_PX, headerCss, headerHtml, escapeHtml, printedFooter } = await import(new URL('../src/pages/Monitoring/printHeader.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const has = (text, part, label) => { assert.ok(text.includes(part), `${label}: expected ${JSON.stringify(part)} in ${text}`); n++ }
const lacks = (text, part, label) => { assert.ok(!text.includes(part), `${label}: did not expect ${JSON.stringify(part)} in ${text}`); n++ }

const logoUrl = 'http://localhost/assets/logo.jpg'

// ── one header for every printed document: the seal, the office's full name, the place
eq(LOGO_PX, 70, 'the seal size')
has(headerCss(), 'width: 70px; height: 70px; object-fit: contain', 'the seal is square so its proportions never change')
const header = headerHtml({ logoUrl })
eq(OFFICE_NAME, 'Office of the Municipal Agriculturist', 'the office name')
has(header, '<div class="org">Office of the Municipal Agriculturist</div>', 'the office name under the seal')
has(header, 'Aringay, La Union', 'the place line')
has(header, `<img src="${logoUrl}"`, 'the seal image')
assert.ok(header.indexOf('<img') < header.indexOf('class="org"'), 'the seal is above the name'); n++

// ── never the system's long name, never the acronym
lacks(header, 'INTEGRATED AGRICULTURAL', 'no system name in the header')
lacks(header, 'MONITORING MANAGEMENT SYSTEM', 'no part of it either')
lacks(header, 'OMAg', 'no acronym in the header')
lacks(headerHtml({ logoUrl, systemTitle: 'SOME SYSTEM TITLE' }), 'SOME SYSTEM TITLE', 'a system title is never drawn, even if one is passed')

// ── the footer line names the office in full
const footer = printedFooter('Oct 27, 2026, 9:00 AM', 'disaster log', 'FDR-1')
eq(footer, 'Printed Oct 27, 2026, 9:00 AM from the saved disaster log FDR-1 — Office of the Municipal Agriculturist, Aringay, La Union.', 'the footer')
lacks(footer, 'OMAg', 'no acronym in the footer')
lacks(footer, 'Integrated Agricultural', 'no system name in the footer')

// ── text is escaped
has(headerHtml({ logoUrl: 'a"b<c' }), 'a&quot;b&lt;c', 'escaped url')
eq(escapeHtml(`"'`), '&quot;&#39;', 'quotes')

console.log(`printHeader: ${n} checks passed`)
