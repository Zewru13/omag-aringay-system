import assert from 'node:assert/strict'

const b = await import(new URL('../src/pages/Monitoring/bulkCropLog.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const crop = (id, extra = {}) => ({ id, crop_type_name: 'Rice', variety_used: '', status: 'Planted', farm_location_barangay: 'Alaska', date_planted: '2026-09-01', area_planted_ha: '1.00', ...extra })

// which crops can take a log: the ones still growing
const all = [crop(1), crop(2, { status: 'Near Harvest' }), crop(3, { status: 'Harvested' }), crop(4, { status: 'Total Loss' })]
eq(b.growingCrops(all).map((c) => c.id), [1, 2], 'only a growing crop is offered')
eq(b.cropLabel(crop(1)), 'Rice', 'a crop with no variety')
eq(b.cropLabel(crop(1, { variety_used: 'NSIC Rc222' })), 'Rice (NSIC Rc222)', 'a crop with a variety')

// the search: every word, any order, on the crop, variety, place or planting date
const list = [crop(1), crop(2, { crop_type_name: 'Corn', farm_location_barangay: 'Poblacion' }), crop(3, { variety_used: 'Sweet', crop_type_name: 'Corn' })]
eq(b.filterCrops(list, '', ).length, 3, 'an empty search keeps every crop')
eq(b.filterCrops(list, 'corn sweet').map((c) => c.id), [3], 'words in any order')
eq(b.filterCrops(list, 'poblacion').map((c) => c.id), [2], 'the place')
eq(b.filterCrops(list, 'zzz'), [], 'nothing matches')

// which extra boxes the activity needs
eq([b.showsFertilizer('Fertilizer Application'), b.showsFertilizer('Weeding')], [true, false], 'fertilizer boxes')
eq([b.showsPest('Pest Control'), b.showsPest('Disease Control'), b.showsPest('Weeding')], [true, true, false], 'pest boxes')

// the activities offered: not the work done before a crop is added, and not Disaster Remedy (it belongs to one crop's disaster)
eq(b.offeredActivities(['Land Preparation', 'Planting', 'Weeding', 'Disaster Remedy', 'Other', 'Pest Control']), ['Weeding', 'Pest Control'], 'the activities a farmer can log on many crops')
// Pre-Harvest Inspection and Harvesting open from half way through the season (as on a single crop), so only when EVERY ticked crop is there
const steps = ['Weeding', 'Pre-Harvest Inspection', 'Harvesting']
eq(b.offeredActivities(steps, true), steps, 'half way on every crop: the harvest steps are offered')
eq(b.offeredActivities(steps, false), ['Weeding'], 'a young crop is ticked: they are held back')
const young = crop(1, { date_planted: '2026-11-10', expected_harvest_date: '2027-02-10' })      // 14 days of ~92
const old = crop(2, { date_planted: '2026-08-01', expected_harvest_date: '2026-12-01' })        // 115 days of 122
eq(b.allHalfway([old], '2026-11-24'), true, 'an old crop is past half way')
eq(b.allHalfway([old, young], '2026-11-24'), false, 'one young crop holds them back')
eq(b.allHalfway([], '2026-11-24'), true, 'nothing ticked: nothing is held back')
eq(b.allHalfway([crop(3, { expected_harvest_date: null })], '2026-11-24'), true, 'a crop with no expected date is not held back (as on its own window)')

// what is wrong with the form ('' when nothing)
const form = (extra = {}) => ({ activity: 'Weeding', activityOther: '', date: '2026-11-20', plantCondition: '', notes: '', fertilizer: '', fertilizerOther: '', quantity: '', unit: 'kg', pestName: '', severity: '', ...extra })
const today = '2026-11-24'
eq(b.formProblem(form(), [1, 2], today), '', 'a complete form')
eq(b.formProblem(form({ activity: '' }), [1], today), 'Choose the activity.', 'no activity')
eq(b.formProblem(form({ activity: 'Other' }), [1], today), 'Describe the activity.', 'Other needs a description')
eq(b.formProblem(form({ date: '' }), [1], today), 'Enter the date of the activity.', 'no date')
eq(b.formProblem(form({ date: '2026-11-25' }), [1], today), 'The date of the activity cannot be in the future.', 'a future date')
eq(b.formProblem(form(), [], today), 'Tick at least one crop.', 'no crop')
eq(b.MAX_CROPS, 100, 'a hundred crops at a time')
eq(b.formProblem(form(), Array.from({ length: 101 }, (_, i) => i), today), 'Tick at most 100 crops at a time.', 'too many crops')
eq(b.formProblem(form(), Array.from({ length: 100 }, (_, i) => i), today), '', 'a hundred is allowed')
eq(b.formProblem(form({ activity: 'Fertilizer Application', fertilizer: 'Other' }), [1], today), 'Type the fertilizer.', 'Other fertilizer needs its name')
eq(b.formProblem(form({ activity: 'Pest Control' }), [1], today), 'Choose the severity of the pest or disease.', 'pest control needs the severity')
eq(b.formProblem(form({ activity: 'Pest Control', severity: 'Low' }), [1], today), '', 'pest control with a severity')
eq(b.formProblem(form({ activity: 'Harvesting' }), [1], today, false), 'Harvesting can be logged only on crops that are past half of their growing season. Untick the younger crops.', 'a harvest step on a young crop')
eq(b.formProblem(form({ activity: 'Harvesting' }), [1], today, true), '', 'a harvest step when every crop is past half way')

// what is sent
eq(b.buildPayload(form(), [3, 1]), { record_ids: [3, 1], activity_type: 'Weeding', date_of_activity: '2026-11-20', notes: '' }, 'a plain activity sends only what it needs')
eq(b.buildPayload(form({ activity: 'Other', activityOther: ' Fixed the dike ', plantCondition: 'Good', notes: 'ok' }), [1]),
  { record_ids: [1], activity_type: 'Other', activity_type_other_specify: 'Fixed the dike', date_of_activity: '2026-11-20', plant_condition: 'Good', notes: 'ok' }, 'Other and the condition')
eq(b.buildPayload(form({ activity: 'Fertilizer Application', fertilizer: 'Urea', quantity: '25', unit: 'kg' }), [1]),
  { record_ids: [1], activity_type: 'Fertilizer Application', date_of_activity: '2026-11-20', notes: '', fertilizer_type: 'Urea', quantity_applied: '25', quantity_unit: 'kg' }, 'fertilizer')
eq(b.buildPayload(form({ activity: 'Fertilizer Application', fertilizer: 'Other', fertilizerOther: ' Bat guano ' }), [1]).fertilizer_type, 'Bat guano', 'a typed fertilizer')
eq(b.buildPayload(form({ activity: 'Pest Control', pestName: 'Rice bug', severity: 'High' }), [1]),
  { record_ids: [1], activity_type: 'Pest Control', date_of_activity: '2026-11-20', notes: '', pest_disease_name: 'Rice bug', severity: 'High' }, 'pest control')
// fields of another activity are not sent even if they were typed before the activity changed
eq(Object.keys(b.buildPayload(form({ fertilizer: 'Urea', pestName: 'x', severity: 'Low' }), [1])).sort(), ['activity_type', 'date_of_activity', 'notes', 'record_ids'], 'a plain activity leaves out the others')

// the button and the answer of the server
eq(b.logButtonLabel(0), 'Log Activity', 'nothing ticked')
eq(b.logButtonLabel(1), 'Log on 1 Crop', 'one crop')
eq(b.logButtonLabel(12), 'Log on 12 Crops', 'many crops')
eq(b.serverProblem({ detail: 'Rice (Young): Activity date cannot be before the planting date.', errors: [{ monitoring_record: 7, errors: {} }, { monitoring_record: 9, errors: {} }] }),
  { message: 'Rice (Young): Activity date cannot be before the planting date.', ids: [7, 9] }, 'the crops the server refused')
eq(b.serverProblem({ record_ids: ['One of the crops could not be found.'] }), { message: 'One of the crops could not be found.', ids: [] }, 'a message about the list')
eq(b.serverProblem(undefined).ids, [], 'no answer')
eq(b.doneMessage(1), 'Activity logged on 1 crop.', 'one crop saved')
eq(b.doneMessage(25), 'Activity logged on 25 crops.', 'many crops saved')

console.log(`bulkCropLog: ${n} checks passed`)
