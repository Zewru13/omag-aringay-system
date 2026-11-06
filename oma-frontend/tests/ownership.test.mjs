import assert from 'node:assert/strict'

const {
  OWNERSHIP_OPTIONS, EMPTY_OWNERSHIP, needsOwnerDetails, ownershipLabel, ownershipFrom, chooseOwnership, ownershipProblem, ownershipPayload,
  ownershipChanged, ownershipRows, ownerLine,
} = await import(new URL('../src/utils/ownership.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// the dropdown has exactly three choices, in this order
eq(OWNERSHIP_OPTIONS, ['Tenant', 'Lease', 'Owner'], 'ownership choices')
eq([needsOwnerDetails('Tenant'), needsOwnerDetails('Lease'), needsOwnerDetails('Owner'), needsOwnerDetails('')], [true, false, false, false], 'only a tenant needs owner details')

// what a table row or the details show
eq(ownershipLabel('Tenant'), 'Tenant', 'saved value')
eq([ownershipLabel(''), ownershipLabel(null), ownershipLabel(undefined), ownershipLabel('Lessee')], Array(4).fill('Not specified'), 'older cycles')

// switching: anything but Tenant clears the owner details
const tenant = { ownership: 'Tenant', ownerName: 'Rosa', ownerNo: '0045' }
eq(chooseOwnership(tenant, 'Lease'), { ownership: 'Lease', ownerName: '', ownerNo: '' }, 'lease clears them')
eq(chooseOwnership(chooseOwnership(tenant, 'Lease'), 'Tenant'), { ownership: 'Tenant', ownerName: '', ownerNo: '' }, 'tenant after lease starts empty')
eq(chooseOwnership({ ownership: 'Tenant', ownerName: 'Rosa', ownerNo: '' }, 'Tenant'), { ownership: 'Tenant', ownerName: 'Rosa', ownerNo: '' }, 'staying on tenant keeps what was typed')
eq(chooseOwnership(tenant, 'Owner'), { ownership: 'Owner', ownerName: '', ownerNo: '' }, 'owner clears them')
eq(chooseOwnership(chooseOwnership(tenant, 'Owner'), 'Tenant'), { ownership: 'Tenant', ownerName: '', ownerNo: '' }, 'they stay cleared')

// what has to be filled in
eq(ownershipProblem(EMPTY_OWNERSHIP), 'Choose the ownership.', 'nothing chosen')
eq(ownershipProblem({ ownership: 'Owner', ownerName: '', ownerNo: '' }), '', 'owner is complete')
eq(ownershipProblem({ ownership: 'Tenant', ownerName: '  ', ownerNo: '12' }), "Enter the owner's name.", 'blank name')
eq(ownershipProblem({ ownership: 'Tenant', ownerName: 'Rosa', ownerNo: '' }), "Enter the owner's RSBSA / FishR number.", 'no number')
eq(ownershipProblem({ ownership: 'Lease', ownerName: '', ownerNo: '' }), '', 'lease is complete without owner details')
eq(ownershipProblem(tenant), '', 'tenant is complete')

// what is sent: the number stays text, Owner sends blanks
eq(ownershipPayload({ ownership: 'Tenant', ownerName: ' Rosa ', ownerNo: ' 0012-0345 ' }), { ownership: 'Tenant', owner_name: 'Rosa', owner_registration_number: '0012-0345' }, 'leading zeros kept')
eq(ownershipPayload({ ownership: 'Owner', ownerName: 'old', ownerNo: 'old' }), { ownership: 'Owner', owner_name: '', owner_registration_number: '' }, 'owner clears what was saved')
eq(ownershipPayload({ ownership: 'Lease', ownerName: 'old', ownerNo: 'old' }), { ownership: 'Lease', owner_name: '', owner_registration_number: '' }, 'lease sends no stale owner details')
eq(ownershipPayload(EMPTY_OWNERSHIP), {}, 'nothing chosen sends nothing')

// an edit loads the saved values and only sends them when they changed
const saved = { ownership: 'Tenant', owner_name: 'Rosa', owner_registration_number: '0045' }
eq(ownershipFrom(saved), tenant, 'loaded from a cycle')
eq(ownershipFrom({ ownership: '' }), EMPTY_OWNERSHIP, 'an older cycle loads as nothing chosen')
eq([ownershipChanged(tenant, saved), ownershipChanged({ ...tenant, ownerNo: '0046' }, saved), ownershipChanged(EMPTY_OWNERSHIP, { ownership: '' })], [false, true, false], 'changed or not')

// Cycle Details rows
eq(ownershipRows({ ownership: 'Owner', owner_name: 'x' }), [['Ownership', 'Owner']], 'owner shows only the ownership')
eq(ownershipRows(saved), [['Ownership', 'Tenant'], ['Owner Name', 'Rosa'], ['RSBSA / FishR No. of Owner', '0045']], 'tenant shows the owner')
eq(ownershipRows({}), [['Ownership', 'Not specified']], 'an older cycle')
eq(ownershipRows({ ownership: 'Lease' }), [['Ownership', 'Lease']], 'lease shows only the ownership')
eq(ownershipRows({ ownership: 'Lease', owner_name: 'Rosa', owner_registration_number: '' }), [['Ownership', 'Lease'], ['Owner Name', 'Rosa'], ['RSBSA / FishR No. of Owner', '—']], 'an older lease cycle still shows its saved owner')

// the owner's name under "Tenant" in the Aquaculture Monitoring and Aquaculture Records tables
eq(ownerLine({ ownership: 'Tenant', owner_name: 'Juan Dela Cruz' }), 'Owner: Juan Dela Cruz', 'a tenant shows the saved owner')
eq(ownerLine({ ownership: 'Tenant', owner_name: '  Juan  ' }), 'Owner: Juan', 'trimmed')
eq(ownerLine({ ownership: 'Tenant', owner_name: '' }), '', 'a tenant without a saved owner shows nothing invented')
eq(ownerLine({ ownership: 'Tenant', owner_name: '   ' }), '', 'blank spaces are not a name')
eq(ownerLine({ ownership: 'Tenant' }), '', 'no owner field at all')
eq(ownerLine({ ownership: 'Tenant', owner_name: null }), '', 'null')
eq(ownerLine({ ownership: 'Owner', owner_name: 'Juan' }), '', 'Owner keeps its current display')
eq(ownerLine({ ownership: 'Lease', owner_name: 'Juan' }), '', 'Lease keeps its current display, even with older owner details')
eq(ownerLine({ ownership: '', owner_name: 'Juan' }), '', 'Not specified keeps its current display')
eq(ownerLine(null), '', 'nothing')

console.log(`ownership: ${n} checks passed`)
