import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const { AUDIENCES, audienceFor, manualFor, allImages } = await import(new URL('../src/pages/Manual/manualContent.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// which manual an account gets
eq(audienceFor({ role: 'ADMIN' }), 'admin', 'admin')
eq(audienceFor({ role: 'EVALUATOR' }), 'focal', 'focal person')
eq(audienceFor({ role: 'CITIZEN', isFarmer: true }), 'farmer', 'farmer')
eq(audienceFor({ role: 'CITIZEN', isFisherfolk: true }), 'fisherfolk', 'fisherfolk')
eq(audienceFor({ role: 'CITIZEN', isOrg: true }), 'org', 'organization')

// every kind of account has a manual, with steps, and each guide says what it is about
AUDIENCES.forEach(({ id }) => {
  const guides = manualFor(id)
  assert.ok(guides.length >= 4, `${id} has guides`); n++
  guides.forEach((g) => {
    assert.ok(g.title && g.intro && g.steps.length > 0, `${id}/${g.id} is complete`); n++
    g.steps.forEach((s) => assert.ok(s.text.trim().length > 10, `${id}/${g.id} step text`))
  })
  eq(new Set(guides.map((g) => g.id)).size, guides.length, `${id}: guide ids are unique`)
})

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

console.log(`manualContent: ${n} checks passed`)
