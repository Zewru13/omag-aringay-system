// Dates on screen read "Nov 1, 2026": not 8/1/2026, not the raw 2026-11-01, and not the month in full (the printed papers keep the long form).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replaceAll(String.fromCharCode(13), '')
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}`); n++ }

// the day with its weekday, for a welcome line
const { formatDateWithWeekday } = await import(new URL('../src/utils/dateFormat.js', import.meta.url).href)
eq([formatDateWithWeekday('2026-11-12'), formatDateWithWeekday(null)], ['Thursday, Nov 12, 2026', '—'], 'date with weekday')

// the Aquaculture tables
const { fmtShort } = await import(new URL('../src/pages/FisheriesRecords/stockingHelpers.js', import.meta.url).href)
eq([fmtShort('2026-08-01'), fmtShort('2026-12-31'), fmtShort(null)], ['Aug 1, 2026', 'Dec 31, 2026', '—'], 'stocking helpers short date')
const { recordRow } = await import(new URL('../src/pages/FisheriesRecords/aquacultureRecords.js', import.meta.url).href)
eq(recordRow({ id: 1, species_name: 'Tilapia', date_stocked: '2026-10-05' }).dateStocked, 'Oct 5, 2026', 'Aquaculture Records date stocked')

// Crop Monitoring's table shows the dates the same way
const crop = read('src/pages/Monitoring/CropMonitoringPage.jsx')
ok(!/<span>\{rec\.date_planted\}<\/span>/.test(crop) && !crop.includes("(rec.date_planted || '—')") && !crop.includes("expected_harvest_cell: rec.expected_harvest_date || '—'"), 'crop monitoring: no raw ISO dates in the table')
ok(crop.includes("utils/dateFormat.js"), 'crop monitoring: uses the shared date format')

// the month is not written in full on a screen
for (const file of ['src/components/Layout/Navbar.jsx', 'src/pages/Dashboard/StaffDashboard.jsx', 'src/pages/Citizen/FarmerPhoneHome.jsx', 'src/pages/Citizen/FisherfolkPhoneHome.jsx',
  'src/pages/Citizen/OrgPhoneHome.jsx', 'src/pages/Farmers/FarmerDetailPage.jsx', 'src/pages/Fisheries/FisherfolkDetailPage.jsx', 'src/pages/Citizen/OrgAccountPages.jsx',
  'src/pages/Organizations/OrganizationDetailPage.jsx', 'src/pages/AssistanceManagement/DistributeAssistanceModal.jsx']) {
  ok(!/month:\s*['"]long['"]/.test(read(file)), `${file}: month not written in full`)
}

ok(!/getMonth\(\) \+ 1\}\//.test(read('src/pages/CropInformation/CropInformationPage.jsx')), 'crop information: no 8/1/2026 dates')

console.log(`lookDates: ${n} checks passed`)
