import assert from 'node:assert/strict'

const {
  FARMERS_EQUIPMENT, FISHERFOLK_EQUIPMENT, equipmentChoicesFor, makeEquipmentLine, equipmentLineProblem, equipmentLinesProblem, equipmentLinePayload,
} = await import(new URL('../src/pages/Organizations/registrationEquipment.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// the choices follow the kind of organization
eq(equipmentChoicesFor('farmers')[0], 'Hand Tractor', 'farmers organizations start with farm equipment')
eq(equipmentChoicesFor('fisherfolk')[0], 'Fishing Boat/Banca', 'fisherfolk organizations start with fishing equipment')
eq([FARMERS_EQUIPMENT, FISHERFOLK_EQUIPMENT].map((list) => list[list.length - 1]), ['Other', 'Other'], 'Other is last')

// a new line starts as one unit of the first choice
eq(makeEquipmentLine(3, 'farmers'), { _uid: 3, equipment_name: 'Hand Tractor', equipment_name_other: '', quantity: '1', acquisition_date: '', remarks: '' }, 'a blank line')
eq(makeEquipmentLine(4, 'fisherfolk').equipment_name, 'Fishing Boat/Banca', 'a blank fisherfolk line')

// what is wrong with a line
const line = (over = {}) => ({ ...makeEquipmentLine(1, 'farmers'), ...over })
const today = '2026-10-27'
eq(equipmentLineProblem(line(), today), '', 'a complete line')
eq(equipmentLineProblem(line({ equipment_name: '' }), today), 'choose the equipment', 'the equipment is needed')
eq(equipmentLineProblem(line({ equipment_name: 'Other', equipment_name_other: '  ' }), today), 'say what the equipment is', 'Other needs its name')
eq(equipmentLineProblem(line({ equipment_name: 'Other', equipment_name_other: 'Seed Cleaner' }), today), '', 'Other with its name')
eq(equipmentLineProblem(line({ quantity: '' }), today), 'enter a quantity of at least 1', 'the quantity is needed')
eq(equipmentLineProblem(line({ quantity: '0' }), today), 'enter a quantity of at least 1', 'not zero units')
eq(equipmentLineProblem(line({ quantity: '1.5' }), today), 'enter a quantity of at least 1', 'whole units')
eq(equipmentLineProblem(line({ acquisition_date: '2026-10-28' }), today), 'the acquisition date cannot be in the future', 'not in the future')
eq(equipmentLineProblem(line({ acquisition_date: '2026-10-27' }), today), '', 'today is fine')
eq(equipmentLineProblem(line({ remarks: 'x'.repeat(501) }), today), 'keep the remarks under 500 characters', 'remarks are short')

// the whole list: the first problem names its line
eq(equipmentLinesProblem([line(), line({ quantity: '0' })], today), 'Equipment 2: enter a quantity of at least 1.', 'the line is named')
eq(equipmentLinesProblem([line(), line()], today), '', 'all fine')
eq(equipmentLinesProblem([], today), '', 'none is fine')

// what is sent
eq(equipmentLinePayload(line({ quantity: '3', acquisition_date: '2026-09-01', remarks: ' Donated ' })),
  { equipment_name: 'Hand Tractor', quantity: 3, acquisition_date: '2026-09-01', remarks: 'Donated' }, 'a line as the server takes it')
eq(equipmentLinePayload(line({ equipment_name: 'Other', equipment_name_other: ' Seed Cleaner ' })),
  { equipment_name: 'Other', equipment_name_other: 'Seed Cleaner', quantity: 1 }, 'Other sends its name; empty optional cells are left out')

console.log(`registrationEquipment: ${n} checks passed`)
