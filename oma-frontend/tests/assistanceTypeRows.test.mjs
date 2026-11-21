import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const { assistanceTypeRows, detailsText, addAssistanceProblem, addAssistanceBody, DOMAIN_CHOICES, TYPE_LISTS } = await import(new URL('../src/pages/AssistanceManagement/assistanceTypeRows.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }

// The rows of Assistance Settings > Assistance Types: the types with a unit box (from the units endpoint), a Training row for each domain, and the
// types added with Add Assistance (marked, so they can be renamed and deleted). A type that has a list of items (Seeds: the types of seed) says
// which list and how many names it holds, so the row can open it. `lists` counts the names of every list: { crop: { seed: 12, ... }, fisheries: ... }.
const units = {
  crop: [
    { domain: 'crop', assistance_type: 'Seeds', units: ['kg', 'sack'], is_default: true },
    { domain: 'crop', assistance_type: 'Fertilizer', units: ['kg'], is_default: true },
    { domain: 'crop', assistance_type: 'Pesticide', units: ['box'], is_default: false },
  ],
  fisheries: [{ domain: 'fisheries', assistance_type: 'Feed', units: ['kg'], is_default: true }, { domain: 'fisheries', assistance_type: 'Fishing Gear', units: ['piece'], is_default: true }],
}
const custom = [{ id: 7, domain: 'crop', name: 'Pesticide' }]
const lists = { crop: { seed: 12, fertilizer: 1, equipment: 16, training: 12 }, fisheries: { feed: 4, gear: 0, fingerling: 9, equipment: 18, training: 10 } }
const rows = assistanceTypeRows({ units, custom, lists })

eq(rows.map((r) => [r.domain, r.assistance_type, r.kind]),
  [['crop', 'Seeds', 'builtin'], ['crop', 'Fertilizer', 'builtin'], ['crop', 'Training', 'training'], ['crop', 'Pesticide', 'custom'],
    ['fisheries', 'Feed', 'builtin'], ['fisheries', 'Fishing Gear', 'builtin'], ['fisheries', 'Training', 'training']],
  'crop first, then fisheries; Training after the built-in types, the added ones last')
eq(rows.find((r) => r.kind === 'custom').customId, 7, 'an added type knows its id')
eq(rows.find((r) => r.kind === 'custom').list, null, 'an added type has no list of items')
eq(rows.find((r) => r.assistance_type === 'Seeds').list, { kind: 'seed', title: 'Types of Seed', singular: 'Type of Seed', noun: 'seed', example: 'Hybrid Rice Seed', count: 12 }, 'Seeds has the Types of Seed list')
eq(rows.find((r) => r.domain === 'fisheries' && r.assistance_type === 'Fishing Gear').list.kind, 'gear', 'Fishing Gear has the gear list')
eq(rows.find((r) => r.domain === 'fisheries' && r.kind === 'training').list.count, 10, 'Training counts its types of training')
eq(new Set(rows.map((r) => r.id)).size, rows.length, 'every row has its own id')
eq(assistanceTypeRows({ units: { crop: [], fisheries: [] }, custom: [], lists: {} }).map((r) => r.assistance_type), ['Training', 'Training'], 'nothing loaded: just Training')

// every built-in type that offers an item dropdown has its list
eq(Object.entries(TYPE_LISTS).map(([domain, types]) => [domain, Object.entries(types).map(([type, l]) => `${type}:${l.kind}`)]),
  [['crop', ['Seeds:seed', 'Fertilizer:fertilizer', 'Equipment:equipment', 'Training:training']],
    ['fisheries', ['Fishing Gear:gear', 'Fingerlings/Seeds:fingerling', 'Feed:feed', 'Equipment:equipment', 'Training:training']]], 'the type -> list map')

// what the Details column says
eq(detailsText(rows[0]), 'kg, sack · 12 types of seed', 'units and the list')
eq(detailsText(rows[1]), 'kg · 1 type of fertilizer', 'one name')
eq(detailsText(rows[3]), 'box', 'an added type: its units only')
eq(detailsText(rows[5]), 'piece · no types of fishing gear yet', 'an empty list')
eq(detailsText(rows[2]), '12 types of training', 'training')
eq(detailsText({ kind: 'training', list: { noun: 'training', count: 1 } }), '1 type of training', 'one type of training')
eq(detailsText({ kind: 'training', list: { noun: 'training', count: 0 } }), 'No types of training yet', 'none yet')

// the Add Assistance form
eq(DOMAIN_CHOICES.map((c) => c.value), ['crop', 'fisheries', 'both'], 'crop, fisheries or both')
eq(addAssistanceProblem({ name: '  ', domain: 'crop', units: ['kg'] }), 'Enter the name of the assistance.', 'a name')
eq(addAssistanceProblem({ name: 'x'.repeat(31), domain: 'crop', units: ['kg'] }), 'The name can be at most 30 characters.', 'a name that fits a record')
eq(addAssistanceProblem({ name: 'Pesticide', domain: '', units: ['kg'] }), 'Choose what it applies to.', 'applies to')
eq(addAssistanceProblem({ name: 'Pesticide', domain: 'both', units: [] }), 'Choose at least one unit.', 'a unit')
eq(addAssistanceProblem({ name: 'Pesticide', domain: 'both', units: ['kg'] }), '', 'a complete form')
eq(addAssistanceBody({ name: '  Soil   Test Kit ', domain: 'both', units: ['box', 'kg'] }), { name: 'Soil Test Kit', domains: ['crop', 'fisheries'], units: ['box', 'kg'] }, 'both domains')
eq(addAssistanceBody({ name: 'Net Kit', domain: 'fisheries', units: ['piece'] }).domains, ['fisheries'], 'one domain')

// the screen
const card = readFileSync(new URL('../src/pages/AssistanceManagement/AssistanceTypeUnitsCard.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
ok(/Add Assistance/.test(card), 'the card has an Add Assistance button')
ok(/\/interventions\/assistance-types\//.test(card), 'it reads and writes the added types')
ok(/AssistanceOptionsTab/.test(card) && /kind=\{list\.kind\}/.test(card), 'a row with a list opens that list (Types of Training, Types of Seed, ...)')
const page = readFileSync(new URL('../src/pages/AssistanceManagement/AssistanceAgenciesPage.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
ok(!/title="Types of Training/.test(page), 'the two separate Types of Training cards are gone (they live in the Training row)')

console.log(`assistanceTypeRows: ${n} checks passed`)
