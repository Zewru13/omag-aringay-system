import assert from 'node:assert/strict'

const { SECTIONS, helpFor } = await import(new URL('../src/pages/Help/helpContent.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const questions = (help) => help.sections.flatMap((s) => s.items.map((i) => i.q))
const everything = (help) => JSON.stringify(help)

const admin = helpFor('ADMIN')
const focal = helpFor('EVALUATOR')

// ── who sees what
assert.ok(questions(admin).includes('Where do I add a crop or change its growth duration?')); n++
assert.ok(!questions(focal).includes('Where do I add a crop or change its growth duration?')); n++
assert.ok(questions(admin).includes('How do I add a seed source?') && !questions(focal).includes('How do I add a seed source?')); n++
assert.ok(questions(admin).includes('How do I give someone an account?') && !questions(focal).includes('How do I give someone an account?')); n++
assert.ok(admin.sections.every((s) => s.items.length > 0) && focal.sections.every((s) => s.items.length > 0)); n++
eq(new Set(questions(admin)).size, questions(admin).length, 'no question is asked twice')
assert.ok(SECTIONS.length > 0); n++

// ── the changes this page has to explain, for both accounts
for (const [label, help] of [['Admin', admin], ['Focal Person', focal]]) {
  const text = everything(help)
  for (const [what, needle] of [
    ['distributing to several cooperatives', 'Distribute to Cooperatives gives one assistance to the members of the cooperatives you tick'],
    ['ending a term with a reason', 'Transferred Registration'],
    ['the Others reason', 'choose Others'],
    ['lending to several members', 'Lend equipment'],
    ['the returned loans', 'Returned holds every loan that is closed'],
    ['equipment without a condition', 'new equipment starts as Good'],
    ['required parcel fields', 'Cropping Schedule'],
    ['crops inside the parcel form', 'same as Add Crop Records'],
    ['the Planted default', 'open on Planted'],
    ['crop status and owner', 'Crop Owner'],
    ['no crop status column', 'its status is the Land Ownership of the farm parcel'],
    ['importing crops into a parcel', 'Import crops'],
    ['the farmer\'s machinery', 'Machinery belongs to the farmer'],
    ['no Land Preparation or Planting', 'Land Preparation and Planting are never suggested'],
    ['equipment when registering a cooperative', 'Equipment section'],
    ['saving a farmer and going on to parcels', 'Save Farmer & Add Farm Parcels'],
    ['the three steps of Add Farm Parcels', 'Review and Save'],
    ['another parcel', 'Add another parcel'],
    ['nothing to confirm', 'Nobody has to confirm anything'],
    ['when and where to claim', 'date, time and place'],
    ['removing who did not claim', 'Remove (not claimed)'],
    ['where suggestions are set', 'set per crop in Crop Settings'],
    ['printing the registration tables', 'press Print Report'],
    ['the distribute windows', 'Distribute Farmer Assistance'],
    ['printing after distributing', 'Print Report: it prints the Assistance Distribution Report'],
    ['the distributions table', 'Each row is one distribution'],
    ['PCIC photo', 'press the round Insured button'],
    ['drafts', 'Discard draft'],
    ['the report signers', 'Signatories block'],
    ['the Report type box', 'Report type box'],
    ['the two report buttons', 'Print Report and Download Report'],
  ]) {
    assert.ok(text.includes(needle), `${label} help should explain ${what} (${needle})`); n++
  }
}

// ── what was removed or renamed is not explained any more
for (const [label, help] of [['Admin', admin], ['Focal Person', focal]]) {
  const text = everything(help)
  for (const gone of ['awaiting confirmation', 'reported as not received', 'marked resolved', 'Borrowed tab', 'Borrowed History', 'Distribute to Organizations', 'press Add Parcel', 'Save Farmer and Add Farm Parcels', 'Organization-Owned']) {
    assert.ok(!text.includes(gone), `${label} help should not mention "${gone}"`); n++
  }
  assert.ok(!/\borganizations?\b/i.test(text), `${label} help should say cooperative, not organization`); n++
}

// ── the individual report of one record
for (const [label, help] of [['Admin', admin], ['Focal Person', focal]]) {
  assert.ok(questions(help).includes('How do I get the report of just one farmer, fisherfolk or cooperative?'), `${label} help should say how to get an individual report`); n++
  assert.ok(!everything(help).includes('Preview PDF') && !everything(help).includes('Download Excel') && !everything(help).includes('All records (bulk)'), `${label} help should not mention the removed report buttons`); n++
}

// ── report signers: everyone is told how to pick them, only the Admin is told where the list is kept
assert.ok(questions(admin).includes('How do I choose who signs a report?') && questions(focal).includes('How do I choose who signs a report?')); n++
assert.ok(questions(admin).includes('Where do I keep the names that sign the reports?')); n++
assert.ok(!questions(focal).includes('Where do I keep the names that sign the reports?')); n++

console.log(`ok - ${n} assertions`)
