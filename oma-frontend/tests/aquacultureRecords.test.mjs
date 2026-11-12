import assert from 'node:assert/strict'
import fs from 'node:fs'

// Aquaculture Records: the table's columns and rows, the filters (draft vs applied, the request they make) and where the page lives.
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

const {
  EMPTY_FILTERS, RECORDS_STATUS, RECORD_COLUMNS, PAGE_SIZE, activeFilterCount, filtersChanged, recordRow, recordsParams, countLabel, applyProblem,
} = await import(new URL('../src/pages/FisheriesRecords/aquacultureRecords.js', import.meta.url).href)

// ── the columns, in the order asked for
eq(RECORD_COLUMNS.map((c) => c.label), ['OWNERSHIP', 'CYCLE', 'SPECIES', 'FISHERFOLK', 'BARANGAY', 'POND/CAGE LOCATION', 'CULTURE TYPE', 'ORGANIZATION', 'DATE STOCKED', 'PCIC INSURED'], 'the ten columns in order')
eq(new Set(RECORD_COLUMNS.map((c) => c.key)).size, 10, 'each column has its own key')

// ── a row is made of the existing production-cycle record, nothing invented
const rec = {
  id: 7, ownership: 'Tenant', production_cycle_name: 'Grow-out Phase', owner_name: 'Juan Dela Cruz', production_cycle_no: 2, species_name: 'Bangus', fisherfolk_name: 'Pedro Cruz',
  fisherfolk_barangay: 'Samara', pond_location_barangay: 'Basca', culture_type: 'Pond', organization_name: 'Samara Fishers', date_stocked: '2026-10-05', has_pcic_insurance: true,
}
eq(recordRow(rec), {
  ownership: 'Tenant', ownerLine: 'Owner: Juan Dela Cruz', cycle: 'Grow-out Phase', cycleNo: '#2', species: 'Bangus', fisherfolk: 'Pedro Cruz', barangay: 'Samara', pondLocation: 'Basca', cultureType: 'Pond',
  organization: 'Samara Fishers', dateStocked: 'Oct 5, 2026', insured: true,
}, 'a full row')
const bare = recordRow({ id: 8, ownership: '', species_name: 'Tilapia', date_stocked: '2026-01-02' })
eq([bare.ownership, bare.cycle, bare.cycleNo, bare.fisherfolk, bare.barangay, bare.pondLocation, bare.cultureType, bare.organization, bare.insured],
  ['Not specified', '—', '', '—', '—', '—', '—', '—', false], 'a cycle with little saved shows dashes, "Not specified" ownership and no PCIC')
eq(recordRow({ ...rec, has_pcic_insurance: false }).insured, false, 'unchecked when not insured')
eq([recordRow({ ...rec, ownership: 'Owner' }).ownerLine, recordRow({ ...rec, owner_name: '' }).ownerLine, bare.ownerLine], ['', '', ''], 'the owner line only for a Tenant with a saved owner')
eq(recordRow({ ...rec, production_cycle_name: null }).cycle, '#2', 'the cycle number stands in for a missing name')

// ── filters
eq(Object.keys(EMPTY_FILTERS).sort(), ['barangay', 'cultureType', 'cycle', 'fisherfolk', 'organization', 'ownership', 'pcic', 'pondLocation', 'species', 'stockedFrom', 'stockedTo'], 'every filter has an empty default')
eq(Object.values(EMPTY_FILTERS).every((v) => v === ''), true, 'all of them default to All / empty')
eq(activeFilterCount(EMPTY_FILTERS), 0, 'none active by default')
eq(activeFilterCount({ ...EMPTY_FILTERS, species: '3', pcic: 'insured', stockedFrom: '2026-01-01' }), 3, 'counts what is chosen')

