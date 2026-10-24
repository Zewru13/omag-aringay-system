import assert from 'node:assert/strict'

const { isPdfHead } = await import(new URL('../src/utils/printPdf.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// the Print button prints only a real PDF: an error page or JSON body is never sent to the printer
eq(isPdfHead('%PDF-'), true, 'a PDF starts with %PDF')
eq(isPdfHead('%PDF-1.4 rest'), true, 'with more after it')
eq(isPdfHead('<html'), false, 'a web page')
eq(isPdfHead('{"detail"'), false, 'an API error')
eq(isPdfHead(''), false, 'nothing')
eq(isPdfHead(null), false, 'null')

console.log(`printPdf: ${n} checks passed`)
