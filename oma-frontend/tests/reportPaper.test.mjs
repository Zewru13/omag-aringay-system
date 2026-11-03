import assert from 'node:assert/strict'

const { REPORT_TYPES, reportType, reportTypeFromParam, periodText, detailFromFilters, filtersLine, paperDocument, selectedReport, signatureSlots, rowRefsOf, individualFrom, individualParams } =
  await import(new URL('../src/pages/Reports/reportPaper.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// ── the six reports, in the order the Report type dropdown lists them
eq(REPORT_TYPES.map((r) => r.id), ['registered', 'harvested', 'fisheries', 'disaster_fisheries', 'disaster_crops', 'organization_assistance'], 'the six reports')
assert.ok(REPORT_TYPES.every((r) => r.label && r.description)); n++

eq(reportType('fisheries').label, 'Fisheries Production Harvested', 'a report by id')
eq(reportType('nope'), undefined, 'no such report')

// ?tab= picks the report; a missing or unknown value opens the first one
eq(reportTypeFromParam('harvested'), 'harvested', 'a known tab')
eq(reportTypeFromParam('organization_assistance'), 'organization_assistance', 'the link the OBO notifications use')
eq(reportTypeFromParam('nope'), 'registered', 'an unknown tab opens the first report')
eq(reportTypeFromParam(null), 'registered', 'no tab opens the first report')

// ── the period line (the same wording as the printed report)
eq(periodText('2026-10-01', '2026-11-01'), 'As of October 1 to November 1, 2026', 'two dates, one year')
eq(periodText('2026-12-15', '2027-01-15'), 'As of December 15, 2026 to January 15, 2027', 'two years')
eq(periodText('2026-10-01', '2026-10-01'), 'As of October 1, 2026', 'one day')
eq(periodText('2026-10-01', ''), 'From October 1, 2026 onward', 'only a start')
eq(periodText('', '2026-11-01'), 'Up to November 1, 2026', 'only an end')
eq(periodText('', ''), '', 'no dates, no period')
eq(periodText('not a date', null), '', 'an unreadable date is no date')

// ── the filters line of the old two reports
eq(detailFromFilters([['Barangay', 'Alaska'], ['Crop', ''], ['Organization', null], ['Yield', 'Below Average']]), 'Barangay: Alaska · Yield: Below Average', 'only the set filters')
eq(detailFromFilters([['Barangay', ''], ['Crop', ' ']]), '', 'no filters')

// ── a backend document as the paper shows it
eq(filtersLine({ detail: 'Registered Farmers · All records', title: 'x', heading: 'y' }), 'Registered Farmers · All records', 'detail wins')
eq(filtersLine({ detail: '', title: 'x' }), '', 'an empty detail stays empty')
eq(filtersLine({ title: 'Fisheries Disaster Reports', heading: 'Fisheries Disaster Report', subtitle: 'Active only' }), 'Fisheries Disaster Reports · Active only', 'title and subtitle')
eq(filtersLine({ title: 'Same', heading: 'Same', subtitle: '' }), '', 'a title that only repeats the heading is left out')
eq(paperDocument({ title: 'T', heading: 'Heading', period: 'As of x', detail: 'd', stats: [['Total', 4]], sections: [{ headers: ['A'], rows: [[1]] }] }),
  { heading: 'Heading', period: 'As of x', detail: 'd', stats: [['Total', 4]], sections: [{ headers: ['A'], rows: [[1]] }] }, 'a full document')
eq(paperDocument({ title: 'T', row_refs: [{ id: 1, label: 'A' }] }).row_refs, [{ id: 1, label: 'A' }], 'a list keeps its row refs')
eq(paperDocument({ title: 'Only Title' }), { heading: 'Only Title', period: '', detail: '', stats: [], sections: [] }, 'defaults')

// ── the Selected report box
eq(selectedReport(REPORT_TYPES[1], { period: 'As of October 1 to November 1, 2026', detail: 'Barangay: Alaska' }),
  { name: 'Crop Records Harvested', description: REPORT_TYPES[1].description, rows: [['Period', 'As of October 1 to November 1, 2026'], ['Filters', 'Barangay: Alaska']] }, 'the box with a period and a filter')
eq(selectedReport(REPORT_TYPES[0], {}).rows, [['Period', 'All dates'], ['Filters', 'None']], 'nothing applied')

// ── the signature lines, the same rules as the printed report
const RECORDS = 'Records Officer, Office of the Municipal Agriculturist'
const CERTIFIED = { label: 'Certified by', name: 'MUNICIPAL AGRICULTURIST', role: 'Municipality of Aringay, La Union' }
eq(signatureSlots({}), [{ label: 'Prepared by', name: '', role: RECORDS }, CERTIFIED], 'nobody picked: a blank preparer and the certified-by column')
eq(signatureSlots({ prepared_by: 'Dee Lim' }), [{ label: 'Prepared by', name: 'DEE LIM', role: RECORDS }, CERTIFIED], 'only a preparer')
eq(signatureSlots({ prepared_by: 'Dee Lim', prepared_role: 'Clerk', reviewed_by: 'Cy Diaz', reviewed_role: 'Section Head', noted_by: 'Ana Cruz', approved_by: 'Ben Reyes', approved_role: 'Mayor' }), [
  { label: 'Prepared by', name: 'DEE LIM', role: 'Clerk' },
  { label: 'Checked by', name: 'CY DIAZ', role: 'Section Head' },
  { label: 'Noted by', name: 'ANA CRUZ', role: 'Municipal Agriculturist' },
  { label: 'Approved by', name: 'BEN REYES', role: 'Mayor' },
], 'all four, in order, a noted signer with no position keeps the old default, no certified-by column')
eq(signatureSlots({ prepared_by: 'Dee Lim', approved_by: 'Ben Reyes' }).map((s) => s.label), ['Prepared by', 'Approved by'], 'approved alone drops the certified-by column')
eq(signatureSlots({ prepared_by: 'Dee Lim', reviewed_by: 'Cy Diaz' }).map((s) => s.label), ['Prepared by', 'Checked by', 'Certified by'], 'checked alone keeps the certified-by column')
eq(signatureSlots({ noted_by: 'R&D <Chief>' })[1].name, 'R&D <CHIEF>', 'names are kept as typed, only upper-cased')

// ── the individual report: a clicked row, or a search that left one record
const refs = [{ id: 1, label: 'Ana Cruz' }, { id: 2, label: 'Ben Reyes' }]
eq(rowRefsOf({ row_refs: refs, sections: [] }), refs, 'a list document names its rows')
eq(rowRefsOf({ sections: [] }), [], 'an individual document has no row refs')
eq(rowRefsOf(null), [], 'no document yet')

eq(individualFrom({ individual: { id: 1, label: 'Ana Cruz' } }, null), { label: 'Ana Cruz', picked: false }, 'the search left one record')
eq(individualFrom({}, { id: 2, label: 'Ben Reyes' }), { label: 'Ben Reyes', picked: true }, 'a clicked row')
eq(individualFrom({ individual: { id: 1, label: 'Ana Cruz' } }, { id: 2, label: 'Ben Reyes' }), { label: 'Ben Reyes', picked: true }, 'the click wins')
eq(individualFrom({}, null), null, 'the list')
eq(individualFrom(null, null), null, 'no document yet, nothing picked')

// the query of a report that can show one record: no row clicked -> let the search decide; a row clicked -> that record
eq(individualParams({ kind: 'farmers', search: 'Cruz' }, null), { kind: 'farmers', search: 'Cruz', individual: 'auto' }, 'no row clicked')
eq(individualParams({ kind: 'farmers', search: 'Cruz' }, { id: 2, label: 'Ben' }), { kind: 'farmers', search: 'Cruz', id: 2 }, 'a row clicked')

console.log(`reportPaper: ${n} checks passed`)
