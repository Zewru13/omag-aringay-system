import assert from 'node:assert/strict'
import fs from 'node:fs'

// Disaster reports for several people: every selected farmer or fisherfolk has their own photo list, sent as photos_<id>.
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const load = (path) => import(new URL(path, import.meta.url).href)

const { photoField, hasUserPhotos, appendUserPhotos, photoCountText, photoProblem } = await load('../src/pages/Monitoring/userPhotos.js')
const { cropDisasterPayload } = await load('../src/pages/Monitoring/multiCropDisaster.js')
const { selectedFarmers, prepareParcels } = await load('../src/pages/Monitoring/disasterTargets.js')
const { selectCrop, markTotal } = await load('../src/pages/Monitoring/disasterEvent.js')
const { multiPayload, affectedSummary } = await load('../src/pages/Monitoring/multiFisherfolkDisaster.js')

const file = (name) => ({ file: new File(['x'], name, { type: 'image/png' }) })

// ── the field name each person's photos travel under
eq(photoField(12), 'photos_12', 'photos_<id>')
eq(hasUserPhotos({}), false, 'nobody')
eq(hasUserPhotos({ 1: [], 2: undefined }), false, 'empty lists')
eq(hasUserPhotos({ 1: [], 2: [file('a.png')] }), true, 'one person has a photo')
eq(photoCountText(0), 'No photos', 'none')
eq(photoCountText(1), '1 photo', 'one')
eq(photoCountText(4), '4 photos', 'several')

eq(photoProblem({ photos_12: ['Photo 1: too big.'], detail: 'x' }), 'Photo 1: too big.', 'a per-person photo error')
eq(photoProblem({ photos_12: ['Photo 1: too big.'] }, (id) => (id === '12' ? 'Ana Cruz' : '')), 'Ana Cruz: Photo 1: too big.', 'whose photos')
eq(photoProblem({ photos: ['Maximum of 10 photos allowed.'] }), 'Maximum of 10 photos allowed.', 'the shared field')
eq(photoProblem({ detail: 'x' }), '', 'no photo problem')
eq(photoProblem(undefined), '', 'no body')

const form = new FormData()
appendUserPhotos(form, { 1: [file('a.png'), file('b.png')], 2: [], 3: [file('c.png')] })
eq([form.getAll('photos_1').map((f) => f.name), form.getAll('photos_2').length, form.getAll('photos_3').map((f) => f.name)], [['a.png', 'b.png'], 0, ['c.png']], 'each person has their own files')
eq(form.has('photos'), false, 'no shared photos field')

// ── the farmers' request
const fields = { disaster_type: 'Flood', date_of_occurrence: '2026-09-01' }
const crops = [{ monitoring_record: 1, area_affected_ha: 1, is_total_loss: false }, { monitoring_record: 4, area_affected_ha: 2, is_total_loss: true }]
eq(cropDisasterPayload({ fields, crops, photosByUser: {} }), { ...fields, crops }, 'no photos: JSON')
eq(cropDisasterPayload({ fields, crops, photosByUser: { 10: [], 11: [] } }), { ...fields, crops }, 'empty lists: JSON')
const fp = cropDisasterPayload({ fields, crops, photosByUser: { 10: [file('ana.png')], 11: [file('ben1.png'), file('ben2.png')] } })
eq(fp instanceof FormData, true, 'photos: a form')
eq(fp.get('disaster_type'), 'Flood', 'the shared fields travel in it')
eq(JSON.parse(fp.get('crops')), crops, 'the crops are one JSON string')
eq([fp.getAll('photos_10').length, fp.getAll('photos_11').length, fp.has('photos')], [1, 2, false], 'per-farmer files, none shared')

