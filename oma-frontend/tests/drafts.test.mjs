import assert from 'node:assert/strict'

const { draftKey, encodeDraft, saveDraft, loadDraft, clearDraft, clearAllDrafts, isDirty, listDrafts, restoreField, fieldValues, isFieldDraft, rowForDraft, restoreRow } = await import(new URL('../src/utils/drafts.js', import.meta.url).href)

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

eq(JSON.parse(encodeDraft({ pcic: { insured: true, files: [new File(['x'], 'p.jpg'), new File(['y'], 'q.jpg')], photos: [] } })), { pcic: { insured: true, files: [], photos: [] } }, 'chosen photos in a list are left out, not stored as empty entries')
eq(isDirty({ pcic: { files: [new File(['x'], 'p.jpg')] } }, { pcic: { files: [] } }), false, 'a chosen photo alone is not a draft')

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

// ── a form made of several separate fields (hooks/useDraftForm.js): each one is restored on its own, and only when it still fits
eq(restoreField({ name: 'Ana' }, 'name', ''), 'Ana', 'a saved field comes back')
eq(restoreField({ name: 'Ana' }, 'age', '7'), '7', 'a field that was never saved keeps its starting value')
eq(restoreField(null, 'name', 'x'), 'x', 'no draft at all')
eq(restoreField({ rows: 'oops' }, 'rows', []), [], 'a saved value of another kind (text where a list is expected) is ignored')
eq(restoreField({ rows: [1, 2] }, 'rows', []), [1, 2], 'a saved list comes back')
eq(restoreField({ n: 0 }, 'n', 5), 0, 'a saved zero is not mistaken for nothing')
eq(restoreField({ who: { id: 3 } }, 'who', null), { id: 3 }, 'a field that starts empty (null) accepts what was saved')
eq(restoreField({ who: null }, 'who', { id: 1 }), { id: 1 }, 'a saved null (a chosen file that could not be kept) falls back to the starting value')
eq(restoreField({ flag: true }, 'flag', false), true, 'a saved yes/no comes back')
eq(restoreField([1, 2], 'x', 'a'), 'a', 'a draft that is not an object of fields is ignored')

const registry = new Map([['a', { value: 'x', initial: '' }], ['b', { value: [], initial: [] }]])
eq(fieldValues(registry), { a: 'x', b: [] }, 'the current values of all the fields')
eq(isFieldDraft(registry), true, 'one field changed, so there is a draft')
eq(isFieldDraft(new Map([['a', { value: '', initial: '' }], ['b', { value: [], initial: [] }]])), false, 'nothing changed, no draft')
eq(isFieldDraft(new Map([['f', { value: new File(['x'], 'a.jpg'), initial: null }]])), false, 'only a chosen file: it cannot be kept, so no draft')
eq(isFieldDraft(new Map()), false, 'no fields at all')

// ── the new row of a settings table (components/UI/InlineAddRow.jsx): kept only once something is typed in it
const blankRow = { name: '', category: '' }
eq(rowForDraft(null, blankRow), null, 'no new row, nothing to keep')
eq(rowForDraft({ name: '', category: '' }, blankRow), null, 'a new row left empty is not a draft')
eq(rowForDraft({ name: 'Rice', category: '' }, blankRow), { name: 'Rice', category: '' }, 'a row with something typed is')
eq(restoreRow({ row: { name: 'Rice' } }, blankRow), { name: 'Rice', category: '' }, 'a saved row comes back with every box it needs')
eq(restoreRow({ row: { name: 'Rice', gone: 'x' } }, blankRow), { name: 'Rice', category: '', gone: 'x' }, 'unknown boxes are carried along harmlessly')
eq(restoreRow(null, blankRow), null, 'nothing saved: no new row')
eq(restoreRow({ row: 'text' }, blankRow), null, 'a saved row of the wrong kind is ignored')
eq(restoreRow({ row: [1] }, blankRow), null, 'a list is not a row')

// ── storage that is blocked never breaks a form
eq(loadDraft(broken, key), null, 'reading blocked storage')
saveDraft(broken, key, { a: 1 })
clearDraft(broken, key)
clearAllDrafts(broken, 7)
eq(listDrafts(broken, 7), [], 'listing blocked storage')
n += 0

console.log(`ok - ${n} assertions`)
