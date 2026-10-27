import assert from 'node:assert/strict'

const { draftKey, encodeDraft, saveDraft, loadDraft, clearDraft, clearAllDrafts, isDirty, listDrafts } = await import(new URL('../src/utils/drafts.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// a stand-in for localStorage
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
const broken = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') }, removeItem() { throw new Error('blocked') }, key() { throw new Error('blocked') }, length: 1 }

// ── whose draft it is
eq(draftKey(7, 'add-parcels'), 'omag.draft.7.add-parcels', 'a draft is kept per person')
eq(draftKey(undefined, 'x'), 'omag.draft.anon.x', 'no one signed in')
eq(draftKey(7, 'a') === draftKey(8, 'a'), false, 'two people never share a draft')

// ── what is stored
const sample = { name: 'Ana', rows: [{ id: 1, file: new File(['x'], 'p.jpg'), n: 2 }], when: new Date('2026-10-27T00:00:00Z'), nothing: undefined }
eq(JSON.parse(encodeDraft(sample)), { name: 'Ana', rows: [{ id: 1, file: null, n: 2 }], when: '2026-10-27T00:00:00.000Z' }, 'a chosen file cannot be kept, the rest can')

// ── saving, loading, clearing
const store = fakeStorage()
const key = draftKey(7, 'form')
eq(loadDraft(store, key), null, 'nothing saved yet')
saveDraft(store, key, { a: 1, list: [1, 2] })
eq(loadDraft(store, key), { a: 1, list: [1, 2] }, 'what was saved comes back')
saveDraft(store, key, { a: 2 })
eq(loadDraft(store, key), { a: 2 }, 'saving again replaces it')
clearDraft(store, key)
eq(loadDraft(store, key), null, 'cleared')
store.setItem(key, '{not json')
eq(loadDraft(store, key), null, 'a damaged draft is ignored')

// ── a draft only counts when it differs from the blank form
eq(isDirty({ a: 1, b: [] }, { a: 1, b: [] }), false, 'the same as blank')
eq(isDirty({ a: 2, b: [] }, { a: 1, b: [] }), true, 'changed')
eq(isDirty({ a: 1, b: [{ x: 1 }] }, { a: 1, b: [] }), true, 'a row added')
eq(isDirty({ f: new File(['x'], 'a.jpg') }, { f: null }), false, 'a file alone is not kept, so it is not a draft')

// ── listing and wiping a person's drafts (on logout)
const many = fakeStorage()
saveDraft(many, draftKey(7, 'a'), { v: 1 })
saveDraft(many, draftKey(7, 'b'), { v: 2 })
saveDraft(many, draftKey(8, 'a'), { v: 3 })
many.setItem('accessToken', 'keep me')
eq(listDrafts(many, 7).sort(), ['a', 'b'], 'a person\'s drafts')
clearAllDrafts(many, 7)
eq([listDrafts(many, 7), listDrafts(many, 8)], [[], ['a']], 'only that person\'s drafts are wiped')
eq(many.getItem('accessToken'), 'keep me', 'nothing else is touched')
clearAllDrafts(many)
eq(listDrafts(many, 8), [], 'with no one named, every draft goes')
eq(many.getItem('accessToken'), 'keep me', 'still nothing else touched')

// ── storage that is blocked never breaks a form
eq(loadDraft(broken, key), null, 'reading blocked storage')
saveDraft(broken, key, { a: 1 })
clearDraft(broken, key)
clearAllDrafts(broken, 7)
eq(listDrafts(broken, 7), [], 'listing blocked storage')
n += 0

console.log(`ok - ${n} assertions`)
