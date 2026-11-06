import assert from 'node:assert/strict'
import fs from 'node:fs'

const { cyclePcicPayload, pcicError } = await import(new URL('../src/utils/pcic.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const file = { type: 'image/png', size: 1000, name: 'pcic.png' }

// ── PCIC is recorded once per production cycle: one box, sent with the cycle (the document travels separately)
eq(cyclePcicPayload({ insured: true, files: [file], photos: [], removed: [] }), { pcic_insured: true }, 'insured')
eq(cyclePcicPayload({ insured: false, files: [], photos: [], removed: [] }), { pcic_insured: false }, 'not insured')
eq(cyclePcicPayload(undefined), { pcic_insured: false }, 'nothing chosen')
// the same document rules as everywhere: an insured cycle needs a photo of the form
eq(pcicError({ insured: true, files: [], photos: [], removed: [] }), 'Upload a photo of the PCIC insurance form.', 'insured without a document')
eq(pcicError({ insured: true, files: [file], photos: [], removed: [] }), '', 'insured with a document')

// ── the Start Production Cycle form
const form = fs.readFileSync(new URL('../src/pages/Monitoring/StartProductionCycleModal.jsx', import.meta.url), 'utf8')
eq(form.includes("pcic_insured") || form.includes('cyclePcicPayload'), true, 'the cycle checkbox is sent with the cycle')
eq(form.includes("uploadPcicForm(api, 'stocking'"), true, 'the document goes to the cycle\'s stocking record')
eq(/uploadPcicForm\(api, 'unit'/.test(form), false, 'no document is uploaded for an individual pond/cage')
eq(/setUnitField\(i, 'pcic'/.test(form), false, 'a pond/cage row has no PCIC box of its own')
eq((form.match(/<PcicInsuranceField/g) || []).length, 1, 'one PCIC control in the whole form')
const sections = ['Fisherfolk Information', 'Culture Details', 'Stocking Information', 'Ownership', 'Pond/Cage Details']
const at = sections.map((title) => form.indexOf(`title="${title}"`))
eq(at.every((i) => i >= 0), true, 'every section is there')
eq([...at].sort((a, b) => a - b), at, 'in the order Fisherfolk, Culture, Stocking, Ownership, Pond/Cage')
// Number of ponds and the PCIC control sit together in the Pond/Cage Details section, and the control is not inside a pond row
const pondSection = form.slice(at[4])
eq(pondSection.indexOf('Number of') >= 0 && pondSection.indexOf('<PcicInsuranceField') > pondSection.indexOf('Number of'), true, 'PCIC control beside Number of Ponds')
eq(form.slice(0, at[4]).includes('<PcicInsuranceField'), false, 'and not in an earlier section')
eq(pondSection.indexOf('<PcicInsuranceField') < pondSection.indexOf('data-testid="unit-table"'), true, 'before the pond rows')

// ── the read-only PCIC INSURED column lives in Aquaculture Records now (Aquaculture Monitoring's main table no longer has it)
const records = fs.readFileSync(new URL('../src/pages/FisheriesRecords/AquacultureRecordsPage.jsx', import.meta.url), 'utf8')
const recordColumns = fs.readFileSync(new URL('../src/pages/FisheriesRecords/aquacultureRecords.js', import.meta.url), 'utf8')
eq(/key: 'pcic_cell',\s*label: 'PCIC INSURED'/.test(recordColumns), true, 'its heading, in Aquaculture Records')
eq(/pcic_cell: <PcicCell insured=\{row\.insured\}/.test(records), true, 'the cycle\'s own flag, in the Crop Monitoring checkbox design (PcicCell)')

console.log(`ok - ${n} assertions`)
