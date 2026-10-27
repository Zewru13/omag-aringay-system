// The equipment an organization has, as entered on its registration form (and the choices the Add Equipment window offers): the lists of
// kinds, the blank line, what is wrong with a line and what is sent. No screen and no network, so it can be tested on its own.
// The values match FarmersOrganizationEquipment / FisherfolkOrganizationEquipment on the server.

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

export const makeEquipmentLine = (uid, type) => ({
  _uid: uid,
  equipment_name: equipmentChoicesFor(type)[0],
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
export function equipmentLinePayload(line) {
  const payload = { equipment_name: line.equipment_name, quantity: parseInt(line.quantity, 10) }
  if (line.equipment_name === 'Other') {
    return { equipment_name: 'Other', equipment_name_other: line.equipment_name_other.trim(), quantity: payload.quantity, ...optional(line) }
  }
  return { ...payload, ...optional(line) }
}

function optional(line) {
  const extra = {}
  if (line.acquisition_date) extra.acquisition_date = line.acquisition_date
  if ((line.remarks || '').trim()) extra.remarks = line.remarks.trim()
  return extra
}
