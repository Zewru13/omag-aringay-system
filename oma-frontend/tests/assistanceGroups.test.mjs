import assert from 'node:assert/strict'

const { CURRENT_STATUSES, HISTORY_STATUSES, inGroup, groupOfStatus, tabFromParam, emptyAssistanceText } =
  await import(new URL('../src/pages/AssistanceManagement/assistanceGroups.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// Current: still open. History: finished.
eq(CURRENT_STATUSES, ['PENDING', 'AWAITING_CONFIRMATION', 'NOT_RECEIVED'], 'current statuses')
eq(HISTORY_STATUSES, ['CONFIRMED', 'RESOLVED'], 'history statuses')
for (const s of CURRENT_STATUSES) { eq([inGroup(s, 'current'), inGroup(s, 'history')], [true, false], `${s} is current`); eq(groupOfStatus(s), 'current', `${s} group`) }
for (const s of HISTORY_STATUSES) { eq([inGroup(s, 'current'), inGroup(s, 'history')], [false, true], `${s} is history`); eq(groupOfStatus(s), 'history', `${s} group`) }
eq(inGroup('SOMETHING_NEW', 'current'), false, 'an unknown status is in neither')
eq(inGroup(undefined, 'history'), false, 'no status')

// Old links (?tab=needs-follow-up, upcoming, all, confirm) still open the right place.
eq(tabFromParam(null), 'current', 'no tab opens Current')
eq(tabFromParam('history'), 'history', 'history')
eq(tabFromParam('needs-follow-up'), 'current', 'old follow-up link')
eq(tabFromParam('upcoming'), 'current', 'old upcoming link')
eq(tabFromParam('all'), 'current', 'old all link')
eq(tabFromParam('confirm', { allowConfirm: true }), 'confirm', 'an organization may open Confirm for Members')
eq(tabFromParam('confirm'), 'current', 'anyone else gets Current')
eq(tabFromParam('nonsense'), 'current', 'unknown')

eq(emptyAssistanceText('current'), 'Nothing is waiting: no assistance is scheduled, awaiting confirmation or needing follow-up.', 'current empty')
eq(emptyAssistanceText('history'), 'No assistance has been received or confirmed yet.', 'history empty')

console.log(`assistanceGroups: ${n} checks passed`)