// ── the farmers in the form: one row each, in the order of the table
const crop = (id, name = 'Palay (Rice)') => ({ id, crop_type_name: name, season: 'Wet', year: 2026, date_planted: '2026-05-01', area_planted_ha: '2.00', status: 'Planted' })
const parcel = (id, farmer, name, barangay, cs) => ({ key: `p${id}`, parcel_id: id, parcel_number: `P-${id}`, farmer_id: farmer, farmer_name: name, rsbsa_number: `RS-${farmer}`, barangay, area_hectares: '5.00', crops: cs })
const parcels = prepareParcels([
  parcel(1, 10, 'Ana Cruz', 'Basca', [crop(1), crop(2, 'Corn (Mais)')]),
  parcel(2, 10, 'Ana Cruz', 'Alaska', [crop(3)]),
  parcel(3, 11, 'Ben Dizon', 'Basca', [crop(4, 'Mango')]),
])
let sel = {}
eq(selectedFarmers(sel, parcels), [], 'nothing ticked, no rows')
sel = selectCrop(selectCrop(sel, parcels[0].crops[0], true), parcels[1].crops[0], true)
sel = markTotal(sel, [parcels[1].crops[0]], true)
sel = selectCrop(sel, parcels[2].crops[0], true)
eq(selectedFarmers(sel, parcels), [
  { id: 10, name: 'Ana Cruz', rsbsa: 'RS-10', barangay: 'Basca', parcels: 2, crops: 2, total: 1, parcelTitles: ['Parcel P-1', 'Parcel P-2'] },
  { id: 11, name: 'Ben Dizon', rsbsa: 'RS-11', barangay: 'Basca', parcels: 1, crops: 1, total: 0, parcelTitles: ['Parcel P-3'] },
], 'a row per farmer with their parcels and crops')
sel = selectCrop(sel, parcels[2].crops[0], false)
eq(selectedFarmers(sel, parcels).map((f) => f.id), [10], "un-ticking a farmer's last crop drops their row")

// ── the fisherfolk's request
const ff = { disaster_type: 'Typhoon', date_of_occurrence: '2026-11-01' }
const groups = [{ fisherfolk: 1, stock_losses: [] }, { fisherfolk: 2, stock_losses: [] }]
eq(multiPayload({ fields: ff, groups, photosByUser: {} }), { ...ff, fisherfolk_groups: groups }, 'no photos: JSON')
const mp = multiPayload({ fields: ff, groups, photosByUser: { 1: [file('a.png')], 2: [] } })
eq(mp instanceof FormData, true, 'photos: a form')
eq(JSON.parse(mp.get('fisherfolk_groups')), groups, 'the groups travel as one JSON string')
eq([mp.getAll('photos_1').length, mp.getAll('photos_2').length, mp.has('photos')], [1, 0, false], 'per-fisherfolk files, none shared')

// what the row of a fisherfolk says about what was hit
eq(affectedSummary({ mode: 'unlinked', stocks: 0, units: 0, lost: 0 }), 'Not linked to a stock', 'not linked')
eq(affectedSummary({ mode: 'stocks', stocks: 0, units: 0, lost: 0 }), 'No stock chosen yet', 'nothing chosen')
eq(affectedSummary({ mode: 'stocks', stocks: 1, units: 2, lost: 140 }), '1 stock · 2 ponds/cages · 140 fingerlings lost', 'one stock')
eq(affectedSummary({ mode: 'stocks', stocks: 2, units: 3, lost: 0 }), '2 stocks · 3 ponds/cages', 'several, nothing counted yet')
eq(affectedSummary({ mode: 'stocks', stocks: 1, units: 1, lost: 1 }), '1 stock · 1 pond/cage · 1 fingerling lost', 'singular')

// ── the screens: a table with a row per person, each owning its photo list (so removing the person drops it)
const farmerScreen = read('../src/pages/Monitoring/LogCropDisasterScreen.jsx')
eq(farmerScreen.includes('UserPhotoRow') && farmerScreen.includes('selectedFarmers('), true, 'the farmer table is on the screen')
eq(farmerScreen.includes('cropDisasterPayload('), true, 'the request carries per-farmer photos')
eq(/<PhotoListField[^>]*photosState=\{photosState\}/.test(farmerScreen), false, 'no shared photo field left on the farmer screen')
eq(farmerScreen.includes('usePhotoList()'), false, 'the screen no longer holds one shared photo list')
const row = read('../src/pages/Monitoring/UserPhotoRow.jsx')
eq(row.includes('usePhotoList(') && row.includes('forwardRef') && row.includes('PhotoListField'), true, 'a row owns its own list and field')
const modal = read('../src/pages/Monitoring/MultiFisherfolkDisasterModal.jsx')
eq(modal.includes('useDamagePhotos'), false, 'the fisheries modal no longer holds a shared photo list')
eq(modal.includes('photosByUser'), true, 'the fisheries modal sends per-fisherfolk photos')
const panel = read('../src/pages/Monitoring/FisherfolkDisasterPanel.jsx')
eq(panel.includes('useDamagePhotos') && panel.includes('DamagePhotosField') && panel.includes('<tbody'), true, 'a fisherfolk row owns its photos and is a table body')

console.log(`ok - ${n} assertions`)
