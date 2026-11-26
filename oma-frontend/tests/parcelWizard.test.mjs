// Add Farm Parcels is a window with three steps (Parcel Details, Add Crops, Review and Save) that opens over Crop Records or a
// farmer's profile. These check its rules, with no screen and no network.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const at = (p) => new URL(p, import.meta.url)
const read = (p) => fs.readFileSync(at(p), 'utf8').replace(/\r\n/g, '\n')
const {
  makeParcelRow, validateRows, validateDetails, detailProblem,
} = await import(at('../src/pages/Farmers/parcelRows.js').href)
const {
  WIZARD_STEPS, firstProblem, serverErrorStep, reviewRows, parcelHeading,
  readAddParcels, openAddParcelsParams, closeAddParcelsParams, addParcelsAddress,
} = await import(at('../src/pages/CropInformation/parcelWizard.js').href)
const { makeCropRecord } = await import(at('../src/pages/Monitoring/cropRecordForm.js').href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const ok = (id = 1, over = {}) => ({
  ...makeParcelRow(id), area_hectares: '1.5', barangay: 'Alaska', parcel_number: `01-33-02-005-001-02-${100 + id}`, land_ownership: 'Owner',
  farm_type: 'Irrigated', cropping_schedule: 'Single Cropping', ...over,
})
const record = (id = 1, over = {}) => ({ ...makeCropRecord(id), land_status: 'Owner', crop_type: '7', date_planted: '2026-10-20', area_planted_ha: '1', variety_used: 'Rc 222', ...over })
const CROP_TYPES = [{ id: 7, name: 'Rice', planting_type: 'Seed' }]

// ── the three steps
eq(WIZARD_STEPS.map((s) => s.label), ['Parcel Details', 'Add Crops', 'Review and Save'], 'the three steps, in order')
eq(WIZARD_STEPS.map((s) => s.key), ['parcels', 'crops', 'review'], 'their keys')

// ── step 1 checks the parcel only: an unfinished crop does not stop it
const halfCrop = ok(1, { crop_records: [record(1, { crop_type: '' })] })
eq(detailProblem(halfCrop), '', 'a parcel with an unfinished crop passes Parcel Details')
eq(validateDetails([halfCrop]), {}, 'so step 1 lets it through')
eq(Object.keys(validateRows([halfCrop])), ['1'], 'step 2 (the full check) still stops it')
eq(detailProblem(ok(1, { barangay: '' })), 'choose the barangay', 'a missing barangay')
eq(detailProblem(ok(1, { parcel_number: '' })), 'enter the parcel number', 'a missing parcel number')
eq(detailProblem(ok(1, { land_ownership: 'Tenant' })), 'enter the land owner name for a tenant or lessee parcel', 'a tenant needs the owner')

// ── a number used twice in the form, or one the farmer already has
const twice = [ok(1), ok(2, { parcel_number: ok(1).parcel_number })]
eq(Object.keys(validateDetails(twice)), ['2'], 'the repeat is marked')
const onFile = { taken: [ok(1).parcel_number], farmerName: 'Ana Cruz' }
eq(validateDetails([ok(1)], onFile)[1], `Parcel 1: Ana Cruz already has parcel ${ok(1).parcel_number}.`, 'a number already on file')
eq(validateRows([ok(1)], onFile)[1], `Parcel 1: Ana Cruz already has parcel ${ok(1).parcel_number}.`, 'the full check says it too')
eq(validateRows([ok(1)]), {}, 'a good row with nothing on file')

// ── before saving: which step has the first thing to fix
eq(firstProblem([ok(1)]), null, 'nothing to fix')
eq(firstProblem([ok(1, { barangay: '' })]).step, 'parcels', 'a parcel problem sends them to Parcel Details')
eq(firstProblem([halfCrop]).step, 'crops', 'a crop problem sends them to Add Crops')
eq(firstProblem([ok(1)], onFile).step, 'parcels', 'a repeated number is a Parcel Details problem')

// ── where the server's refusal is shown
eq(serverErrorStep([{}, { parcel_number: ['already used'] }]), 'parcels', 'a parcel field')
eq(serverErrorStep([{ crop_records: [{ variety_used: ['already planted'] }] }]), 'crops', 'only crops')
eq(serverErrorStep([{ crop_records: [{}] }, { area_hectares: ['too small'] }]), 'parcels', 'a parcel field wins')

// ── headings and the review table
eq(parcelHeading(ok(1), 0), `Parcel 1 · ${ok(1).parcel_number} · Alaska · 1.5 ha`, 'a full heading')
eq(parcelHeading(makeParcelRow(1), 2), 'Parcel 3', 'a blank parcel is just its number')
const [first, second] = reviewRows([
  ok(1, { classifications: ['Organic'], crop_records: [record(1)] }),
  ok(2, { land_ownership: 'Tenant', land_owner_name: 'Ben Reyes' }),
], CROP_TYPES)
eq(first.crops, ['Rice — 1 ha, planted 2026-10-20'], 'each crop with its area and date')
eq([first.ownership, first.classifications, first.area], ['Owner', 'Organic', '1.5'], 'the parcel values')
eq([second.ownership, second.crops, second.classifications], ['Tenant (owner: Ben Reyes)', [], '—'], 'a tenant parcel with no crops')

// ── the window is opened by the address, so links and Register Farmer can open it
const params = (q) => new URLSearchParams(q)
eq(readAddParcels(params('')), { isOpen: false, farmerId: '' }, 'closed by default')
eq(readAddParcels(params('addParcels=1')), { isOpen: true, farmerId: '' }, 'open, farmer to be chosen')
eq(readAddParcels(params('addParcels=1&farmer=12')), { isOpen: true, farmerId: '12' }, 'open for one farmer')
eq(readAddParcels(params('addParcels=1&farmer=abc')), { isOpen: true, farmerId: '' }, 'a farmer that is not a number is ignored')
eq(openAddParcelsParams(params('tab=a')).toString(), 'tab=a&addParcels=1', 'opening keeps the rest of the address')
eq(closeAddParcelsParams(params('tab=a&addParcels=1&farmer=12')).toString(), 'tab=a', 'closing removes only the window')
eq(addParcelsAddress({ profileId: 5 }), '/farmers/5?addParcels=1', 'from a farmer profile')
eq(addParcelsAddress({ farmerId: 5 }), '/crop-records?addParcels=1&farmer=5', 'from Crop Records, for one farmer')
eq(addParcelsAddress({}), '/crop-records?addParcels=1', 'from Crop Records')

// ── wiring: the page became a window, and every way in opens it
eq(fs.existsSync(at('../src/pages/CropInformation/AddFarmParcelsPage.jsx')), false, 'the separate page is gone')
const win = read('../src/pages/CropInformation/AddFarmParcelsWindow.jsx')
eq([/<ModalShell/.test(win), /<StepIndicator/.test(win), /useDraftState\(`add-farm-parcels:/.test(win)], [true, true, true], 'a floating window with steps and a draft')
eq(/\/parcels\/bulk\//.test(win), true, 'it saves all the parcels together')
for (const file of ['../src/pages/CropInformation/CropInformationPage.jsx', '../src/pages/Farmers/FarmerDetailPage.jsx']) {
  eq(/<AddFarmParcelsWindow/.test(read(file)), true, `${file} shows the window`)
}
// "Discard draft" starts over on step 1 and brings back the farmer the window was opened for
eq(/const startOver = \(\) => \{[^}]*draft\.discard\(\)[^}]*setFarmerTick\([^}]*setStep\('parcels'\)/s.test(win), true, 'discarding starts over and reloads the farmer')
eq(/\[startFarmerId, farmerTick, showToast, setFarmerInfo\]/.test(win), true, 'the farmer is loaded again after a discard')
eq(/<DraftBanner draft=\{\{ \.\.\.draft, discard: startOver \}\} \/>/.test(win), true, 'the banner uses it')

const app = read('../src/App.jsx')
eq(/AddFarmParcelsPage/.test(app), false, 'no route renders the old page')
eq([/path="\/farmers\/:id\/add-parcels"/.test(app), /path="\/crop-records\/add-parcels"/.test(app), /<OldAddParcelsAddress \/>/.test(app)], [true, true, true], 'the old addresses still lead to the window')
eq(/addParcelsAddress\(\{ profileId: created\.id \}\)/.test(read('../src/pages/Farmers/AddFarmerModal.jsx')), true, 'Register Farmer goes on to the window')
eq(/addParcelsAddress\(\{ farmerId: farmerInfo\.farmer_id \}\)/.test(read('../src/pages/Monitoring/AddCropMonitoringPage.jsx')), true, 'so does the link in Add Crop')

console.log(`parcelWizard: ${n} checks passed`)
