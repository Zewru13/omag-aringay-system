import assert from 'node:assert/strict'

const { MACHINERY_FALLBACK, MACHINERY_SERVER_NAMES, machineryPayload } = await import(new URL('../src/pages/Farmers/parcelRows.js', import.meta.url).href)
const { FARMERS_EQUIPMENT } = await import(new URL('../src/pages/Organizations/registrationEquipment.js', import.meta.url).href)
const { equipmentOptions } = await import(new URL('../src/utils/equipmentNames.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// The farmer Machinery dropdown and the organization Equipment dropdown read the same list (Crop Settings > Equipment Types). Until Settings has
// one (loading, or unreachable) the machinery dropdown offers the organization forms' names, not a second, shorter list of its own.
eq(MACHINERY_FALLBACK, FARMERS_EQUIPMENT.filter((name) => name !== 'Other'), 'the fallback is the organization equipment list without Other')
eq(equipmentOptions(null, MACHINERY_FALLBACK), MACHINERY_FALLBACK, 'nothing from Settings: the fallback')
eq(equipmentOptions(['Hand Tractor', 'Mini Tiller', 'Other'], MACHINERY_FALLBACK), ['Hand Tractor', 'Mini Tiller'], 'Settings has a list: that list, without Other')

// What the server stores as it is: its own machinery names. Any other name is saved as Other + that name, so choosing from the shared list can
// never be refused by the server.
eq(MACHINERY_SERVER_NAMES, ['Hand Tractor', 'Four-Wheel Tractor', 'Thresher', 'Water Pump', 'Sprayer', 'Harvester', 'Rice Mill', 'Other'], 'the names the server accepts')
const send = (machinery_type, machinery_type_other = '') => machineryPayload({ machinery_type, machinery_type_other, quantity: '2', ownership: 'Owned' })
eq(send('Hand Tractor'), { machinery_type: 'Hand Tractor', machinery_type_other: '', quantity: 2, ownership: 'Owned' }, 'a name the server knows')
eq(send('Rice Thresher'), { machinery_type: 'Other', machinery_type_other: 'Rice Thresher', quantity: 2, ownership: 'Owned' }, 'a name from the shared list the server does not know')
eq(send('Water Pump/Irrigation Pump').machinery_type_other, 'Water Pump/Irrigation Pump', 'another shared name')
eq(send('Mini Tiller'), { machinery_type: 'Other', machinery_type_other: 'Mini Tiller', quantity: 2, ownership: 'Owned' }, 'a name an Admin added in Settings')
eq(send('Other', 'Seed Drill'), { machinery_type: 'Other', machinery_type_other: 'Seed Drill', quantity: 2, ownership: 'Owned' }, 'Other with its own text')
eq(send('Thresher').machinery_type, 'Thresher', 'an older name the server still knows')

console.log(`machineryEquipment: ${n} checks passed`)
