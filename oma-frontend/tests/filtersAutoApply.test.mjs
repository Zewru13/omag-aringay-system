// Filters of the four Crop / Fisheries Management pages (Crop Records, Crop Monitoring, Aquaculture Records, Aquaculture Monitoring):
// a dropdown with nothing picked shows its own name (no "All ..."), one shared PCIC filter, filters apply as they are picked and the only
// button left is Reset Filters. And the crop Log Disaster is a floating window like the fisheries one.
import assert from 'node:assert/strict'
import fs from 'node:fs'

let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}`); n++ }
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll(String.fromCharCode(13), '')

const PAGES = {
  'Crop Records': read('../src/pages/CropInformation/CropInformationPage.jsx'),
  'Crop Monitoring': read('../src/pages/Monitoring/CropMonitoringPage.jsx'),
  'Aquaculture Records': read('../src/pages/FisheriesRecords/AquacultureRecordsPage.jsx'),
  'Aquaculture Monitoring': read('../src/pages/FisheriesRecords/FisheriesRecordsPage.jsx'),
}

// ── one PCIC filter for crops and fisheries
const { PCIC_FILTER_OPTIONS, AQUACULTURE_PCIC_OPTIONS } = await import(new URL('../src/utils/pcic.js', import.meta.url).href)
const PCIC = [['', 'PCIC insurance'], ['insured', 'PCIC Insured'], ['not_insured', 'PCIC Uninsured']]
eq(PCIC_FILTER_OPTIONS.map((o) => [o.value, o.label]), PCIC, 'crop PCIC filter')
eq(AQUACULTURE_PCIC_OPTIONS.map((o) => [o.value, o.label]), PCIC, 'fisheries PCIC filter')

for (const [name, source] of Object.entries(PAGES)) {
  // ── no "All ..." in a dropdown
  ok(!/<option[^>]*>\s*All /.test(source), `${name}: no option starts with "All"`)
  ok(!/\ball="All /.test(source), `${name}: no placeholder starts with "All"`)
  // ── filters apply as they are picked; Reset Filters is the only button
  ok(!source.includes('Apply Filters') && !source.includes('Press Apply'), `${name}: no Apply Filters`)
  ok(/<FilterPanel[\s\S]{0,900}onReset=/.test(source), `${name}: the Filters panel has Reset Filters`)
}

// ── what each dropdown says while nothing is picked: its own name
ok(PAGES['Crop Records'].includes('<option value="">Barangay</option>'), 'Crop Records: Barangay')
ok(PAGES['Crop Monitoring'].includes('<option value="">Crop</option>') && PAGES['Crop Monitoring'].includes('<option value="">Season</option>') && PAGES['Crop Monitoring'].includes('<option value="">Year</option>'), 'Crop Monitoring: Crop, Season, Year')
ok(PAGES['Aquaculture Monitoring'].includes('>Status</option>') && PAGES['Aquaculture Monitoring'].includes('<option value="">Species</option>'), 'Aquaculture Monitoring: Status, Species')
// "All Status" on Crop Monitoring is a real choice (every crop, Total Loss included), so it is renamed, not blanked
ok(PAGES['Crop Monitoring'].includes('<option value="all">Every Status</option>'), 'Crop Monitoring: the status dropdown says Every Status')

// ── Crop Records: "Group by Barangay" is gone (the Barangay filter does that job); Farmer and Land ownership grouping stay
const { GROUP_OPTIONS, groupChildParams } = await import(new URL('../src/pages/CropInformation/parcelRecords.js', import.meta.url).href)
eq(GROUP_OPTIONS.map((o) => o.value), ['none', 'farmer', 'ownership'], 'Crop Records: the grouping choices')
eq(groupChildParams('barangay', { key: 'bAlaska', id: 'Alaska' }), null, 'Crop Records: a barangay group opens onto nothing')
ok(PAGES['Crop Records'].includes('aria-label="Group by"'), 'Crop Records: the Group by dropdown itself stays')

// ── Aquaculture Records: no Fisherfolk or Pond/Cage Location filter (the search bar and the Barangay filter cover them); the columns stay
const aqua = PAGES['Aquaculture Records']
ok(!/label="Fisherfolk"/.test(aqua), 'Aquaculture Records: no Fisherfolk filter')
ok(!/label="Pond\/Cage Location"/.test(aqua), 'Aquaculture Records: no Pond/Cage Location filter')
ok(/label="Barangay"/.test(aqua), 'Aquaculture Records: the Barangay filter stays')
const { RECORD_COLUMNS, EMPTY_FILTERS, recordsParams } = await import(new URL('../src/pages/FisheriesRecords/aquacultureRecords.js', import.meta.url).href)
ok(RECORD_COLUMNS.some((c) => c.label === 'FISHERFOLK') && RECORD_COLUMNS.some((c) => c.label === 'POND/CAGE LOCATION'), 'the table still shows both columns')
ok(!('fisherfolk' in EMPTY_FILTERS) && !('pondLocation' in EMPTY_FILTERS), 'the two filters are gone from the filter state')
eq(Object.keys(recordsParams({ filters: EMPTY_FILTERS, search: '', page: 1 })).sort(), ['page', 'status'], 'an empty filter asks for nothing extra')

// ── the shared panel offers Reset Filters
const panel = read('../src/components/UI/FilterPanel.jsx')
ok(panel.includes('onReset') && panel.includes('Reset Filters'), 'FilterPanel: onReset shows a Reset Filters button')

// ── the crop Log Disaster is a floating window
const screen = read('../src/pages/Monitoring/LogCropDisasterScreen.jsx')
ok(screen.includes("import ModalShell from '../../components/UI/ModalShell.jsx'") && screen.includes('<ModalShell'), 'Log Disaster: a ModalShell window')
ok(!screen.includes('<section aria-label="Log Disaster"') && !screen.includes('Back to Crop Disaster'), 'Log Disaster: no full-page header')
const admin = read('../src/pages/Monitoring/AdminDisasterPage.jsx')
ok(!/return <LogCropDisasterScreen/.test(admin), 'Disaster page: the list is not replaced by the form')
ok(/\{step\?\.name === 'log' && \(?\s*<LogCropDisasterScreen/.test(admin), 'Disaster page: the window opens over the list')
// ...and the report shown after saving is a window too (it would otherwise be a full-page block under the list)
const report = read('../src/pages/Monitoring/CropDisasterEventReport.jsx')
ok(report.includes('<ModalShell') && !report.includes('<section aria-label="Disaster report"'), 'Disaster report: a ModalShell window')
ok(report.includes('<DetailTable'), 'Disaster report: the details are a table')

console.log(`filtersAutoApply: ${n} checks passed`)
