import assert from 'node:assert/strict'

const b = await import(new URL('../src/pages/Organizations/memberBatch.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const ana = { id: 1, full_name: 'Ana Reyes', rsbsa_number: '01-01' }
const ben = { id: 2, full_name: 'Ben Cruz', rsbsa_number: '01-02' }

// picking: a click adds the person, a second click takes them off again; several can be picked one search after another
let chosen = b.toggleChosen([], ana)
eq(chosen, [{ person: ana, position: 'Member' }], 'a picked person starts as a plain Member')
chosen = b.toggleChosen(chosen, ben)
eq(chosen.map((c) => c.person.id), [1, 2], 'a second search adds a second person beside the first')
eq(b.isChosen(chosen, 2), true, 'the picked person is marked')
eq(b.toggleChosen(chosen, ana).map((c) => c.person.id), [2], 'clicking a picked person takes them off')
eq(b.setChosenPosition(chosen, 2, 'Secretary').map((c) => c.position), ['Member', 'Secretary'], 'the position changes for that person only')

// the position lists grey out what the other picked people chose
eq(b.positionLines(b.setChosenPosition(chosen, 2, 'Secretary')), [{ _uid: 1, position: 'Member' }, { _uid: 2, position: 'Secretary' }], 'the lines the position rules read')

// the button
eq(b.addButtonLabel(0), 'Add Members', 'nothing picked')
eq(b.addButtonLabel(1), 'Add 1 Member', 'one picked')
eq(b.addButtonLabel(3), 'Add 3 Members', 'three picked')

// adding the pick one by one: the server answers each person on its own
const body = (c) => ({ farmer: c.person.id, position: c.position })
const answer = (data) => { const e = new Error('refused'); e.response = { data }; throw e }

let sent = []
let result = await b.addBatch({ chosen, body, post: async (p) => { sent.push(p) } })
eq(sent, [{ farmer: 1, position: 'Member' }, { farmer: 2, position: 'Member' }], 'every picked person is sent, in order')
eq([result.added.map((c) => c.person.id), result.failed, result.needMain], [[1, 2], [], []], 'both added')

result = await b.addBatch({ chosen, body, post: async (p) => { if (p.farmer === 1) answer({ detail: 'Ana Reyes is already a member.' }) } })
eq(result.added.map((c) => c.person.id), [2], 'the second is added although the first was refused')
eq(result.failed, [{ entry: chosen[0], name: 'Ana Reyes', reason: 'Ana Reyes is already a member.' }], 'the refusal names the person and the reason')

// the main-organization question is staff's: it is asked afterwards, not lost
result = await b.addBatch({ chosen, body, post: async (p) => { if (p.farmer === 2) answer({ main_choice_required: true, other_organizations: [{ organization_name: 'Org X' }] }) } })
eq(result.needMain, [{ entry: chosen[1], otherNames: ['Org X'] }], 'the person who needs a main organization is held for the question')
eq(result.added.map((c) => c.person.id), [1], 'the others are added')
eq(result.failed, [], 'it is not a failure')

// an organization account cannot choose, so for it the same answer is a refusal
result = await b.addBatch({ chosen, body, own: true, post: async (p) => { if (p.farmer === 2) answer({ main_choice_required: true, other_organizations: [] }) } })
eq([result.needMain, result.failed.map((f) => f.name)], [[], ['Ben Cruz']], 'an organization account is told to ask OMAg staff')
assert.match(result.failed[0].reason, /Ask OMAg staff/)

// what is said afterwards
eq(b.batchMessage(2, []), { kind: 'ok', text: '2 members added.' }, 'all added')
eq(b.batchMessage(1, []), { kind: 'ok', text: '1 member added.' }, 'one added')
eq(b.batchMessage(3, [{ name: 'Ana', reason: 'x' }]).kind, 'partial', 'some refused')

console.log(`ok ${n} assertions`)
