import assert from 'node:assert/strict'

const { evaluatePassword, passwordMeetsRules } = await import(new URL('../src/utils/passwordRules.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const all = (p) => evaluatePassword(p)
eq(passwordMeetsRules('Maganda#2024x'), true, 'meets all')
eq(all('Maganda#2024x'), { length: true, capital: true, special: true, digits: true, notWeak: true }, 'flags all true')
eq(all('maganda#2024x').capital, false, 'no capital')
eq(all('Maganda2024xy').special, false, 'no special')
eq(all('Maganda#20xx').digits, false, 'two digits')
eq(all('Maganda#202x').digits, true, 'three digits')
eq(all('Ab#12').length, false, 'too short')
eq(all('Ab#1234').length, false, '7 is too short')
eq(all('Ab#12345').length, true, '8 is enough')
eq(passwordMeetsRules('Ñandu€123'), true, 'non-ascii capital and special')
eq(passwordMeetsRules('Maganda😀2024'), true, 'emoji special')
eq(all('Éclair2024x').special, false, 'accented letter is not special')
eq(all('Maganda 2024').special, false, 'space is not special')
eq(all('Aringay#2024x').notWeak, false, 'local denylist')
eq(passwordMeetsRules('Aringay#2024x'), false, 'denylisted fails overall')
eq(passwordMeetsRules('maganda'), false, 'fails overall')
eq(all(''), { length: null, capital: null, special: null, digits: null, notWeak: null }, 'empty is all null')
eq(passwordMeetsRules(''), false, 'empty fails overall')
eq(passwordMeetsRules(undefined), false, 'undefined fails overall')
console.log(`ALL ${n} CHECKS PASSED`)
