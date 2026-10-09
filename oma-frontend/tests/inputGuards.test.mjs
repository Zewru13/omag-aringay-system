import assert from 'node:assert/strict'

const mod = await import(new URL('../src/utils/inputGuards.js', import.meta.url).href)
const { tidyPhone, localToday, guardPhone, guardEmail, guardDecimal, guardPhilsys, isPhoneComplete, isPhilsysComplete } = mod

let n = 0
const eq = (actual, expected, label) => { assert.equal(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// phone
eq(guardPhone('0917-123-4567'), '09171234567', 'dashed paste')
eq(guardPhone('+63 917 123 4567'), '09171234567', '+63 paste')
eq(guardPhone('639171234567'), '09171234567', '63 paste')
eq(guardPhone('9171234567'), '09171234567', 'missing leading 0')
eq(guardPhone('abc'), '', 'letters')
eq(guardPhone('0917123456789012'), '09171234567', 'capped at 11')
eq(guardPhone('08'), '0', 'second digit must be 9')
eq(guardPhone('1'), '', 'first digit must be 0 (or 9 when pasted whole)')
eq(guardPhone('0'), '0', 'first digit 0')
eq(guardPhone('09'), '09', 'prefix kept')
eq(guardPhone(''), '', 'empty')
eq(guardPhone(null), '', 'null')
eq(isPhoneComplete('09171234567'), true, 'complete phone')
eq(isPhoneComplete('0917123456'), false, 'short phone')

// email
eq(guardEmail(' a b@c.com '), 'ab@c.com', 'spaces removed')
eq(guardEmail('x'.repeat(300)).length, 254, 'email cap')
eq(guardEmail(undefined), '', 'undefined')

// decimal
eq(guardDecimal('12.3456', { decimals: 2 }), '12.34', 'trims decimals')
eq(guardDecimal('1,5', { decimals: 2 }), '1.5', 'comma is a dot')
eq(guardDecimal('-3', { decimals: 2 }), '3', 'negative dropped')
eq(guardDecimal('7.5', { decimals: 2, max: 5 }), '5', 'clamped to max')
eq(guardDecimal('1.2.3', { decimals: 2 }), '1.2', 'second dot ignored')
eq(guardDecimal('a1b', { decimals: 2 }), '1', 'letters dropped')
eq(guardDecimal('', { decimals: 2 }), '', 'empty')
eq(guardDecimal('.', { decimals: 2 }), '.', 'lone dot kept while typing')
eq(guardDecimal('0.5', { decimals: 4, max: 2 }), '0.5', 'within max untouched')
// a pasted thousands separator must not shrink the number
eq(guardDecimal('1,500', { decimals: 2 }), '1500', 'thousands comma dropped')
eq(guardDecimal('1,500.00', { decimals: 2 }), '1500.00', 'thousands comma with decimals')
eq(guardDecimal('1,500,000', { decimals: 2 }), '1500000', 'two thousands separators')
eq(guardDecimal('12,50', { decimals: 2 }), '12.50', 'decimal comma still a dot')
eq(guardDecimal('0,500', { decimals: 4 }), '0.500', 'leading zero comma is a decimal comma')
eq(guardDecimal('3', { decimals: 0 }), '3', 'zero decimals')
eq(guardDecimal('3.7', { decimals: 0 }), '3', 'zero decimals drops the fraction')
eq(guardDecimal('-3', { decimals: 2, allowNegative: true }), '-3', 'negative allowed when asked')

// philsys
eq(guardPhilsys('8419503277413096'), '8419-5032-7741-3096', 'full philsys')
eq(guardPhilsys('84195'), '8419-5', 'partial philsys')
eq(guardPhilsys('8419-5032-7741-3096'), '8419-5032-7741-3096', 'already formatted')
eq(guardPhilsys('84a19'), '8419', 'letters dropped')
eq(guardPhilsys('84195032774130961234'), '8419-5032-7741-3096', 'capped at 16 digits')
eq(guardPhilsys(''), '', 'empty philsys')
eq(isPhilsysComplete('8419-5032-7741-3096'), true, 'complete philsys')
eq(isPhilsysComplete('8419-5'), false, 'partial is not complete')

// tidyPhone (lossless)
eq(tidyPhone('0917-123-4567'), '09171234567', 'tidy dashed')
eq(tidyPhone('0917123'), '0917123', 'tidy keeps an incomplete number as stored')
eq(tidyPhone('12345'), '12345', 'tidy never erases')
eq(tidyPhone(null), '', 'tidy null')
eq(tidyPhone('09171234567'), '09171234567', 'tidy plain')

// local date
eq(/^\d{4}-\d{2}-\d{2}$/.test(localToday()), true, 'localToday shape')
eq(localToday(), new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10), 'localToday is the local date')

console.log(`ALL ${n} CHECKS PASSED`)
