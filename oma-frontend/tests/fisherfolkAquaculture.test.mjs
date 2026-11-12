import assert from 'node:assert/strict'
import fs from 'node:fs'

// Fisherfolk Registration: every fisherfolk is Aquaculture, the Activities column is gone; and the top-level Print Report / Download Report
// buttons are gone from the nine management pages, while the central Reports page keeps its reports.
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const exists = (path) => fs.existsSync(new URL(path, import.meta.url))

const { displayFisherfolkType } = await import(new URL('../src/utils/fisherfolkType.js', import.meta.url).href)

// ── the Type shown
eq(displayFisherfolkType('Unspecified'), 'Aquaculture', 'Not Yet Classified shows as Aquaculture')
eq(displayFisherfolkType(''), 'Aquaculture', 'blank')
eq(displayFisherfolkType(null), 'Aquaculture', 'null')
eq(displayFisherfolkType(undefined), 'Aquaculture', 'missing')
eq(displayFisherfolkType('Aquaculture'), 'Aquaculture', 'Aquaculture')
eq(['Capture', 'Inland', 'Mariculture'].map(displayFisherfolkType), ['Capture', 'Inland', 'Mariculture'], 'a real type is shown as it is')

// ── the Fisherfolk Registration table
const page = read('../src/pages/Fisherfolk/FisherfolkPage.jsx')
const columns = page.slice(page.indexOf('const columns = ['), page.indexOf(']\n', page.indexOf('const columns = [')))
const keys = [...columns.matchAll(/key: '([a-z_]+)'/g)].map((m) => m[1])
eq(keys, ['fishr_number', 'rsbsa_number', 'full_name', 'fisherfolk_type', 'barangay', 'age', 'date_registered_disp'], 'every column but Activities, in the same order')
eq(/Activities|activity_badges|ACTIVITY_BADGES/.test(page), false, 'no Activities column, header or values')
eq(page.includes('displayFisherfolkType(f.fisherfolk_type)'), true, 'the Type cell shows Aquaculture for a blank or Unspecified record')
eq(/Not Yet Classified|value="Unspecified"/.test(page), false, 'no Not Yet Classified filter')
eq(page.includes('setShowImport(true)') && page.includes('Register') || page.includes('setShowAdd(true)'), true, 'Import and Register stay')
eq(read('../src/pages/Users/userTabs.js').includes('Not Yet Classified'), false, 'no Not Yet Classified user filter either')

// ── the registration form asks for no type
// (Register and Edit draw one shared form: its fields are in FisherfolkFormSections.jsx, its values and rules in fisherfolkForm.js)
const form = read('../src/pages/Fisherfolk/FisherfolkFormSections.jsx') + read('../src/pages/Fisherfolk/fisherfolkForm.js')
eq(/id="fisherfolk_type"/.test(form), false, 'no Fisherfolk Type box')
eq(form.includes("fisherfolk_type: 'Aquaculture'"), true, 'the form still saves Aquaculture')
eq(form.includes('fisherfolk-type-note'), true, 'and says so')

// ── no top-level Print Report / Download Report on the nine pages
const nine = {
  'Farmer Registration': '../src/pages/Farmers/FarmersPage.jsx',
  'Fisherfolk Registration': '../src/pages/Fisherfolk/FisherfolkPage.jsx',
  'Farmers Organizations': '../src/pages/Organizations/OrganizationsPage.jsx',
  'Fisherfolk Organizations': '../src/pages/Fisherfolk/FisherfolkOrganizationsPage.jsx',
  'Crop Records': '../src/pages/CropInformation/CropInformationPage.jsx',
  'Crop Monitoring': '../src/pages/Monitoring/CropMonitoringPage.jsx',
  'Aquaculture Monitoring': '../src/pages/FisheriesRecords/FisheriesRecordsPage.jsx',
  'Farmer and Fisheries Disaster Reports': '../src/pages/Monitoring/AdminDisasterPage.jsx',
}
for (const [name, path] of Object.entries(nine)) {
  eq(/PrintReportButton|ListPrintButton|DisasterReportButtons/.test(read(path)), false, `${name}: no top-level Print Report / Download Report button`)
}
eq(exists('../src/components/PrintReportButton.jsx') || exists('../src/pages/Monitoring/DisasterReportButtons.jsx'), false, 'the two button components are gone')

// ── what stays: Import / Add actions on those pages, Capture Monitoring's own button, the per-record reports, the Reports page
eq(read('../src/pages/Farmers/FarmersPage.jsx').includes('setIsImportModalOpen(true)'), true, 'Farmer Registration keeps Import')
eq(read('../src/pages/CropInformation/CropInformationPage.jsx').includes('Import Farm Parcels') && read('../src/pages/CropInformation/CropInformationPage.jsx').includes('Add Farm Parcel'), true, 'Crop Records keeps Import and Add')
eq(read('../src/pages/Monitoring/AdminDisasterPage.jsx').includes('Log Disaster'), true, 'the disaster pages keep Log Disaster')
eq(read('../src/pages/Monitoring/FisheriesMonitoringPage.jsx').includes('ListPrintButton'), true, 'Capture Monitoring (not on the list) keeps its button')
eq(read('../src/pages/Monitoring/DisasterPersonReportModal.jsx').includes('Download Report'), true, 'the per-person disaster report keeps its buttons')
eq(read('../src/pages/Monitoring/AdminDisasterPage.jsx').includes("label: 'Print Report'"), true, 'a disaster row keeps its own Print Report / Download Report menu items')
const reports = read('../src/pages/Reports/ReportParts.jsx')
eq(reports.includes('Print Report') && reports.includes('Download Report'), true, 'the central Reports page keeps Print Report and Download Report')

console.log(`ok - ${n} assertions`)
