import assert from 'node:assert/strict'

const {
  typeFieldFor, choicesWith, ASSISTANCE_UNITS, quantityWithUnit, buildTypeConditionalPayload, EMPTY_TYPE_CONDITIONAL_FIELDS,
} = await import(new URL('../src/pages/AssistanceManagement/assistanceFieldHelpers.js', import.meta.url).href)
const { makeAssistanceForm, quantityText, assistanceFormProblem, withAssistanceType, organizationRequest, peopleRequest } = await import(new URL('../src/pages/AssistanceManagement/distributeFlow.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const today = '2026-10-27'

// ── which dropdown an assistance type needs
eq(typeFieldFor('crop', 'Seeds'), { key: 'seed_type', choices: 'seed', label: 'Type of Seed', where: 'Crop Settings > Crop Options' }, 'seeds: the crops')
eq(typeFieldFor('crop', 'Fertilizer').key, 'fertilizer_type', 'fertilizer')
eq(typeFieldFor('crop', 'Equipment').choices, 'equipment', 'equipment')
eq(typeFieldFor('crop', 'Cash Assistance'), null, 'cash needs none')
eq(typeFieldFor('crop', 'Feed'), null, 'a fisheries type is not a crop type')
eq([typeFieldFor('fisheries', 'Feed'), typeFieldFor('fisheries', 'Fishing Gear'), typeFieldFor('fisheries', 'Fingerlings/Seeds')].map((f) => [f.key, f.choices]),
  [['item_type', 'feed'], ['item_type', 'gear'], ['item_type', 'fingerling']], 'fisheries: feed, gear and fingerlings share the type of item')
eq(typeFieldFor('fisheries', 'Equipment').key, 'equipment_type', 'fisheries equipment')
eq(typeFieldFor('fisheries', 'Seeds'), null, 'fisheries have no plain seeds')
eq(typeFieldFor('fisheries', 'Boat/Vessel'), null, 'a boat is not asked a type')
eq(typeFieldFor('nowhere', 'Seeds'), null, 'unknown domain')

// ── a record's own value stays selectable even when it is no longer in the list
eq(choicesWith(['Urea', 'Ammonium'], 'Urea'), ['Urea', 'Ammonium'], 'already there')
eq(choicesWith(['Urea'], 'Old Mix'), ['Urea', 'Old Mix'], 'an older value is kept')
eq(choicesWith(null, 'Old Mix'), ['Old Mix'], 'the list not loaded yet')
eq(choicesWith(['Urea'], ''), ['Urea'], 'no current value')

// the unit of the quantity is a fixed list (no Units setting), and an older record's own unit stays choosable
eq(ASSISTANCE_UNITS, ['kg', 'sack', 'bag', 'piece', 'bundle', 'box', 'liter', 'set'], 'the fixed units')
eq(choicesWith(ASSISTANCE_UNITS, 'tin').slice(-1), ['tin'], 'an older unit is kept')
eq(choicesWith(ASSISTANCE_UNITS, 'sack'), ASSISTANCE_UNITS, 'a listed unit is not repeated')

// ── number and unit become the quantity text
eq(quantityWithUnit('2', 'sack'), '2 sack', 'a number and a unit')
eq(quantityWithUnit(' 2.5 ', ' kg '), '2.5 kg', 'trimmed')
eq(quantityWithUnit('2', ''), '2', 'no unit configured')
eq(quantityWithUnit('', 'sack'), '', 'no number, nothing')

const form = (over = {}) => ({ ...makeAssistanceForm(today), assistance_type: 'Seeds', quantity_amount: '2', quantity_unit: 'sack', ...over })
eq(quantityText(form()), '2 sack', 'the review words it with the unit')
eq(quantityText(form({ assistance_type: 'Cash Assistance', cash_amount: '500' })), '₱500 per head', 'cash is unchanged')
eq(quantityText(form({ assistance_type: 'Training' })), '', 'training is unchanged')
eq(assistanceFormProblem(form(), { today }), '', 'a number with its unit')
eq(assistanceFormProblem(form({ quantity_unit: '' }), { today }), 'Choose the unit of the quantity.', 'a number needs its unit')
eq(assistanceFormProblem(form({ quantity_unit: '', quantity_amount: '' }), { today }), '', 'no quantity at all is allowed')
eq(assistanceFormProblem(form({ quantity_amount: '0' }), { today }), 'Enter a quantity of more than 0.', 'not zero')
eq(assistanceFormProblem(form({ quantity_amount: 'abc' }), { today }), 'Enter a quantity of more than 0.', 'a number')
eq(withAssistanceType(form(), 'Fertilizer').quantity_unit, '', 'another type starts the quantity again')

// ── what is sent
eq(buildTypeConditionalPayload('Seeds', { ...EMPTY_TYPE_CONDITIONAL_FIELDS, seed_type: ' Palay (Rice) ', equipment_type: 'stale' }),
  { training_duration_days: null, equipment_type: '', seed_type: 'Palay (Rice)', fertilizer_type: '', item_type: '' }, 'crop seeds')
eq(buildTypeConditionalPayload('Feed', { ...EMPTY_TYPE_CONDITIONAL_FIELDS, item_type: ' Starter Feed ', seed_type: 'stale' }, { allowSeedFertilizer: false }),
  { training_duration_days: null, equipment_type: '', seed_type: '', fertilizer_type: '', item_type: 'Starter Feed' }, 'fisheries feed')
eq(buildTypeConditionalPayload('Equipment', { ...EMPTY_TYPE_CONDITIONAL_FIELDS, equipment_type: 'Aerator', item_type: 'stale' }, { allowSeedFertilizer: false }).item_type, '', 'equipment sends no type of item')
eq(buildTypeConditionalPayload('Cash Assistance', { ...EMPTY_TYPE_CONDITIONAL_FIELDS, item_type: 'stale' }, { allowSeedFertilizer: false }).item_type, '', 'a stale item type is never sent')
eq(organizationRequest(form({ seed_type: 'Corn (Mais)' })).seed_type, 'Corn (Mais)', 'an organization request carries the seed type')
eq(organizationRequest(form({ assistance_type: 'Feed', quantity_unit: 'kg', item_type: 'Starter Feed' }), { allowSeedFertilizer: false }).item_type, 'Starter Feed', 'and the fisheries item type')
eq(peopleRequest(form({ assistance_type: 'Fishing Gear', item_type: 'Gill Net' }), { idsKey: 'fisherfolk_ids', ids: [1], descriptionKey: 'description', allowSeedFertilizer: false }).item_type, 'Gill Net', 'people request item type')
eq(peopleRequest(form(), { idsKey: 'farmer_ids', ids: [1] }).quantity, '2 sack', 'the quantity as a number and unit')

console.log(`ok - ${n} assertions`)
