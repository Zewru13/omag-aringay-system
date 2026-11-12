// Log Fishing Trip / Catch and Edit Catch Log are ONE form: the trip details and the species table, filled in when editing.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const here = (p) => new URL(`../${p}`, import.meta.url)
const read = (p) => readFileSync(here(p), 'utf8').replace(/\r\n/g, '\n')
const {
  EMPTY_TRIP, FISHING_GROUNDS, GEARS, SPECIES_NAMES, emptySpeciesRow, tripFormFrom, speciesRowsFrom, speciesName, validSpeciesRows, catchTotal,
  tripProblem, tripPayload, speciesChanges,
} = await import(here('src/pages/Monitoring/catchForm.js').href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }

ok(FISHING_GROUNDS.includes('Municipal Waters') && GEARS.includes('Gill Net') && SPECIES_NAMES.includes('Bangus'), 'the lists the form offers')
ok(!FISHING_GROUNDS.includes('Other') && !GEARS.includes('Other') && !SPECIES_NAMES.includes('Other'), 'Other is the box of the dropdown, not an item of the lists')

// --- an existing catch log fills the same form
const record = {
  id: 4, fisherfolk: 9, fisherfolk_name: 'Pedro Reyes', trip_date: '2026-10-01', return_date: null, fishing_ground: 'Municipal Waters', gear_used: 'Bamboo trap',
  hours_at_sea: '6.50', total_catch_kg: '42.00', remarks: null,
  species_entries: [{ id: 21, species_name: 'Bangus', volume_kg: '30.00', notes: '' }, { id: 22, species_name: 'Kitang', volume_kg: '12.00', notes: 'small' }],
}
const form = tripFormFrom(record)
eq(Object.keys(form).sort(), Object.keys(EMPTY_TRIP).sort(), 'the edit form holds exactly the fields of the log form')
eq([form.trip_date, form.return_date, form.hours_at_sea, form.remarks], ['2026-10-01', '', '6.50', ''], 'dates, hours and remarks are filled in')
eq([form.fishing_ground, form.fishing_ground_other], ['Municipal Waters', ''], 'a fishing ground of the list is chosen in the list')
eq([form.gear_used, form.gear_used_other], ['Other', 'Bamboo trap'], 'a gear that is not in the list opens as Other with its text')
const rows = speciesRowsFrom(record)
eq(rows.map((r) => [r.id, r.species_name, r.species_name_other, r.volume_kg, r.notes]),
  [[21, 'Bangus', '', '30.00', ''], [22, 'Other', 'Kitang', '12.00', 'small']], 'the species table is filled in, a species outside the list as Other')
eq(speciesRowsFrom({ species_entries: [] }).length, 1, 'a log with no species opens with one empty row')
eq(speciesRowsFrom({}).length, 1, 'so does a new log')

// --- the species table
eq(speciesName({ species_name: 'Other', species_name_other: '  Kitang ' }), 'Kitang', 'the typed species')
eq(speciesName({ species_name: 'Bangus', species_name_other: 'x' }), 'Bangus', 'the listed species')
const typed = [{ ...emptySpeciesRow(), species_name: 'Bangus', volume_kg: '10' }, { ...emptySpeciesRow(), species_name: 'Tilapia', volume_kg: '' }, emptySpeciesRow(),
  { ...emptySpeciesRow(), species_name: 'Other', species_name_other: 'Kitang', volume_kg: '2.5' }]
eq(validSpeciesRows(typed).length, 2, 'only rows with a species and a volume count')
eq(catchTotal(typed), 12.5, 'the total is the sum of the volumes')

