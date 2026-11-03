import assert from 'node:assert/strict'

const { filterOptions, labelOf, nextActive } = await import(new URL('../src/utils/searchSelect.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const names = (options) => options.map((o) => o.label)

const orgs = [
  { value: 1, label: 'Alaska Farmers Association' },
  { value: 2, label: 'Baracbac Rice Growers' },
  { value: 3, label: 'San Benito Farmers Coop' },
  { value: 4, label: 'Farmers of Aringay' },
  { value: 5, label: 'Aringay Irrigators (AIA)' },
]

// no text typed: every option, in the order given
eq(names(filterOptions(orgs, '')), orgs.map((o) => o.label), 'empty query lists everything')
eq(names(filterOptions(orgs, '   ')), orgs.map((o) => o.label), 'blanks are no query')

// a typed name finds the options that contain it, ignoring case and extra spaces
eq(names(filterOptions(orgs, 'farmers')), ['Farmers of Aringay', 'Alaska Farmers Association', 'San Benito Farmers Coop'], 'contains, the name that starts with it first')
eq(names(filterOptions(orgs, '  RICE  ')), ['Baracbac Rice Growers'], 'case and spaces do not matter')
eq(names(filterOptions(orgs, 'zzz')), [], 'nothing matches')

// the order: starts with the text, then a word that starts with it, then the text anywhere in a word
eq(names(filterOptions(orgs, 'ar'))[0], 'Aringay Irrigators (AIA)', 'the name that starts with it is first')
eq(names(filterOptions(orgs, 'ar'))[1], 'Farmers of Aringay', 'then a name with a word that starts with it')

// several words must all be found, in any order
eq(names(filterOptions(orgs, 'coop san')), ['San Benito Farmers Coop'], 'every word has to match')
eq(names(filterOptions(orgs, 'alaska coop')), [], 'a word that is missing excludes the option')

// brackets and punctuation in the typed text do not break the search
eq(names(filterOptions(orgs, '(aia')), ['Aringay Irrigators (AIA)'], 'punctuation is matched as typed')
eq(names(filterOptions(orgs, '[')), [], 'a lone bracket is just text, not an error')

// the list can be capped
eq(filterOptions(orgs, '', { limit: 2 }).length, 2, 'limit')

// the text shown for the chosen value
eq(labelOf(orgs, 3), 'San Benito Farmers Coop', 'label of a number value')
eq(labelOf(orgs, '3'), 'San Benito Farmers Coop', 'label of a text value')
eq(labelOf(orgs, null), '', 'no value')
eq(labelOf(orgs, 99), '', 'a value that is not in the list')
eq(labelOf([], 1), '', 'no options yet')

// the arrow keys move through the list and wrap
eq(nextActive(-1, 3, 'ArrowDown'), 0, 'down from nothing goes to the first')
eq(nextActive(2, 3, 'ArrowDown'), 0, 'down from the last wraps to the first')
eq(nextActive(0, 3, 'ArrowUp'), 2, 'up from the first wraps to the last')
eq(nextActive(-1, 3, 'ArrowUp'), 2, 'up from nothing goes to the last')
eq(nextActive(1, 3, 'Home'), 0, 'Home')
eq(nextActive(1, 3, 'End'), 2, 'End')
eq(nextActive(0, 0, 'ArrowDown'), -1, 'an empty list has nothing to move to')

console.log(`searchSelect: ${n} checks passed`)
