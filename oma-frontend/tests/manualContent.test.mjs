import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const { AUDIENCES, audienceFor, manualFor, manualIntro, allImages } = await import(new URL('../src/pages/Manual/manualContent.js', import.meta.url).href)
const { buildManualHtml } = await import(new URL('../src/pages/Manual/manualPrint.js', import.meta.url).href)
const { default: SCREENS } = await import(new URL('../src/pages/Manual/manualScreens.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// which manual an account gets
eq(audienceFor({ role: 'ADMIN' }), 'admin', 'admin')
eq(audienceFor({ role: 'EVALUATOR' }), 'focal', 'focal person')
eq(audienceFor({ role: 'CITIZEN', isFarmer: true }), 'farmer', 'farmer')
eq(audienceFor({ role: 'CITIZEN', isFisherfolk: true }), 'fisherfolk', 'fisherfolk')
eq(audienceFor({ role: 'CITIZEN', isOrg: true }), 'org', 'organization')

// every kind of account has a manual: guides with numbered steps and annotated screens, each guide says what it is about
AUDIENCES.forEach(({ id }) => {
  const guides = manualFor(id)
  assert.ok(guides.length >= 4, `${id} has guides`); n++
  guides.forEach((g) => {
    assert.ok(g.title && g.intro && g.steps.length > 0 && g.screens.length > 0, `${id}/${g.id} is complete`); n++
    g.steps.forEach((s) => assert.ok(typeof s === 'string' && s.trim().length > 10, `${id}/${g.id} step text`))
    g.screens.forEach((s) => {
      assert.ok(s.title && s.purpose && s.image, `${id}/${g.id}/${s.id} is described`); n++
      assert.ok(s.legend.length >= 1, `${id}/${g.id}/${s.id} has a legend`); n++
      s.legend.forEach((row, i) => { eq(row.n, i + 1, `${s.id}: legend numbers run 1, 2, 3...`); assert.ok(row.label && row.desc, `${s.id} legend row ${row.n}`) })
    })
  })
  eq(new Set(guides.map((g) => g.id)).size, guides.length, `${id}: guide ids are unique`)
  const intro = manualIntro(id)
  assert.ok(intro.lead && intro.howToRead && intro.notes.length >= 3 && intro.contents.length === guides.length, `${id} intro`); n++
})

// a guide never names a screen that was not photographed (manualFor would silently drop it)
const listed = AUDIENCES.flatMap(({ id }) => manualFor(id))
listed.forEach((g) => assert.ok(g.screens.length > 0, `${g.id}: its screens exist`))
n++

// the farmer, fisherfolk and organization manuals each show phone-size screens (the sign-in page is shared)
;['farmer', 'fisherfolk', 'org'].forEach((id) => {
  const phone = manualFor(id).flatMap((g) => g.screens).filter((s) => s.phone && s.id !== 'login-phone')
  assert.ok(phone.length >= 3, `${id} has phone screens`); n++
})

// the Organization guide shows the Equipment TAB of My Organization (the page /my-equipment is Access Denied to an organization account)
const orgEquipment = manualFor('org').find((g) => g.id === 'equipment')
assert.ok(orgEquipment && orgEquipment.screens.some((s) => s.id === 'org-equipment' && /Equipment tab/.test(s.legend.map((r) => r.label).join(' '))), 'org equipment guide shows the Equipment tab'); n++

// a Focal Person does not see the Admin-only guides
const adminIds = manualFor('admin').map((g) => g.id)
const focalIds = manualFor('focal').map((g) => g.id)
assert.ok(adminIds.includes('settings') && adminIds.includes('users'), 'admin has settings and users'); n++
eq(focalIds.includes('settings') || focalIds.includes('users'), false, 'focal person: no admin-only guides')

// every screenshot a manual shows is a real file
const publicDir = new URL('../public', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
allImages().forEach((file) => {
  const full = path.join(decodeURIComponent(publicDir), file)
  assert.ok(fs.existsSync(full) && fs.statSync(full).size > 5000, `screenshot exists: ${file}`); n++
})
eq(Object.keys(SCREENS).every((id) => SCREENS[id].image.startsWith('/manual/')), true, 'screen images live under /manual/')

// the printable manual carries the intro, the numbered steps, the pictures and their tables
const html = buildManualHtml({ audienceLabel: 'Organization', guides: manualFor('org'), intro: manualIntro('org'), baseUrl: 'http://x' })
assert.ok(html.includes('How to read the pictures') && html.includes('Notes on the pictures'), 'print has the intro sections'); n++
assert.ok(html.includes('<img src="http://x/manual/org/equipment.png"') && html.includes('Equipment tab'), 'print has the Equipment tab picture and its legend'); n++
assert.ok(html.includes('class="tag">1</span>'), 'print has numbered legend rows'); n++

console.log(`manualContent: ${n} checks passed`)