// --- what the form refuses
const good = { ...EMPTY_TRIP, trip_date: '2026-10-01', fishing_ground: 'River', gear_used: 'Gill Net' }
const one = [{ ...emptySpeciesRow(), species_name: 'Bangus', volume_kg: '10' }]
eq(tripProblem({ fisherfolk: { id: 1 }, form: good, rows: one }), '', 'a complete log')
eq(tripProblem({ fisherfolk: null, form: good, rows: one }), 'Select a fisherfolk.', 'no fisherfolk')
eq(tripProblem({ fisherfolk: { id: 1 }, form: { ...good, trip_date: '' }, rows: one }), 'Trip date is required.', 'no trip date')
eq(tripProblem({ fisherfolk: { id: 1 }, form: { ...good, return_date: '2026-09-30' }, rows: one }), 'Return date cannot be before the trip date.', 'a return before the trip')
eq(tripProblem({ fisherfolk: { id: 1 }, form: { ...good, fishing_ground: '' }, rows: one }), 'Choose the fishing ground.', 'no fishing ground')
eq(tripProblem({ fisherfolk: { id: 1 }, form: { ...good, fishing_ground: 'Other', fishing_ground_other: ' ' }, rows: one }), 'Specify the fishing ground.', 'Other with nothing typed')
eq(tripProblem({ fisherfolk: { id: 1 }, form: { ...good, gear_used: 'Other' }, rows: one }), 'Specify the gear used.', 'Other gear with nothing typed')
eq(tripProblem({ fisherfolk: { id: 1 }, form: { ...good, hours_at_sea: '-1' }, rows: one }), 'Hours at sea cannot be negative.', 'negative hours')
eq(tripProblem({ fisherfolk: { id: 1 }, form: good, rows: [emptySpeciesRow()] }), 'Add at least one species with its volume.', 'no species')
eq(tripProblem({ fisherfolk: { id: 1 }, form: good, rows: [emptySpeciesRow()], speciesOptional: true }), '', 'an older log that never had species may stay without')

// --- what is sent
eq(tripPayload({ ...good, fishing_ground: 'Other', fishing_ground_other: ' Reef ', return_date: '', hours_at_sea: '', remarks: ' ok ' }),
  { trip_date: '2026-10-01', return_date: null, fishing_ground: 'Reef', gear_used: 'Gill Net', hours_at_sea: null, remarks: 'ok' }, 'the trip as the server keeps it')
eq(tripPayload({ ...good, hours_at_sea: '6.5' }).hours_at_sea, 6.5, 'hours as a number')
ok(!('total_catch_kg' in tripPayload(good)), 'the total is never sent: it is the sum of the species')

// --- editing the species: only what changed is removed and added
const original = record.species_entries
const same = speciesRowsFrom(record)
eq(speciesChanges(original, same), { remove: [], add: [] }, 'nothing changed, nothing sent')
const changed = [{ ...same[0], volume_kg: '35' }, same[1]]
eq(speciesChanges(original, changed), { remove: [21], add: [{ species_name: 'Bangus', volume_kg: '35', notes: '' }] }, 'a changed row is replaced')
eq(speciesChanges(original, [same[1]]), { remove: [21], add: [] }, 'a removed row is deleted')
eq(speciesChanges(original, [...same, { ...emptySpeciesRow(), species_name: 'Hito', volume_kg: '3' }]),
  { remove: [], add: [{ species_name: 'Hito', volume_kg: '3', notes: '' }] }, 'a new row is added')
eq(speciesChanges(original, [...same, emptySpeciesRow()]), { remove: [], add: [] }, 'an empty row is ignored')
eq(speciesChanges([], [{ ...emptySpeciesRow(), species_name: 'Hito', volume_kg: '3' }]).add.length, 1, 'a new log adds every row')

// --- one window for both, in the table layout; the page uses it to edit
const modal = read('src/pages/Monitoring/LogCatchModal.jsx')
ok(/function LogCatchModal\(\{[^}]*record/.test(modal), 'the window takes the record to edit')
ok(modal.includes("from '../../components/UI/FormTable.jsx'") && modal.includes("from '../../components/UI/EntryTable.jsx'"), 'trip details as a table form, species as a table of rows')
for (const label of ['Fisherfolk', 'Trip Date', 'Return Date', 'Fishing Ground', 'Gear Used', 'Hours at Sea', 'Remarks']) ok(modal.includes(`label="${label}"`), `field ${label}`)
ok(!/estimated_value_php|Est\. Value/.test(modal), 'no value box that was never saved')
const page = read('src/pages/Monitoring/FisheriesMonitoringPage.jsx')
ok(!/function EditCatchModal/.test(page), 'the page has no second catch form')
ok(/<LogCatchModal\s+record=\{editingCatch\}/.test(page), 'editing a catch log opens the same window')

console.log(`catchForm: ${n} checks passed`)
