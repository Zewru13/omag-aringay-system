import assert from 'node:assert/strict'

const { formatIdNumber, isValidIdNumber, isLegacyIdNumber, digitCount, RSBSA_GROUPS, FISHR_GROUPS } =
  await import(new URL('../src/utils/idNumbers.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// the dashes go in as the digits are typed
eq(formatIdNumber('0', RSBSA_GROUPS), '0', 'first digit')
eq(formatIdNumber('013', RSBSA_GROUPS), '01-3', 'dash after the 2nd digit')
eq(formatIdNumber('013302014058212', RSBSA_GROUPS), '01-33-02-014-058212', 'a full 15-digit RSBSA')
eq(formatIdNumber('01-33-02-014-058212', RSBSA_GROUPS), '01-33-02-014-058212', 'already formatted stays the same')
eq(formatIdNumber('0133020140582123456', RSBSA_GROUPS), '01-33-02-014-0582123456', 'longer numbers keep one last group')
eq(formatIdNumber('013302014058212', FISHR_GROUPS), '01-33-02-0140-58212', 'FishR groups are 2-2-2-4 then the rest')
eq(formatIdNumber('2026', FISHR_GROUPS), '20-26', 'short FishR')

// 20 digits at most; anything that is not a digit is dropped
eq(digitCount(formatIdNumber('123456789012345678901234', RSBSA_GROUPS)), 20, 'cut to 20 digits')
eq(formatIdNumber('12ab34', RSBSA_GROUPS), '12-34', 'letters are ignored')
eq(formatIdNumber('', RSBSA_GROUPS), '', 'empty stays empty')
eq(formatIdNumber(null, RSBSA_GROUPS), '', 'null is empty')

// what the form accepts as valid (the backend decides; this only warns early)
eq(isValidIdNumber(''), true, 'blank is left to the required rule')
eq(isValidIdNumber('01-33-02-014-058212'), true, 'typed number')
eq(isValidIdNumber('12345678901234567890'), true, '20 digits')
eq(isValidIdNumber('123456789012345678901'), false, '21 digits')
eq(isValidIdNumber('12--34'), false, 'double dash')
eq(isValidIdNumber('-1234'), false, 'leading dash')
eq(isValidIdNumber('BF-01-033-02-023-00000033'), true, 'older BF- number still fine')
eq(isValidIdNumber('01-033-02-011-XIIRZA'), true, 'older lettered number still fine')
eq(isLegacyIdNumber('01-033-02-011-XIIRZA'), true, 'letters mark a legacy number')
eq(isLegacyIdNumber('01-33-02-014-058212'), false, 'digits are not legacy')

console.log(`idNumbers: ${n} checks passed`)
