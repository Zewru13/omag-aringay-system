import assert from 'node:assert/strict'
import fs from 'node:fs'

const rules = await import(new URL('../src/pages/Monitoring/cycleLogForms.js', import.meta.url).href)
const { unitLabel, isForceObservation, unitEntryNeeds, validateUnitEntry, LOG_ACTIVITY_OPTIONS, HEALTH_OBSERVATION_OPTIONS, HEALTH_DISEASE_OBSERVATIONS } = rules

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// ── what the Log Activity button offers
eq(LOG_ACTIVITY_OPTIONS.map((o) => [o.key, o.label]), [['feeding', 'Feeding Log'], ['health', 'Health Log']], 'Log Activity offers a Feeding Log and a Health Log, in that order')

// ── a pond or a cage is named by its number
eq(unitLabel({ unit_type: 'pond', unit_number: 2 }), 'Pond 2', 'a pond')
eq(unitLabel({ unit_type: 'cage', unit_number: 5 }), 'Cage 5', 'a cage')

// ── the same Force Harvest rule as the backend: mortality and the diseases
eq(isForceObservation('Fish Mortality'), true, 'mortality')
eq(HEALTH_DISEASE_OBSERVATIONS.every(isForceObservation), true, 'every disease')
eq(isForceObservation('Injury'), false, 'an injury is not a force-harvest observation')
eq(isForceObservation(''), false, 'nothing chosen')
eq(HEALTH_DISEASE_OBSERVATIONS.every((d) => HEALTH_OBSERVATION_OPTIONS.includes(d)), true, 'the diseases are among the observations')

// ── which boxes a pond's row needs once its observation is chosen
eq(unitEntryNeeds({ observation: '' }), { observation: true, mortality: false, treatment: false, force: false }, 'nothing chosen yet: only the observation')
eq(unitEntryNeeds({ observation: 'Fish Mortality' }), { observation: true, mortality: true, treatment: false, force: true }, 'mortality needs a count, no treatment')
eq(unitEntryNeeds({ observation: 'Fin Rot' }), { observation: true, mortality: false, treatment: false, force: true }, 'a disease needs neither (force harvest instead)')
eq(unitEntryNeeds({ observation: 'Injury' }), { observation: true, mortality: false, treatment: true, force: false }, 'an injury needs a treatment')
eq(unitEntryNeeds({ observation: 'Other' }), { observation: true, mortality: false, treatment: true, force: false }, 'Other needs a treatment too')

// ── the same messages the form always showed
const entry = (patch) => ({ observation: '', observation_other: '', mortality_count: '', treatment_applied: '', ...patch })
eq(validateUnitEntry(entry({})), 'Observation is required.', 'no observation')
eq(validateUnitEntry(entry({ observation: 'Other', observation_other: '  ' })), 'Specify the observation.', 'Other without a name')
eq(validateUnitEntry(entry({ observation: 'Fish Mortality', mortality_count: '0' })), 'Mortality Count is required for Fish Mortality.', 'mortality without a count')
eq(validateUnitEntry(entry({ observation: 'Injury' })), 'Treatment is required for this observation.', 'injury without a treatment')
eq(validateUnitEntry(entry({ observation: 'Injury', treatment_applied: 'Isolate Injured Fish' })), '', 'a complete row')
eq(validateUnitEntry(entry({ observation: 'Fish Mortality', mortality_count: '4' })), '', 'mortality with a count needs no treatment')
eq(validateUnitEntry(entry({ observation: 'Parasites' })), '', 'a disease needs no treatment')

// ── the ⋮ menu of a Fisheries Monitoring row
const page = fs.readFileSync(new URL('../src/pages/FisheriesRecords/FisheriesRecordsPage.jsx', import.meta.url), 'utf8')
const start = page.indexOf('function StockingRowActions')
const menu = page.slice(start, page.indexOf('\nfunction ', start + 10))
eq(/label: 'Cycle & Logs'/.test(menu), false, 'Cycle & Logs is not in the ⋮ menu')
eq(/label: 'Print Report'/.test(menu), false, 'Print Report is not in the ⋮ menu')
for (const kept of ["label: 'View Details'", "label: 'Edit'", "label: 'Force Harvest'"]) eq(menu.includes(kept), true, `${kept} stays`)
eq(page.includes('buildReport'), true, 'the Print Report button above the table (buildReport) stays')

console.log(`ok - ${n} assertions`)
