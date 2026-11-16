import assert from 'node:assert/strict'

// The User Manual of the farmer, fisherfolk and organization accounts describes the pages they have now.
const manual = await import(new URL('../src/pages/Manual/manualContent.js', import.meta.url).href)
const { SCREENS } = await import(new URL('../scripts/manual/screens.mjs', import.meta.url).href)
const { searchManual } = await import(new URL('../src/pages/Manual/manualSearch.js', import.meta.url).href)
let n = 0
const ok = (v, label) => { assert.ok(v, label); n++ }

const ids = new Set(SCREENS.map((s) => s.id))
const GONE = ['My Organization', 'Crop Monitoring', 'Fisheries Monitoring', 'Aquaculture Monitoring', 'Borrowed History', 'Borrowed tab', 'Confirmed for Members', 'Distribute to Individual', 'Distribute to All Members', 'My Logged Disasters', 'Open crop']
const NEEDS = {
  farmer: ['More', 'Crops', 'Record harvest', 'Report a disaster', 'Received'],
  fisherfolk: ['More', 'Cycles', 'Log activity', 'Start a cycle', 'Details'],
  org: ['More', 'Members', 'Loans', 'Distribute assistance', 'Confirm for members', 'Officers'],
}
for (const audience of ['farmer', 'fisherfolk', 'org']) {
  const guides = manual.manualFor(audience)
  const raw = guides.flatMap((g) => g.screens.map((s) => s.id))
  ok(guides.length >= 5, `${audience}: its guides`)
  for (const g of guides) for (const s of g.screens) ok(ids.has(s.id), `${audience}/${g.id}: the picture ${s.id} is one the screenshot tool takes`)
  ok(raw.every((id) => SCREENS.find((s) => s.id === id)?.audience !== undefined), `${audience}: every picture is known`)
  const text = guides.flatMap((g) => [g.title, g.intro, ...g.steps]).join(' ')
  for (const word of GONE) ok(!text.includes(word), `${audience}: no step names "${word}", which is gone`)
  for (const word of NEEDS[audience]) ok(text.includes(word), `${audience}: the guides name ${word}`)
}
ok(manual.missingScreens().length === 0, `every picture a guide names exists: ${manual.missingScreens().join(', ')}`)

// the manual's search finds the new words
const orgHits = searchManual(manual.manualFor('org'), 'Loans').map((h) => h.label || h.title || '')
ok(orgHits.length > 0, 'an organization finds Loans in the manual')
ok(searchManual(manual.manualFor('fisherfolk'), 'Cycles').length > 0, 'a fisherfolk finds Cycles')
ok(searchManual(manual.manualFor('farmer'), 'Report a disaster').length > 0, 'a farmer finds Report a disaster')
console.log(`ok - ${n} assertions`)
