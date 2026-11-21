import assert from 'node:assert/strict'

const { filterFaqSections } = await import(new URL('../src/pages/Help/helpSearch.js', import.meta.url).href)
const { helpFor } = await import(new URL('../src/pages/Help/helpContent.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const sections = [
  { title: 'Crops', items: [{ q: 'How do I record a harvest?', a: 'Open Crop Monitoring and choose Record Harvest.' }, { q: 'What is a forced harvest?', a: 'An early harvest before a typhoon.' }] },
  { title: 'Assistance', items: [{ q: 'Why was a member blocked?', a: 'Another organization gave the same type within 30 days.' }] },
]

eq(filterFaqSections(sections, ''), sections, 'no search shows everything')
eq(filterFaqSections(sections, '   '), sections, 'only spaces shows everything')
eq(filterFaqSections(sections, 'harvest').map((s) => [s.title, s.items.map((i) => i.q)]),
  [['Crops', ['How do I record a harvest?', 'What is a forced harvest?']]], 'a word in the questions; empty sections disappear')
eq(filterFaqSections(sections, 'typhoon').map((s) => s.items.map((i) => i.q)), [['What is a forced harvest?']], 'a word that is only in an answer')
eq(filterFaqSections(sections, 'harvest record').map((s) => s.items.map((i) => i.q)), [['How do I record a harvest?']], 'every word must match, in any order')
eq(filterFaqSections(sections, 'ORGANIZATION, blocked').map((s) => s.title), ['Assistance'], 'capitals and commas do not matter, the answer text counts')
eq(filterFaqSections(sections, 'zebra'), [], 'nothing found')

// the real content: both accounts can find a known question
for (const role of ['ADMIN', 'EVALUATOR']) {
  const { sections: real } = helpFor(role)
  const found = filterFaqSections(real, 'forced harvest')
  assert.ok(found.length > 0 && found.every((s) => s.items.length > 0), `${role}: finds the forced harvest question`)
  n++
}

console.log(`helpFaqSearch: ${n} checks passed`)
