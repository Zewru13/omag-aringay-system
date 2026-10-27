import assert from 'node:assert/strict'

const { ROLE_LABELS, STEPS, SECTIONS, helpFor } = await import(new URL('../src/pages/Help/helpContent.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const questions = (help) => help.sections.flatMap((s) => s.items.map((i) => i.q))
const everything = (help) => JSON.stringify(help)

eq(ROLE_LABELS, { ADMIN: 'Admin', EVALUATOR: 'Focal Person' }, 'the two staff accounts')

const admin = helpFor('ADMIN')
const focal = helpFor('EVALUATOR')

// ── who sees what
assert.ok(admin.steps.length === focal.steps.length + 1); n++
eq(admin.steps[0].title, 'Set up the master data', 'an Admin starts with the master data')
assert.ok(!focal.steps.some((s) => /master data/i.test(s.title))); n++
eq(admin.steps.map((s) => s.step), admin.steps.map((_, i) => String(i + 1)), 'Admin steps are numbered from 1')
eq(focal.steps.map((s) => s.step), focal.steps.map((_, i) => String(i + 1)), 'Focal Person steps are numbered from 1 too')
assert.ok(questions(admin).includes('Where do I add a crop or change its growth duration?')); n++
assert.ok(!questions(focal).includes('Where do I add a crop or change its growth duration?')); n++
assert.ok(questions(admin).includes('How do I add a seed source?') && !questions(focal).includes('How do I add a seed source?')); n++
assert.ok(questions(admin).includes('How do I give someone an account?') && !questions(focal).includes('How do I give someone an account?')); n++
assert.ok(admin.sections.every((s) => s.items.length > 0) && focal.sections.every((s) => s.items.length > 0)); n++
eq(new Set(questions(admin)).size, questions(admin).length, 'no question is asked twice')
assert.ok(STEPS.length > 0 && SECTIONS.length > 0); n++

// ── the changes this page has to explain, for both accounts
for (const [label, help] of [['Admin', admin], ['Focal Person', focal]]) {
  const text = everything(help)
  for (const [what, needle] of [
    ['distributing to several organizations', 'Distribute to Organizations gives one assistance to the members of the organizations you tick'],
    ['ending a term with a reason', 'Transferred Registration'],
    ['the Others reason', 'choose Others'],
    ['lending to several members', 'Lend equipment'],
    ['the Returned table', 'Returned lists everything that was closed'],
    ['equipment without a condition', 'new equipment starts as Good'],
    ['required parcel fields', 'Cropping Schedule'],
    ['crops inside the parcel form', 'same as Add Crop Records'],
    ['the Planted default', 'open on Planted'],
    ['crop status and owner', 'Crop Owner'],
    ['no crop status on an owner parcel', 'every crop on it is the owner'],
    ['importing crops into a parcel', 'Import crops'],
    ['adding a parcel', 'press Add Parcel'],
    ['the farmer\'s machinery', 'Machinery belongs to the farmer'],
    ['no Land Preparation or Planting', 'Land Preparation and Planting are never suggested'],
    ['equipment when registering an organization', 'Equipment section'],
    ['printing the registration tables', 'press Print Report'],
    ['the distribute windows', 'Distribute Farmer Assistance'],
    ['printing after distributing', 'Print Report: it prints the Assistance Distribution Report'],
    ['the distributions table', 'Each row is one distribution'],
    ['PCIC photo', 'ticks Insured'.replace('ticks', 'tick')],
    ['drafts', 'Discard draft'],
  ]) {
    assert.ok(text.includes(needle), `${label} help should explain ${what} (${needle})`); n++
  }
}

console.log(`ok - ${n} assertions`)
