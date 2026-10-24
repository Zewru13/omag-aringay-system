import assert from 'node:assert/strict'

const {
  OWNERSHIP_OPTIONS, EMPTY_OWNERSHIP, needsOwnerDetails, ownershipLabel, ownershipFrom, chooseOwnership, ownershipProblem, ownershipPayload,
  ownershipChanged, ownershipRows,
} = await import(new URL('../src/utils/ownership.js', import.meta.url).href)
const { PCIC_NAME_CLASS, canSeePcicHighlight, pcicNameClass, pcicDetails } = await import(new URL('../src/utils/pcic.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// the dropdown has exactly three choices, in this order
eq(OWNERSHIP_OPTIONS, ['Tenant', 'Lease', 'Owner'], 'ownership choices')
eq([needsOwnerDetails('Tenant'), needsOwnerDetails('Lease'), needsOwnerDetails('Owner'), needsOwnerDetails('')], [true, true, false, false], 'who needs owner details')

// what a table row or the details show
eq(ownershipLabel('Tenant'), 'Tenant', 'saved value')
eq([ownershipLabel(''), ownershipLabel(null), ownershipLabel(undefined), ownershipLabel('Lessee')], Array(4).fill('Not specified'), 'older cycles')

// switching: Owner clears the owner details, Tenant <-> Lease keeps them
const tenant = { ownership: 'Tenant', ownerName: 'Rosa', ownerNo: '0045' }
eq(chooseOwnership(tenant, 'Lease'), { ownership: 'Lease', ownerName: 'Rosa', ownerNo: '0045' }, 'tenant to lease keeps them')
eq(chooseOwnership(tenant, 'Owner'), { ownership: 'Owner', ownerName: '', ownerNo: '' }, 'owner clears them')
eq(chooseOwnership(chooseOwnership(tenant, 'Owner'), 'Tenant'), { ownership: 'Tenant', ownerName: '', ownerNo: '' }, 'they stay cleared')

// what has to be filled in
eq(ownershipProblem(EMPTY_OWNERSHIP), 'Choose the ownership.', 'nothing chosen')
eq(ownershipProblem({ ownership: 'Owner', ownerName: '', ownerNo: '' }), '', 'owner is complete')
eq(ownershipProblem({ ownership: 'Tenant', ownerName: '  ', ownerNo: '12' }), "Enter the owner's name.", 'blank name')
eq(ownershipProblem({ ownership: 'Lease', ownerName: 'Rosa', ownerNo: '' }), "Enter the owner's RSBSA / FishR number.", 'no number')
eq(ownershipProblem(tenant), '', 'tenant is complete')

// what is sent: the number stays text, Owner sends blanks
eq(ownershipPayload({ ownership: 'Tenant', ownerName: ' Rosa ', ownerNo: ' 0012-0345 ' }), { ownership: 'Tenant', owner_name: 'Rosa', owner_registration_number: '0012-0345' }, 'leading zeros kept')
eq(ownershipPayload({ ownership: 'Owner', ownerName: 'old', ownerNo: 'old' }), { ownership: 'Owner', owner_name: '', owner_registration_number: '' }, 'owner clears what was saved')
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

// PCIC: the blue name is for Admin and Focal Person, and only for the row's own insured cycle
eq([canSeePcicHighlight('ADMIN'), canSeePcicHighlight('EVALUATOR'), canSeePcicHighlight('CITIZEN')], [true, true, false], 'who sees it')
eq(pcicNameClass({ has_pcic_insurance: true }, 'ADMIN'), PCIC_NAME_CLASS, 'insured, admin')
eq(pcicNameClass({ has_pcic_insurance: true }, 'EVALUATOR'), PCIC_NAME_CLASS, 'insured, focal person')
eq(pcicNameClass({ has_pcic_insurance: false }, 'ADMIN'), '', 'not insured keeps the normal colour')
eq(pcicNameClass({ has_pcic_insurance: true }, 'CITIZEN'), '', 'a fisherfolk account sees no highlight')
eq(pcicNameClass(null, 'ADMIN'), '', 'no record')

// PCIC section of Cycle Details
eq(pcicDetails({ has_pcic_insurance: true, pcic_form_photo: 'https://x/y.png' }), { insured: true, status: 'Insured', documentUrl: 'https://x/y.png', documentStatus: 'Document available' }, 'insured with a document')
eq(pcicDetails({ has_pcic_insurance: true, pcic_form_photo: null }), { insured: true, status: 'Insured', documentUrl: '', documentStatus: 'No document uploaded' }, 'insured without a document')
eq(pcicDetails({ has_pcic_insurance: false, pcic_form_photo: 'https://x/old.png' }), { insured: false, status: 'Not Insured', documentUrl: '', documentStatus: 'Not applicable' }, 'not insured shows no document')
eq(pcicDetails({}).status, 'Not Insured', 'an older cycle')

console.log(`ownership: ${n} checks passed`)
