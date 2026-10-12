import assert from 'node:assert/strict'

const { canRecoverDisaster, recoveryBlockedNote, disasterStatusLabel } = await import(new URL('../src/pages/Monitoring/disasterRecovery.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

eq(canRecoverDisaster({ status: 'Active', can_recover: true }), true, 'the server says yes')
eq(canRecoverDisaster({ status: 'Active', can_recover: false }), false, 'the server says no (harvested or total loss)')
eq(canRecoverDisaster({ status: 'Active', can_recover: false, is_total_loss: false }), false, 'the server answer wins over the fallback')
eq(canRecoverDisaster({ status: 'Active' }), true, 'no flag: an active disaster')
eq(canRecoverDisaster({ status: 'Active', is_total_loss: true }), false, 'no flag: a total loss')
eq(canRecoverDisaster({ status: 'Recovered' }), false, 'no flag: already recovered')
eq(canRecoverDisaster(null), false, 'nothing')

eq(recoveryBlockedNote({ status: 'Active', can_recover: false, recovery_block_reason: 'The crop has already been harvested.' }), 'The crop has already been harvested.', 'the server reason is shown')
eq(recoveryBlockedNote({ status: 'Active', can_recover: false }), 'This disaster cannot be marked as recovered.', 'a default sentence')
eq(recoveryBlockedNote({ status: 'Active', can_recover: true }), '', 'nothing to say when it can be recovered')
eq(recoveryBlockedNote({ status: 'Recovered', can_recover: false }), '', 'nothing to say once recovered')

eq(disasterStatusLabel({ status: 'Active', can_recover: true }), 'Active', 'a recoverable one is Active')
eq(disasterStatusLabel({ status: 'Active', can_recover: false }), 'History only', 'harvested: history only')
eq(disasterStatusLabel({ status: 'Active', is_total_loss: true, can_recover: false }), 'Total loss', 'a total loss says so')
eq(disasterStatusLabel({ status: 'Recovered', can_recover: false }), 'Recovered', 'recovered stays Recovered')

console.log(`disasterRecovery: ${n} checks passed`)
