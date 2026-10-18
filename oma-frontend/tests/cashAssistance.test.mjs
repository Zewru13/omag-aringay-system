import assert from 'node:assert/strict'

const { isCashType, formatAssistanceQuantity, cashAmountFrom, cashAmountError } =
  await import(new URL('../src/pages/AssistanceManagement/assistanceFieldHelpers.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

eq(isCashType('Cash Assistance'), true, 'cash type')
eq(isCashType('Fertilizer'), false, 'other type')
eq(isCashType(''), false, 'no type')

// cash shows as pesos; everything else shows as it was typed
eq(formatAssistanceQuantity('Cash Assistance', '1500'), '₱1,500.00', 'plain number')
eq(formatAssistanceQuantity('Cash Assistance', 2500.5), '₱2,500.50', 'numeric value')
eq(formatAssistanceQuantity('Cash Assistance', '1500.00'), '₱1,500.00', 'two decimals')
eq(formatAssistanceQuantity('Cash Assistance', '₱500 per head'), '₱500 per head', 'text from an older record is left alone')
eq(formatAssistanceQuantity('Cash Assistance', ''), '', 'blank stays blank')
eq(formatAssistanceQuantity('Cash Assistance', null), '', 'null stays blank')
eq(formatAssistanceQuantity('Fertilizer', '2 bags'), '2 bags', 'non-cash is untouched')
eq(formatAssistanceQuantity('Fertilizer', '1500'), '1500', 'a number for another type is untouched')

// pulling the amount out of what an older cash record stored, for the edit form
eq(cashAmountFrom('1500'), '1500', 'plain')
eq(cashAmountFrom('₱1,500.50'), '1500.50', 'peso sign and comma')
eq(cashAmountFrom('₱500 per head'), '500', 'text around the number')
eq(cashAmountFrom(''), '', 'blank')
eq(cashAmountFrom('two bags'), '', 'no number')

// validation: cash needs an amount above zero
eq(cashAmountError('Cash Assistance', ''), 'Enter the amount of cash given.', 'blank amount')
eq(cashAmountError('Cash Assistance', '0'), 'Enter the amount of cash given.', 'zero amount')
eq(cashAmountError('Cash Assistance', '-5'), 'Enter the amount of cash given.', 'negative amount')
eq(cashAmountError('Cash Assistance', 'abc'), 'Enter the amount of cash given.', 'not a number')
eq(cashAmountError('Cash Assistance', '1500'), '', 'valid amount')
eq(cashAmountError('Seeds', ''), '', 'not cash: no cash rule')

console.log(`cashAssistance: ${n} checks passed`)
