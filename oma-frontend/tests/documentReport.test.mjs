import assert from 'node:assert/strict'

const { reportQuery, withSignature, reportFileName } = await import(new URL('../src/utils/documentReport.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// reportQuery: blank filters are left out, everything is escaped, the format is always present
eq(reportQuery({ kind: 'farmers', barangay: '', status: 'active', search: ' ' }, 'json'), 'format=json&kind=farmers&status=active', 'blank and whitespace-only values are dropped')
eq(reportQuery({ kind: 'farmers', search: 'de la Cruz & Sons' }, 'pdf'), 'format=pdf&kind=farmers&search=de+la+Cruz+%26+Sons', 'values are escaped and trimmed')
eq(reportQuery({ id: 0, kind: 'farmers' }, 'excel'), 'format=excel&id=0&kind=farmers', 'a zero is a real value')
eq(reportQuery({ kind: null, barangay: undefined }, 'json'), 'format=json', 'null and undefined are dropped')

// withSignature: the picked signers (the output of signatureParams) are appended to the query
eq(withSignature('format=pdf', { prepared_by: 'Ana Reyes', prepared_role: 'Records Officer', noted_by: 'Mr. Cruz', approved_by: 'Mayor Dee' }),
  'format=pdf&prepared_by=Ana+Reyes&prepared_role=Records+Officer&noted_by=Mr.+Cruz&approved_by=Mayor+Dee', 'signer fields are appended')
eq(withSignature('format=pdf', {}), 'format=pdf', 'no signers means nothing appended')
eq(withSignature('format=excel', undefined), 'format=excel', 'no signer data is fine')
eq(withSignature('format=pdf', { prepared_by: '', noted_by: 'Mr. Cruz' }), 'format=pdf&noted_by=Mr.+Cruz', 'a blank value is left out')

// reportFileName: stem + extension for the fallback download name
eq(reportFileName('registered_farmers', 'pdf'), 'registered_farmers.pdf', 'pdf name')
eq(reportFileName('registered_farmers', 'excel'), 'registered_farmers.xlsx', 'excel name')

console.log(`documentReport: ${n} checks passed`)
