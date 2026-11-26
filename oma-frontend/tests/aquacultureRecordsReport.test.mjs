import assert from 'node:assert/strict'
import fs from 'node:fs'

// Reports > Aquaculture Records (the production cycles of the Aquaculture Records page as a printable report) and the Fisheries Production report
// without its Final? column.
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const {
  AQUACULTURE_RECORDS_PATH, FILTER_OPTIONS_PATH, NO_AQUACULTURE_FILTERS, AQUACULTURE_REPORT_PCIC, activeAquacultureFilterCount, aquacultureOptions,
} = await import(new URL('../src/pages/Reports/aquacultureRecordsReport.js', import.meta.url).href)
const { REPORT_TYPES, reportType, reportTypeFromParam } = await import(new URL('../src/pages/Reports/reportPaper.js', import.meta.url).href)

// ── the report type
eq(REPORT_TYPES.map((r) => r.id), ['registered', 'harvested', 'fisheries', 'aquaculture_records', 'disaster_fisheries', 'disaster_crops', 'organization_assistance'], 'Aquaculture Records sits among the reports, next to the fisheries one')
eq(reportType('aquaculture_records').label, 'Aquaculture Records', 'its name in the Report type box')
ok(reportType('aquaculture_records').description.length > 20, 'with a description')
eq(reportTypeFromParam('aquaculture_records'), 'aquaculture_records', 'a ?tab= link opens it')
eq(reportTypeFromParam('nonsense'), 'registered', 'an unknown link still opens the first report')

// ── what is asked of the backend
eq(AQUACULTURE_RECORDS_PATH, '/reports/aquaculture-records/', 'the report endpoint')
eq(FILTER_OPTIONS_PATH, '/fisheries/stocking/filter-options/', 'the filter dropdowns come from the page\'s own options')
eq(NO_AQUACULTURE_FILTERS, {
  ownership: '', cycle: '', species: '', fisherfolk: '', barangay: '', pond_location: '', culture_type: '', organization: '', pcic: '',
  stocked_from: '', stocked_to: '', search: '',
}, 'every filter the backend takes, empty by default (the names are the backend\'s)')
eq(activeAquacultureFilterCount(NO_AQUACULTURE_FILTERS), 0, 'no badge by default')
eq(activeAquacultureFilterCount({ ...NO_AQUACULTURE_FILTERS, search: 'ana', species: '3', pcic: 'insured' }), 2, 'the Filters badge counts the filters, not the search')
eq(AQUACULTURE_REPORT_PCIC.map((o) => o.value), ['', 'insured', 'not_insured'], 'PCIC: all, insured, not insured')

eq(aquacultureOptions(null), { ownerships: [], cycles: [], species: [], fisherfolk: [], barangays: [], pond_locations: [], culture_types: [], organizations: [] }, 'no options yet')
eq(aquacultureOptions({ cycles: ['A'], species: [{ id: 1, name: 'Tilapia' }], extra: 1 }).cycles, ['A'], 'the options as the backend sends them')
eq(aquacultureOptions({ cycles: ['A'] }).species, [], 'a missing list is empty')

// ── the screens
const tab = read('../src/pages/Reports/AquacultureRecordsReportTab.jsx')
ok(tab.includes('DocumentReport') && tab.includes('reportId="aquaculture_records"'), 'the tab is a document report: preview, signatories, Print Report, Download Report')
ok(tab.includes('AQUACULTURE_RECORDS_PATH') && tab.includes('FILTER_OPTIONS_PATH'), 'it asks the endpoint and the page\'s filter options')
for (const label of ['Fisherfolk', 'Species', 'Barangay', 'Pond/Cage Location', 'Ownership', 'Culture Type', 'PCIC Insured', 'Cooperative', 'Cycle', 'Stocked From', 'Stocked To']) {
  ok(tab.includes(`label="${label}"`) || tab.includes(`>${label}</label>`), `the ${label} filter`)
}
ok(tab.includes('Search fisherfolk'), 'a search bar')
const page = read('../src/pages/Reports/ReportsPage.jsx')
ok(page.includes("activeTab === 'aquaculture_records'") && page.includes('<AquacultureRecordsReportTab />'), 'the Reports page shows it')

// ── the Fisheries Production report has no Final? column
ok(!/FINAL\?|is_final/i.test(page), 'no Final? column and no final value on the Fisheries Production preview')
const fisheries = page.slice(page.indexOf('function FisheriesProductionTab'), page.indexOf('// ── Main Page'))
ok(fisheries.includes("'QUANTITY (KG)'") && fisheries.includes("'HARVEST DATE'"), 'the other columns stay')
eq((fisheries.match(/rec\.\w+/g) || []).filter((v, i, a) => a.indexOf(v) === i), ['rec.barangay', 'rec.fisherfolk', 'rec.organization', 'rec.species', 'rec.culture_type', 'rec.date_stocked', 'rec.harvest_date', 'rec.quantity_kg'], 'eight values per row')

console.log(`ok - ${n} assertions`)
