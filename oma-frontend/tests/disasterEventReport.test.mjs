import assert from 'node:assert/strict'

const { EVENT_HEAD, fmtHa, eventTable, eventDetails, eventParagraphs, eventPrintSpec, eventSummary } = await import(new URL('../src/pages/Monitoring/disasterEventReport.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const doc = {
  reference: 'CDE-2026-00014', disaster_type_label: 'Typhoon', date_of_occurrence: '2026-10-24', date_reported: '2026-10-26T01:30:00Z', reported_by_name: 'Ada Admin',
  description: 'Winds flattened the crops', production_loss: 'About half',
  totals: { crops: 3, parcels: 2, farmers: 2, area_planted_ha: '4.50', area_affected_ha: 4, total_loss: 2 },
  rows: [
    { report_id: 1, farmer_name: 'Ana Cruz', barangay: 'Basca', parcel: 'Parcel 01-33-02-005-001-02-003', crop: 'Palay (Rice)', variety: 'Rc 222', area_planted_ha: '2.0000', area_affected_ha: '2.0000', is_total_loss: true },
    { report_id: 2, farmer_name: 'Ana Cruz', barangay: 'Basca', parcel: 'Parcel 01-33-02-005-001-02-003', crop: 'Corn (Mais)', variety: '', area_planted_ha: '1.0000', area_affected_ha: '0.5000', is_total_loss: false },
    { report_id: 3, farmer_name: '', barangay: '', parcel: 'No parcel on file', crop: 'Mango', variety: '', area_planted_ha: null, area_affected_ha: '1.5000', is_total_loss: true },
  ],
  photos: ['https://x/a.png'],
}

eq([fmtHa('2.0000'), fmtHa(0.5), fmtHa(null), fmtHa(''), fmtHa('1234.5')], ['2', '0.5', '—', '—', '1,234.5'], 'hectares')
const t = eventTable(doc)
eq(t.head, EVENT_HEAD, 'columns')
eq(t.rows[0], ['Ana Cruz', 'Basca', 'Parcel 01-33-02-005-001-02-003', 'Palay (Rice) (Rc 222)', '2', '2', 'Yes'], 'a crop row, with its variety')
eq(t.rows[1].slice(3), ['Corn (Mais)', '1', '0.5', 'No'], 'a crop not lost')
eq(t.rows[2], ['—', '—', 'No parcel on file', 'Mango', '—', '1.5', 'Yes'], 'a crop with no parcel, farmer or area')
eq(t.rows[3], ['TOTAL', '', '2 parcels', '3 crops', '4.5', '4', '2'], 'total row')
eq([...t.boldRows], [3], 'the total row is bold')
eq(eventTable({ rows: [], totals: {} }).rows, [['TOTAL', '', '0 parcels', '0 crops', '—', '—', '0']], 'nothing reported')

eq(eventDetails(doc), [['Date of Occurrence', 'October 24, 2026'], ['Disaster Type', 'Typhoon'], ['Farmers Affected', '2'], ['Parcels Affected', '2'], ['Crops Affected', '3'],
  ['Total Area Affected', '4 ha'], ['Crops Lost (Total Loss)', '2']], 'details')
eq(eventDetails({ ...doc, totals: { ...doc.totals, total_loss: 0 } }).some(([k]) => k === 'Crops Lost (Total Loss)'), false, 'no total loss row when none')
eq(eventParagraphs(doc), ['Winds flattened the crops', 'Estimated production loss: About half'], 'damage paragraphs')
eq(eventParagraphs({ description: '', production_loss: '' }), [], 'no description')
eq(eventSummary(doc), '3 crops on 2 parcels of 2 farmers', 'summary')
eq(eventSummary({ totals: { crops: 1, parcels: 1, farmers: 1 } }), '1 crop on 1 parcel of 1 farmer', 'summary: one')

const spec = eventPrintSpec(doc)
eq([spec.title, spec.reference, spec.photos, spec.footerLabel], ['CROP DISASTER REPORT', 'CDE-2026-00014', ['https://x/a.png'], 'disaster report'], 'print spec')
eq(spec.sections.map((s) => s.title), ['Disaster Details', 'Description of Damage', 'Affected Parcels and Crops'], 'print sections')
eq(spec.header.map(([k]) => k), ['Reference No.', 'Date/Time Logged', 'Logged By'], 'print header')
eq(spec.sections[2].table.rows.length, 4, 'the print table lists every crop and the total')

console.log(`disasterEventReport: ${n} checks passed`)
