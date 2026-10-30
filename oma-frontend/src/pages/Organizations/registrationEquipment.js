// The equipment an organization has, as entered on its registration form (and the choices the Add Equipment window offers): the lists of
// kinds, the blank line, what is wrong with a line and what is sent. No screen and no network, so it can be tested on its own.
// The values match FarmersOrganizationEquipment / FisherfolkOrganizationEquipment on the server.

import { equipmentToServer } from '../../utils/equipmentNames.js'

export const FARMERS_EQUIPMENT = [
  'Hand Tractor',
  'Four-Wheel Tractor',
  'Rice Thresher',
  'Corn Sheller',
  'Water Pump/Irrigation Pump',
  'Knapsack Sprayer',
  'Power Sprayer',
  'Rice Mill',
  'Dryer',
  'Storage Facility',
  'Post-Harvest Equipment',
  'Farm Tools (Shovel, Hoe, etc.)',
  'Harvesting Equipment',
  'Seedling Tray',
  'Greenhouse/Net House',
  'Generator',
  'Other',
]

export const FISHERFOLK_EQUIPMENT = [
  'Fishing Boat/Banca',
  'Motorized Banca',
  'Outboard Motor',
  'Fish Cage',
  'Fish Net (Gill Net)',
  'Fish Net (Cast Net)',
  'Fish Net (Trawl Net)',
  'Fishing Lines and Hooks',
  'Fish Pond/Tank',
  'Aerator/Air Pump',
  'Water Pump',
  'Life Vest/Safety Gear',
  'Ice Box/Cooler',
  'Fish Weighing Scale',
  'GPS/Navigation Equipment',
  'Feeding Equipment',
  'Harvesting Net',
  'Generator',
  'Other',
]

export const equipmentChoicesFor = (type) => (type === 'farmers' ? FARMERS_EQUIPMENT : FISHERFOLK_EQUIPMENT)

export const REMARKS_MAX = 500

// A new line starts blank: the equipment is chosen from the list in Settings (see useEquipmentOptions).
export const makeEquipmentLine = (uid) => ({
  _uid: uid,
  equipment_name: '',
  equipment_name_other: '',
  quantity: '1',
  acquisition_date: '',
  remarks: '',
})

// What is wrong with one line ('' when nothing). `today` is YYYY-MM-DD.
export function equipmentLineProblem(line, today) {
  if (!line.equipment_name) return 'choose the equipment'
  if (line.equipment_name === 'Other' && !(line.equipment_name_other || '').trim()) return 'say what the equipment is'
  if (!/^\d+$/.test(String(line.quantity).trim()) || Number(line.quantity) < 1) return 'enter a quantity of at least 1'
  if (line.acquisition_date && line.acquisition_date > today) return 'the acquisition date cannot be in the future'
  if ((line.remarks || '').length > REMARKS_MAX) return `keep the remarks under ${REMARKS_MAX} characters`
  return ''
}

// The first problem of the list, naming its line ('' when there is none).
export function equipmentLinesProblem(lines, today) {
  for (let i = 0; i < lines.length; i += 1) {
    const problem = equipmentLineProblem(lines[i], today)
    if (problem) return `Equipment ${i + 1}: ${problem}.`
  }
  return ''
}

// One line as the server takes it: the optional cells that are empty are left out, and every line is added in Good condition.
// A name the server does not list (one added in Settings > Equipment Types) is sent as Other + that name.
export function equipmentLinePayload(line, type = 'farmers') {
  const { name, other } = equipmentToServer(line.equipment_name, line.equipment_name_other, equipmentChoicesFor(type))
  const payload = { equipment_name: name, quantity: parseInt(line.quantity, 10) }
  if (name === 'Other') payload.equipment_name_other = other
  return { ...payload, ...optional(line) }
}

function optional(line) {
  const extra = {}
  if (line.acquisition_date) extra.acquisition_date = line.acquisition_date
  if ((line.remarks || '').trim()) extra.remarks = line.remarks.trim()
  return extra
}