eq(PAGE_SIZE, 10, 'ten rows a page, like Crop Records')
eq(RECORDS_STATUS, 'Stocked,Near Harvest,Harvested,Total Loss', 'every status, so a record is never hidden')
eq(recordsParams({ filters: EMPTY_FILTERS, search: '', page: 1 }), { page: 1, status: RECORDS_STATUS }, 'nothing chosen: only the page and the status scope')
eq(recordsParams({
  filters: { ownership: 'Tenant', cycle: 'Alpha', species: '3', fisherfolk: '9', barangay: 'Samara', pondLocation: 'Basca', cultureType: 'Pond', organization: '4', stockedFrom: '2026-01-01', stockedTo: '2026-06-30', pcic: 'insured' },
  search: ' Pedro ', page: 2,
}), {
  page: 2, status: RECORDS_STATUS, search: 'Pedro', ownership: 'Tenant', cycle: 'Alpha', species: '3', fisherfolk: '9', fisherfolk_barangay: 'Samara', pond_location: 'Basca',
  culture_type: 'Pond', organization: '4', stocked_from: '2026-01-01', stocked_to: '2026-06-30', pcic: 'insured',
}, 'every chosen filter and the search go in one request')
eq(recordsParams({ filters: { ...EMPTY_FILTERS, stockedFrom: '2026-06-30', stockedTo: '2026-01-01' }, search: '', page: 1 }), { page: 1, status: RECORDS_STATUS }, 'a reversed date range is not sent')

// Apply / Reset: what is picked is a draft until Apply
eq(filtersChanged(EMPTY_FILTERS, EMPTY_FILTERS), false, 'nothing to apply')
eq(filtersChanged({ ...EMPTY_FILTERS, pcic: 'insured' }, EMPTY_FILTERS), true, 'a pick waits for Apply')
eq(applyProblem({ ...EMPTY_FILTERS, stockedFrom: '2026-06-30', stockedTo: '2026-01-01' }), '"To" cannot be before "From".', 'a reversed range cannot be applied')
eq(applyProblem({ ...EMPTY_FILTERS, stockedFrom: '2026-01-01' }), '', 'a good filter can')

eq([countLabel(0), countLabel(1), countLabel(12)], ['No production cycles', '1 production cycle', '12 production cycles'], 'the record count')

// ── where it lives
const sidebar = read('../src/components/Layout/Sidebar.jsx')
const iRecords = sidebar.indexOf('label: "Aquaculture Records"')
const iMonitoring = sidebar.indexOf('label: "Aquaculture Monitoring"')
eq(iRecords > 0 && iRecords < iMonitoring, true, 'Aquaculture Records sits in Fisheries Management right before Aquaculture Monitoring')
eq(sidebar.includes('to: "/aquaculture-records"'), true, 'its own address')
const app = read('../src/App.jsx')
eq(/path="\/aquaculture-records"[\s\S]{0,200}allowedRoles=\{\["ADMIN", "EVALUATOR"\]\}/.test(app), true, 'Admin and Focal Person only')

const page = read('../src/pages/FisheriesRecords/AquacultureRecordsPage.jsx')
eq(page.includes("import StartProductionCycleModal from '../Monitoring/StartProductionCycleModal.jsx'"), true, 'the existing Start Production Cycle form, not a copy')
eq(page.includes('Start Production Cycle'), true, 'the button')
eq(page.includes("'/fisheries/stocking/filter-options/'") && page.includes("'/fisheries/stocking/'"), true, 'existing records and their option lists from the server')
eq(page.includes('FilterPanel') && page.includes('PaginationBar') && page.includes('DataTable') && page.includes('Apply Filters') && page.includes('Reset Filters'), true, 'search + Filters panel, table, pagination, Apply and Reset')
eq(page.includes('DateRangeFields'), true, 'the Date Stocked range')
eq(page.includes('AQUACULTURE_PCIC_OPTIONS'), true, 'the PCIC Insured filter reuses its options')
eq(page.includes('PcicCell'), true, 'the PCIC check is the same one the other tables show')

