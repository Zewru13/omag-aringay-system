import assert from 'node:assert/strict'

const { DraftScope } = await import(new URL('../src/utils/draftScope.js', import.meta.url).href)
const { draftKey, loadDraft, saveDraft } = await import(new URL('../src/utils/drafts.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const fakeStorage = () => {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size },
  }
}
// a clock we can wind by hand
const fakeClock = () => {
  let next = 1
  const waiting = new Map()
  return {
    setTimer: (fn) => { const id = next++; waiting.set(id, fn); return id },
    clearTimer: (id) => { waiting.delete(id) },
    run: () => { const fns = [...waiting.values()]; waiting.clear(); fns.forEach((fn) => fn()) },
    get pending() { return waiting.size },
  }
}
const make = (storage, clock, extra = {}) => new DraftScope({ storage, key: draftKey(7, 'form'), setTimer: clock.setTimer, clearTimer: clock.clearTimer, ...extra })
const KEY = draftKey(7, 'form')

// ── nothing saved: fields start from their own starting values and nothing is written for an untouched form
{
  const store = fakeStorage(); const clock = fakeClock(); const scope = make(store, clock)
  eq(scope.restored, false, 'no draft yet')
  eq(scope.restore('name', 'x'), 'x', 'a field starts as it is told to')
  scope.register('name', 'x', 'x', () => {})
  scope.schedule(); clock.run()
  eq(loadDraft(store, KEY), null, 'an untouched form leaves nothing behind')
}

// ── typing is kept a moment later, all the fields together
{
  const store = fakeStorage(); const clock = fakeClock(); const scope = make(store, clock)
  scope.register('name', '', '', () => {}); scope.register('rows', [], [], () => {})
  scope.register('name', 'Ana', '', () => {}); scope.schedule()
  eq(loadDraft(store, KEY), null, 'not written until the pause')
  clock.run()
  eq(loadDraft(store, KEY), { name: 'Ana', rows: [] }, 'written after the pause, every field together')
  scope.register('name', '', '', () => {}); scope.schedule(); clock.run()
  eq(loadDraft(store, KEY), null, 'typed back to blank: the draft is dropped')
}

// ── keystrokes within the pause are one write
{
  const store = fakeStorage(); const clock = fakeClock(); const scope = make(store, clock)
  scope.register('a', 'x', '', () => {}); scope.schedule(); scope.schedule(); scope.schedule()
  eq(clock.pending, 1, 'one pending write however many keystrokes')
}

// ── a saved draft comes back, and says so
{
  const store = fakeStorage(); saveDraft(store, KEY, { name: 'Ana', rows: [1], gone: 'x' })
  const scope = make(store, fakeClock())
  eq(scope.restored, true, 'a draft was found')
  eq(scope.restore('name', ''), 'Ana', 'text comes back')
  eq(scope.restore('rows', []), [1], 'a list comes back')
  eq(scope.restore('other', 'start'), 'start', 'a field that was not in the draft keeps its start')
  eq(scope.restore('rows', 'text'), 'text', 'a draft of the wrong kind is ignored')
}

// ── a damaged or foreign draft is ignored
{
  const store = fakeStorage(); store.setItem(KEY, '{broken')
  eq(make(store, fakeClock()).restored, false, 'damaged draft')
  saveDraft(store, KEY, [1, 2])
  eq(make(store, fakeClock()).restored, false, 'a draft that is not an object of fields')
}

// ── saved: clear() wipes it and nothing is written again until the person types
{
  const store = fakeStorage(); const clock = fakeClock(); const scope = make(store, clock)
  scope.register('name', 'Ana', '', () => {}); scope.schedule(); clock.run()
  eq(loadDraft(store, KEY) !== null, true, 'a draft exists')
  scope.clear()
  eq(loadDraft(store, KEY), null, 'saved: the draft is gone')
  scope.persist()
  eq(loadDraft(store, KEY), null, 'closing the window after saving writes nothing')
  scope.resume(); scope.register('name', 'Bo', '', () => {}); scope.schedule(); clock.run()
  eq(loadDraft(store, KEY), { name: 'Bo' }, 'typing again starts a new draft')
}

// ── a window closed before the pause is over still keeps what was typed
{
  const store = fakeStorage(); const clock = fakeClock(); const scope = make(store, clock)
  scope.register('name', 'Ana', '', () => {}); scope.schedule()
  scope.leave()
  eq(loadDraft(store, KEY), { name: 'Ana' }, 'kept on leaving')
  eq(clock.pending, 0, 'the pending write was cancelled')
}

// ── discard: every field goes back to its start and the draft is wiped
{
  const store = fakeStorage(); const clock = fakeClock(); const scope = make(store, clock)
  const log = []
  scope.register('name', 'Ana', '', () => log.push('name')); scope.register('rows', [1], [], () => log.push('rows'))
  scope.schedule(); clock.run()
  scope.discard()
  eq(log.sort(), ['name', 'rows'], 'both fields reset')
  eq(loadDraft(store, KEY), null, 'draft wiped')
  scope.persist()
  eq(loadDraft(store, KEY), null, 'nothing written after discarding')
}

// ── switched off, or storage blocked: the form just works
{
  const store = fakeStorage(); saveDraft(store, KEY, { name: 'Ana' })
  const off = make(store, fakeClock(), { enabled: false })
  eq([off.restored, off.restore('name', '')], [false, ''], 'a disabled draft restores nothing')
  off.register('name', 'Bo', '', () => {}); off.persist()
  eq(loadDraft(store, KEY), { name: 'Ana' }, 'and writes nothing')
  const blocked = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') }, removeItem() { throw new Error('blocked') }, key() { throw new Error('blocked') }, length: 0 }
  const scope = new DraftScope({ storage: blocked, key: KEY, setTimer: fakeClock().setTimer, clearTimer: () => {} })
  scope.register('a', 'x', '', () => {}); scope.persist(); scope.clear()
  eq(scope.restored, false, 'blocked storage')
}

// ── a browser's own setTimeout / clearTimeout throw "Illegal invocation" when called as a method of something else
{
  const bareOnly = (name) => function bare(...args) { if (this !== undefined) throw new TypeError(`Illegal invocation: ${name} was called on ${this?.constructor?.name}`); return 1 }
  const store = fakeStorage()
  const scope = new DraftScope({ storage: store, key: KEY, setTimer: bareOnly('setTimeout'), clearTimer: bareOnly('clearTimeout') })
  scope.register('a', 'x', '', () => {})
  scope.schedule(); scope.schedule(); scope.clear(); scope.leave()
  eq(true, true, 'timers are called as plain functions, never as methods of the scope')
}

console.log(`ok - ${n} assertions`)
