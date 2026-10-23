import assert from 'node:assert/strict'

const { agencyChipSummary } = await import(new URL('../src/pages/AssistanceManagement/assistanceFieldHelpers.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

eq(agencyChipSummary([]), { shown: [], more: 0 }, 'nothing chosen')
eq(agencyChipSummary(undefined), { shown: [], more: 0 }, 'no list yet')
eq(agencyChipSummary(['DA', 'LGU']), { shown: ['DA', 'LGU'], more: 0 }, 'two are all shown')
eq(agencyChipSummary(['DA', 'LGU', 'PCIC']), { shown: ['DA', 'LGU', 'PCIC'], more: 0 }, 'three are all shown')
eq(agencyChipSummary(['DA', 'LGU', 'PCIC', 'NIA']), { shown: ['DA', 'LGU', 'PCIC'], more: 1 }, 'a fourth becomes "1 more"')
eq(agencyChipSummary(['a', 'b', 'c', 'd', 'e', 'f']), { shown: ['a', 'b', 'c'], more: 3 }, 'six: three shown, three more')
eq(agencyChipSummary(['a', 'b', 'c', 'd'], 2), { shown: ['a', 'b'], more: 2 }, 'a different limit')

console.log(`agencyChips: ${n} checks passed`)
