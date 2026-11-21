import assert from 'node:assert/strict'

const { MAIN_DEVELOPER, CO_DEVELOPER, SCHOOL } = await import(new URL('../src/constants/appInfo.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// The Help page names a main developer (with contact details) and a co-developer.
eq(MAIN_DEVELOPER, { name: 'John Michael E. Marzan', email: 'marzanmr70@gmail.com', phone: '09455979837' }, 'the main developer and how to reach them')
eq(CO_DEVELOPER, { name: 'Carl Jhoaquin B. Inong' }, 'the co-developer')
eq(SCHOOL, 'Saint Louis College', 'the school')

console.log(`appInfo: ${n} checks passed`)
