import assert from 'node:assert/strict'

const { OFFICE_NAME, LOGO_PX, OFFICE_LOGO_PX, headerCss, headerHtml, escapeHtml } = await import(new URL('../src/pages/Monitoring/printHeader.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const has = (text, part, label) => { assert.ok(text.includes(part), `${label}: expected ${JSON.stringify(part)} in ${text}`); n++ }
const lacks = (text, part, label) => { assert.ok(!text.includes(part), `${label}: did not expect ${JSON.stringify(part)} in ${text}`); n++ }

const TAGLINE = 'INTEGRATED AGRICULTURAL MONITORING MANAGEMENT SYSTEM FOR THE OFFICE OF MUNICIPAL AGRICULTURIST OF ARINGAY, LA UNION'
const logoUrl = 'http://localhost/assets/logo.jpg'

// ── the seal: 56 px before, exactly 25% bigger (70 px) on the individual disaster reports, square so its proportions never change
eq(LOGO_PX, 56, 'the seal as it was')
eq(OFFICE_LOGO_PX, 70, 'exactly 125% of 56')
eq(OFFICE_LOGO_PX / LOGO_PX, 1.25, 'the ratio')
has(headerCss({ office: true }), 'width: 70px; height: 70px; object-fit: contain', 'disaster report seal')
has(headerCss({ office: false }), 'width: 56px; height: 56px; object-fit: contain', 'every other document keeps its seal size')
has(headerCss(), 'width: 56px; height: 56px', 'the default is the old size')

// ── the individual disaster reports: the office name under the seal, no tagline, no "OMAg"
const disaster = headerHtml({ office: true, logoUrl, systemTitle: TAGLINE })
eq(OFFICE_NAME, 'Office of the Municipal Agriculturist', 'the office name')
has(disaster, `<div class="org">Office of the Municipal Agriculturist</div>`, 'office name')
has(disaster, 'Aringay, La Union', 'the place line stays')
lacks(disaster, TAGLINE, 'the long system name is gone')
lacks(disaster, 'INTEGRATED AGRICULTURAL', 'no part of the tagline')
lacks(disaster, '>OMAg<', 'OMAg is replaced')
has(disaster, `<img src="${logoUrl}"`, 'the same seal image')
// the seal comes first, the office name after it, so the name is centered beneath the logo
assert.ok(disaster.indexOf('<img') < disaster.indexOf('class="org"'), 'logo above the name'); n++

// ── every other document sharing the print builder is unchanged
const other = headerHtml({ office: false, logoUrl, systemTitle: TAGLINE })
has(other, '<div class="org">OMAg</div>', 'OMAg stays')
has(other, TAGLINE, 'the tagline stays')
lacks(other, OFFICE_NAME, 'no office name')

// ── text is escaped
has(headerHtml({ office: false, logoUrl, systemTitle: 'A & <B>' }), 'A &amp; &lt;B&gt;', 'escaped title')
eq(escapeHtml(`"'`), '&quot;&#39;', 'quotes')

console.log(`printHeader: ${n} checks passed`)
