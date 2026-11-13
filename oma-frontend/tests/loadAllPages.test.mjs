import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// A list that fills a search box or a dropdown (the organizations of a registration form) must hold EVERY record, not just the first page of the server.
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const { loadAllPages } = await import(new URL('../src/utils/loadAllPages.js', import.meta.url).href)

// a server with 23 records that answers 10 at a time unless a bigger page is asked for (at most 200)
const server = (total) => {
  const calls = []
  const get = async (url, { params }) => {
    calls.push({ url, params })
    const size = Math.min(params.page_size || 10, 200)
    const page = params.page || 1
    const start = (page - 1) * size
    const results = Array.from({ length: Math.max(0, Math.min(size, total - start)) }, (_, i) => ({ id: start + i + 1 }))
    return { data: { count: total, next: start + size < total ? `page=${page + 1}` : null, results } }
  }
  return { get, calls }
}

const small = server(23)
eq((await loadAllPages(small.get, '/organizations/farmers/')).length, 23, 'every record of a short list')
eq(small.calls.length, 1, 'one request is enough when the page is big')
eq(small.calls[0].params.page_size, 200, 'it asks for the biggest page')
eq(small.calls[0].url, '/organizations/farmers/', 'the url it was given')

const big = server(450)
const all = await loadAllPages(big.get, '/organizations/fisherfolk/', { fisherfolk: 7 })
eq(all.length, 450, 'every page of a long list')
eq(new Set(all.map((r) => r.id)).size, 450, 'no record twice')
eq(big.calls.map((c) => c.params.page), [1, 2, 3], 'it follows the pages one after another')
eq(big.calls.every((c) => c.params.fisherfolk === 7), true, 'the filters are sent on every page')

eq(await loadAllPages(async () => ({ data: [{ id: 1 }, { id: 2 }] }), '/x/'), [{ id: 1 }, { id: 2 }], 'a list that is not paged is returned as it is')
eq(await loadAllPages(async () => ({ data: { results: [] , next: null } }), '/x/'), [], 'an empty list')
const endless = async () => ({ data: { results: [{ id: 1 }], next: 'more' } })
eq((await loadAllPages(endless, '/x/', {}, { maxPages: 3 })).length, 3, 'it never loops for ever')

// the forms that choose an organization load all of them
for (const file of ['src/pages/Farmers/AddFarmerModal.jsx', 'src/pages/Fisherfolk/AddFisherfolkModal.jsx', 'src/pages/Reports/ReportsPage.jsx']) {
  const source = read('../' + file)
  ok(source.includes('loadAllPages('), `${file} loads every organization`)
  ok(!/api\.get\('\/organizations\/(farmers|fisherfolk)\/'\)/.test(source), `${file} no longer asks for the first page only`)
}

console.log(`loadAllPages: ${n} checks passed`)