// Aquaculture Monitoring no longer offers Start Production Cycle to staff (a fisherfolk account, which has no Records page, keeps it)
const monitoring = read('../src/pages/FisheriesRecords/FisheriesRecordsPage.jsx')
eq(/\{isFisherfolk && \(\s*<div className="flex justify-end gap-2">[\s\S]{0,800}Start Production Cycle/.test(monitoring), true, 'only a fisherfolk account still sees the button in Monitoring')
eq(monitoring.includes('Start a production cycle in Aquaculture Records'), true, 'the empty state points staff to the new page')

// the Ownership column shows the Tenant's owner in both tables, from one shared cell
const cellSrc = read('../src/components/UI/OwnershipCell.jsx')
eq(cellSrc.includes('ownerLine(') && cellSrc.includes('text-[11.5px] text-[#7A8E7A]'), true, 'the owner is smaller, secondary text under the ownership')
eq(page.includes('<OwnershipCell') && monitoring.includes('<OwnershipCell'), true, 'both tables use it')

// Aquaculture Monitoring's main table drops Organization and PCIC Insured; Aquaculture Records keeps them
const monText = monitoring.replace(/\r\n/g, '\n')
const monCols = monText.slice(monText.indexOf('const COLUMNS = ['), monText.indexOf(']\n', monText.indexOf('const COLUMNS = [')))
const monKeys = [...monCols.matchAll(/key: '([a-z_]+)'/g)].map((m) => m[1])
eq(monKeys, ['ownership_cell', 'species_name_cell', 'fisherfolk_cell', 'culture_type', 'cycle_cell', 'date_stocked_fmt', 'expected_harvest_fmt', 'pond_location', 'status_cell', 'actions_cell'], 'Monitoring columns without Organization and PCIC INSURED')
eq(monCols.includes('ORGANIZATION') || monCols.includes('PCIC INSURED'), false, 'their headers are gone')
eq(/assoc_name:|pcic_cell:/.test(monitoring), false, 'and their row values')
eq(RECORD_COLUMNS.some((c) => c.label === 'ORGANIZATION') && RECORD_COLUMNS.some((c) => c.label === 'PCIC INSURED'), true, 'Aquaculture Records still has both')
// the PCIC information stays where it is still needed: the units' PCIC in the expanded rows and the cycle details
// the expanded pond/cage section (table and phone cards) no longer has a PCIC Insured column; its other columns are unchanged
const panel = read('../src/pages/FisheriesRecords/ProductionUnitsPanel.jsx').replace(/\r\n/g, '\n')
eq(/PCIC/i.test(panel.replace(/\/\/.*$/gm, '')), false, 'the units panel has no PCIC column, cell or import')
eq(monitoring.split('\n').filter((l) => l.includes('<ProductionUnits')).every((l) => !/\spcic(\s|$)/.test(l)), true, 'Aquaculture Monitoring no longer asks the units panel for one')
const fieldLabels = [...panel.slice(panel.indexOf('function unitFields'), panel.indexOf('function PanelHeader')).matchAll(/label: (?:forecast \? '([^']+)' : '([^']+)'|'([^']+)')/g)].map((m) => m[3] || `${m[1]}|${m[2]}`)
eq(fieldLabels, ['Production Unit', 'Species', 'Fingerlings Count|Fingerlings', 'Dimensions', 'Area (m²)', 'Est. Harvest (kg)', 'Actual Harvest (kg)', 'Est. Harvest Date', 'Actual Harvest Date|Date Harvested', 'Status'], 'the remaining unit columns, in order')
// PCIC is not deleted anywhere else it is needed: Cycle details / View Details and the stored data
eq(monitoring.includes('PcicBadge') && monitoring.includes('CycleInfoSummary'), true, 'View Details still shows the cycle PCIC and its form')
eq(monitoring.includes('CycleInfoSummary'), true, 'View Details is untouched')
eq(monitoring.includes('aria-label="PCIC insured"'), true, 'the PCIC Insured filter stays')
eq(/<th key=\{col\.key\} className="whitespace-nowrap px-3 /.test(monitoring) && /<td key=\{col\.key\} className="whitespace-nowrap px-3 /.test(monitoring), true, 'the remaining columns are tighter so the table fits without scrolling')
eq(cellSrc.includes('max-w-[10rem]') && cellSrc.includes('whitespace-normal'), true, 'a long owner name wraps instead of widening the column')

console.log(`ok - ${n} assertions`)
