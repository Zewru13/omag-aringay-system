import assert from 'node:assert/strict'

const { newestFirst } = await import(new URL('../src/utils/listOrder.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// last in, first out: the highest id (the row added last) comes first
eq(newestFirst([{ id: 2 }, { id: 9 }, { id: 5 }]).map((r) => r.id), [9, 5, 2], 'newest first')
eq(newestFirst([{ id: '3' }, { id: '12' }]).map((r) => r.id), ['12', '3'], 'ids sent as text still compare as numbers')
eq(newestFirst([]), [], 'empty')

// the list it is given is never reordered in place
const original = [{ id: 1 }, { id: 2 }]
newestFirst(original)
eq(original.map((r) => r.id), [1, 2], 'the source list is left as it was')

// a row with no id counts as the oldest
eq(newestFirst([{ name: 'a' }, { id: 4 }]).map((r) => r.id ?? 'none'), [4, 'none'], 'no id goes last')

console.log(`listOrder: ${n} checks passed`)
