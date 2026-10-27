import assert from 'node:assert/strict'

const { distributionRowLabel, agenciesText } = await import(new URL('../src/pages/AssistanceManagement/distributionsTableRows.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

eq(distributionRowLabel({ organization_name: 'Alaska Farmers', member_count: 12 }, 'farmers'), 'Alaska Farmers', 'a distribution is named after its organization')
eq(distributionRowLabel({ organization_name: null, member_count: 5 }, 'farmers'), 'Individual farmers (5)', 'given to selected farmers')
eq(distributionRowLabel({ organization_name: null, member_count: 1 }, 'farmers'), 'Individual farmer (1)', 'one farmer')
eq(distributionRowLabel({ organization_name: null, member_count: 3 }, 'fisherfolk'), 'Individual fisherfolk (3)', 'fisherfolk have the same word either way')
eq(distributionRowLabel({ organization_name: '', member_count: 2 }), 'Individual people (2)', 'no noun')

eq(agenciesText([]), '—', 'no agency')
eq(agenciesText(undefined), '—', 'none given')
eq(agenciesText(['DA']), 'DA', 'one agency')
eq(agenciesText(['DA', 'LGU', 'BFAR']), 'DA, LGU, BFAR', 'three are all shown')
eq(agenciesText(['DA', 'LGU', 'BFAR', 'PCIC']), 'DA, LGU, BFAR, Others', 'more than three: three and Others')
eq(agenciesText(['A', 'B', 'C', 'D', 'E', 'F']), 'A, B, C, Others', 'however many more')

console.log(`ok - ${n} assertions`)
