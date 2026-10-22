import assert from 'node:assert/strict'

const { buildAssistanceReportSpec, beneficiaryName } = await import(new URL('../src/pages/AssistanceManagement/assistanceReport.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const crop = [
  { id: 9, farmer_full_name: 'Ben Dizon', farmer_barangay: 'Poblacion', assistance_type: 'Seeds', quantity: '10 bags', source_agencies: ['Department of Agriculture (DA)', 'LGU - Aringay'], date_given: '2026-10-22' },
  { id: 7, farmer_full_name: 'Ana Cruz', farmer_barangay: 'Alaska', assistance_type: 'Cash Assistance', quantity: '1500', source_agencies: ['LGU - Aringay'], date_given: '2026-10-20' },
]

eq(beneficiaryName({ farmer_full_name: 'A B' }), 'A B', 'farmer name'); eq(beneficiaryName({ fisherfolk_full_name: 'C D' }), 'C D', 'fisherfolk name'); eq(beneficiaryName({}), '—', 'no name')

const spec = buildAssistanceReportSpec({ domain: 'crop', records: crop, confirmedOn: '2026-10-23T08:00:00', organizationName: 'Alaska Farmers' })
eq(spec.title, 'ASSISTANCE DISTRIBUTION REPORT', 'title')
eq(spec.reference, 'AD-20261023-000007', 'reference uses the confirmation day and the lowest record id')
eq(spec.header.map(([k]) => k), ['Reference No.', 'Date Confirmed', 'Sector', 'Organization'], 'header')
eq(spec.header.find(([k]) => k === 'Sector')[1], 'Crop (Farmers)', 'sector')
eq(spec.signatures, ['Prepared by', 'Noted by'], 'signatures'); eq(spec.footerLabel, 'assistance record', 'footer')

const summary = spec.sections.find((s) => s.title === 'Summary')
eq(summary.rows, [['Beneficiaries', '2'], ['Assistance', 'Cash Assistance, Seeds'], ['Source agencies', 'Department of Agriculture (DA), LGU - Aringay'], ['Date given', 'Oct 20, 2026 to Oct 22, 2026']], 'summary')

const table = spec.sections.find((s) => s.table).table
eq(table.head, ['No.', 'Beneficiary', 'Barangay', 'Assistance', 'Quantity / Amount', 'Source Agency', 'Date Given'], 'table head')
eq(table.rows, [
  ['1', 'Ana Cruz', 'Alaska', 'Cash Assistance', '₱1,500.00', 'LGU - Aringay', 'Oct 20, 2026'],
  ['2', 'Ben Dizon', 'Poblacion', 'Seeds', '10 bags', 'Department of Agriculture (DA), LGU - Aringay', 'Oct 22, 2026'],
], 'rows are sorted by name, cash is shown in pesos')

eq(buildAssistanceReportSpec({ domain: 'fisheries', records: [{ id: 3, fisherfolk_full_name: 'Pablo Reyes', fisherfolk_barangay: 'Basca', assistance_type: 'Feed', quantity: '50', source_agencies: [], date_given: '2026-10-22' }], confirmedOn: '2026-10-22' })
  .header.map(([k, v]) => `${k}=${v}`), ['Reference No.=AD-20261022-000003', 'Date Confirmed=Oct 22, 2026', 'Sector=Fisheries (Fisherfolk)'], 'fisheries report with no organization')
eq(buildAssistanceReportSpec({ domain: 'crop', records: [crop[0]], confirmedOn: '2026-10-22' }).sections.find((s) => s.title === 'Summary').rows.at(-1), ['Date given', 'Oct 22, 2026'], 'a single date')
eq(buildAssistanceReportSpec({ domain: 'crop', records: [{ ...crop[0], source_agencies: [] }], confirmedOn: '2026-10-22' }).sections.find((s) => s.table).table.rows[0][5], '—', 'no agency')

const withNote = buildAssistanceReportSpec({ domain: 'crop', records: crop, confirmedOn: '2026-10-22', note: '  Photos kept by the office.  ' })
eq(withNote.sections.find((s) => s.title === 'Notes'), { title: 'Notes', paragraphs: ['Photos kept by the office.'], empty: '' }, 'note')
eq(buildAssistanceReportSpec({ domain: 'crop', records: crop, confirmedOn: '2026-10-22' }).sections.some((s) => s.title === 'Notes'), false, 'no note, no section')

console.log(`assistanceReport: ${n} checks passed`)
