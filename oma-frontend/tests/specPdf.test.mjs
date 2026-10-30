import assert from 'node:assert/strict'

const { specPdfBody, specPdfFilename } = await import(new URL('../src/utils/specPdf.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// what Print shows is what Download sends: the same document, as plain JSON (a Set of bold rows would be lost, and photos stay out)
const spec = {
  title: 'CROP MONITORING REPORT', reference: 'LR-20261030-0915', pageSize: 'letter', landscape: true, footerLabel: 'crop record',
  header: [['Date printed', 'October 30, 2026']],
  sections: [
    { title: 'Details', rows: [['Parcel', 'P-7']] },
    { title: 'Records', table: { head: ['No.', 'Farmer'], rows: [['1', 'Maria']], boldRows: new Set([0]) } },
  ],
  photos: ['http://x/y.jpg'], signatures: ['Prepared by', 'Noted by'],
}
const body = specPdfBody(spec)
eq(body.title, 'CROP MONITORING REPORT', 'title')
eq(body.reference, 'LR-20261030-0915', 'reference')
eq(body.landscape, true, 'landscape')
eq(body.header, [['Date printed', 'October 30, 2026']], 'header')
eq(body.signatures, ['Prepared by', 'Noted by'], 'signature lines')
eq(body.sections[0], { title: 'Details', rows: [['Parcel', 'P-7']] }, 'a details section')
eq(body.sections[1], { title: 'Records', table: { head: ['No.', 'Farmer'], rows: [['1', 'Maria']], bold_rows: [0] } }, 'a table section: bold rows become a list')
eq('photos' in body, false, 'photos are not sent')
eq(JSON.parse(JSON.stringify(body)).sections[1].table.bold_rows, [0], 'it survives JSON')
eq(specPdfBody({ title: 'T', sections: [{ title: 'S', table: { head: ['a'], rows: [] } }] }).sections[0].table.bold_rows, [], 'no bold rows')

// the file name the browser saves under when the server sends none
eq(specPdfFilename(spec), 'CROP_MONITORING_REPORT_LR-20261030-0915.pdf', 'file name')
eq(specPdfFilename({ title: 'Parcel report: 01-33/02', reference: '' }), 'Parcel_report_01-33_02.pdf', 'unsafe characters dropped, no reference')

console.log(`specPdf: ${n} checks passed`)
