import assert from 'node:assert/strict'
import fs from 'node:fs'

const { documentName, documentKind, documentTitle, zoomIn, zoomOut, ZOOM, pcicDocumentsFrom } =
  await import(new URL('../src/utils/pcicDocuments.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// ── the file name shown in the viewer: its own name, else the last part of the link (no signature, decoded) ──
eq(documentName({ name: 'form.png', url: 'https://x/y/z.jpg' }), 'form.png', 'a given name wins')
eq(documentName({ url: 'https://host/storage/v1/s3/bucket/pcic_forms/stockingrecord/My%20Form_ab12.pdf?X-Amz-Signature=abc&X-Amz-Expires=3600' }), 'My Form_ab12.pdf', 'name from a signed link')
eq(documentName({ url: '/media/pcic_forms/cropmonitoringrecord/form.png' }), 'form.png', 'name from a media path')
eq(documentName({ url: '' }), '', 'no link, no name')
eq(documentName({ url: 'blob:http://localhost/1234-5678' }), '', 'a blob preview has no file name')

// ── image, pdf or something the viewer cannot draw ──
eq(documentKind({ url: 'https://h/a/form.JPG?sig=1' }), 'image', 'jpg')
eq(documentKind({ url: 'https://h/a/form.webp' }), 'image', 'webp')
eq(documentKind({ url: 'https://h/a/form.pdf?X-Amz=1' }), 'pdf', 'pdf with a signature')
eq(documentKind({ url: 'https://h/a/form.PDF' }), 'pdf', 'pdf upper case')
eq(documentKind({ url: 'https://h/a/form.docx' }), 'unsupported', 'a word file cannot be previewed')
eq(documentKind({ url: 'https://h/a/form.tiff' }), 'unsupported', 'a tiff cannot be previewed')
eq(documentKind({ url: 'https://h/a/formnoextension' }), 'image', 'no extension: try it as a picture')
eq(documentKind({ url: 'blob:http://localhost/1', type: 'image/png' }), 'image', 'a chosen photo says its type')
eq(documentKind({ url: 'blob:http://localhost/1', type: 'application/pdf' }), 'pdf', 'a chosen pdf says its type')
eq(documentKind({ url: 'https://h/a/form.png', kind: 'pdf' }), 'pdf', 'an explicit kind wins')

// ── title: one page or several ──
eq(documentTitle(1, 1), 'PCIC insurance form', 'one document')
eq(documentTitle(2, 3), 'PCIC insurance form · Page 2 of 3', 'several documents')

// ── zoom keeps to its limits ──
eq([ZOOM.min, ZOOM.max], [1, 4], 'zoom limits')
eq(zoomIn(1), 1.5, 'zoom in one step')
eq(zoomIn(4), 4, 'cannot zoom past the maximum')
eq(zoomOut(1.5), 1, 'zoom out one step')
eq(zoomOut(1), 1, 'cannot zoom out past fit')

// ── a record's documents: its photo rows, else its single photo, none when not insured ──
const resolve = (u) => (u ? `https://api${u}` : null)
eq(pcicDocumentsFrom({ photos: [{ id: 'main', url: '/m/a.png' }, { id: 4, url: '/m/b.png' }] }, resolve),
  [{ id: 'main', url: 'https://api/m/a.png' }, { id: 4, url: 'https://api/m/b.png' }], 'photo rows')
eq(pcicDocumentsFrom({ photos: [], url: '/m/one.png' }, resolve), [{ id: 'main', url: 'https://api/m/one.png' }], 'the single photo')
eq(pcicDocumentsFrom({ photos: null, url: null }, resolve), [], 'no photo at all')
eq(pcicDocumentsFrom({ photos: [{ id: 1, url: '' }] }, resolve), [], 'a row without a link is dropped')

// ── the PCIC documents never open another tab or window (source check of every place that shows them) ──
const root = new URL('../src/', import.meta.url)
for (const file of [
  'components/UI/PcicBadge.jsx', 'components/UI/PcicCell.jsx', 'pages/Monitoring/CropMonitoringPage.jsx', 'pages/CropInformation/CropInformationPage.jsx', 'components/UI/PcicInsuranceField.jsx', 'components/UI/PcicDocumentViewer.jsx', 'components/UI/PcicFormButton.jsx',
  'pages/Monitoring/AquacultureCycleDetailModal.jsx', 'pages/FisheriesRecords/ProductionUnitsPanel.jsx',
]) {
  const source = fs.readFileSync(new URL(file, root), 'utf8')
  assert.ok(!/target\s*=\s*["'{]_?blank/.test(source), `${file} opens a new tab`); n++
  assert.ok(!/window\.open\s*\(/.test(source), `${file} calls window.open`); n++
}

console.log(`pcicDocuments: ${n} assertions passed`)
