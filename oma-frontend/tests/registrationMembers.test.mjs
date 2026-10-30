import assert from 'node:assert/strict'

const { MEMBER_POSITIONS, makeMemberLine, addMemberLine, joinedOn, memberLineProblem, memberLinesProblem, memberPayload, memberRefusal, memberOutcome } =
  await import(new URL('../src/pages/Organizations/registrationMembers.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const TODAY = '2026-10-30'

const ana = { id: 4, full_name: 'Ana Cruz', rsbsa_number: '01-033-02-019-000123' }
eq(makeMemberLine(ana, 7), { _uid: 7, person_id: 4, name: 'Ana Cruz', rsbsa: '01-033-02-019-000123', position: 'Member', date_joined: '' }, 'a person becomes a line')
eq(MEMBER_POSITIONS[0], 'Member', 'Member is the first position')
const one = addMemberLine([], ana, 1)
eq(addMemberLine(one, ana, 2), one, 'a person already on the list is not added twice')
eq(addMemberLine(one, { id: 5, full_name: 'Ben Dizon' }, 2).length, 2, 'another person is')

eq(joinedOn({ date_joined: '2026-01-05' }, '2025-12-01', TODAY), '2026-01-05', 'a typed date wins')
eq(joinedOn({ date_joined: '' }, '2025-12-01', TODAY), '2025-12-01', 'the date registered is the default')
eq(joinedOn({ date_joined: '' }, '', TODAY), TODAY, 'today when nothing else')

eq(memberLineProblem(one[0], '2025-12-01', TODAY), '', 'a good line')
eq(memberLineProblem({ ...one[0], position: 'King' }, '', TODAY), 'choose the position', 'an unknown position')
eq(memberLineProblem({ ...one[0], date_joined: '2026-11-01' }, '', TODAY), 'the date joined cannot be in the future', 'a future date')
eq(memberLineProblem(one[0], '2026-12-01', TODAY), 'the date joined cannot be in the future', 'a registration date in the future')
eq(memberLinesProblem([one[0], { ...one[0], name: 'Ben', position: '' }], '', TODAY), 'Member 2 (Ben): choose the position.', 'the first problem names its line')
eq(memberLinesProblem([], '', TODAY), '', 'no members is fine')

eq(memberPayload(one[0], 'farmers', '2025-12-01', TODAY), { farmer: 4, position: 'Member', date_joined: '2025-12-01' }, 'a farmer member payload')
eq(memberPayload({ ...one[0], position: 'Secretary', date_joined: '2026-02-02' }, 'fisherfolk', '', TODAY), { fisherfolk: 4, position: 'Secretary', date_joined: '2026-02-02' }, 'a fisherfolk member payload')

assert.match(memberRefusal({ main_choice_required: true }), /choose it/); n++
eq(memberRefusal({ detail: 'This farmer is already a member of this organization.' }), 'This farmer is already a member of this organization.', 'a detail')
eq(memberRefusal({ date_joined: ['Date joined cannot be in the future.'] }), 'Date joined cannot be in the future.', 'a field message')
eq(memberRefusal({}), 'could not be added', 'nothing said')

eq(memberOutcome(0, []), { kind: 'none', text: '' }, 'no members')
eq(memberOutcome(3, []), { kind: 'ok', text: '3 members added.' }, 'all added')
eq(memberOutcome(1, []), { kind: 'ok', text: '1 member added.' }, 'one added')
eq(memberOutcome(3, [{ name: 'Ben', reason: 'could not be added' }]), { kind: 'partial', text: '2 of 3 members added. Not added: Ben could not be added.' }, 'some refused')

console.log(`registrationMembers: ${n} checks passed`)
