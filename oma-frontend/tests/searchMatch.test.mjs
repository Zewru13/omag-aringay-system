import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Search bars that filter a list already on the screen: every word typed must be found, in any order, ignoring case, extra spaces and commas.
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const { searchWords, matchesSearch } = await import(new URL('../src/utils/searchMatch.js', import.meta.url).href)

eq(searchWords('  Cruz,  Juan ,dela '), ['cruz', 'juan', 'dela'], 'words split on spaces and commas, lower case')
eq(searchWords(''), [], 'nothing typed')
eq(searchWords(null), [], 'null')
eq(searchWords(undefined), [], 'undefined')

const row = 'Santa Cecilia Progressive Farmers Alaska'
eq(matchesSearch(row, ''), true, 'a blank search matches everything')
eq(matchesSearch(row, '   '), true, 'spaces only match everything')
eq(matchesSearch(row, 'cecilia'), true, 'one word')
eq(matchesSearch(row, 'FARMERS CECILIA'), true, 'words in another order, other case')
eq(matchesSearch(row, 'Santa  Farmers'), true, 'extra spaces and words that are not next to each other')
eq(matchesSearch(row, 'Farmers, Santa'), true, 'commas')
eq(matchesSearch(row, 'Santa Zzzz'), false, 'every word must be found')
eq(matchesSearch(row, 'zzzz'), false, 'a word that is not there')
eq(matchesSearch(null, 'a'), false, 'no text, a word typed')
eq(matchesSearch(undefined, ''), true, 'no text, nothing typed')
eq(matchesSearch(12, '12'), true, 'numbers are read as text')

// the screens that filter a list on the page use it (no second way of searching)
const users = {
  'src/pages/CropOption/CropOptionPage.jsx': 'crop settings list',
  'src/pages/FisheriesSettings/SpeciesOptionPage.jsx': 'species settings list',
  'src/pages/Monitoring/FisherfolkStockDisasterModal.jsx': 'stock picker',
  'src/pages/Monitoring/multiCropDisaster.js': 'multi crop disaster',
  'src/pages/Organizations/LendEquipmentForm.jsx': 'lend equipment member search',
  'src/pages/Organizations/ReturnedTable.jsx': 'returned table',
  'src/pages/Monitoring/disasterPonds.js': 'disaster ponds table',
  'src/pages/Monitoring/disasterTargets.js': 'disaster parcels table',
  'src/pages/AssistanceManagement/distributionDomains.js': 'distribution member paging',
  'src/utils/orgListFilter.js': 'organization lists',
}
for (const [file, what] of Object.entries(users)) {
  const source = read('../' + file)
  ok(/searchMatch\.js|searchWords|matchesSearch/.test(source), `${what} searches word by word (${file})`)
  ok(!/\.toLowerCase\(\)\.includes\((q|query|kind\.search\.trim\(\)\.toLowerCase\(\)|query\.trim\(\)\.toLowerCase\(\))\)/.test(source), `${what} no longer matches the whole typed text as one string`)
}

console.log(`searchMatch: ${n} checks passed`)
