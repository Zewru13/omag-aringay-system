import assert from 'node:assert/strict'
import fs from 'node:fs'

// A crop's Wet / Dry season follows its Date Planted: it is shown, never typed, and not sent with the record (the server works it out too).
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

const { seasonOf, makeCropRecord, buildCropRecordPayload } = await import(new URL('../src/pages/Monitoring/cropRecordForm.js', import.meta.url).href)

// Wet: June 1 - November 30, Dry: December 1 - May 31 (the same rule as core/seasons.py)
eq(seasonOf('2026-05-31'), 'Dry', 'May 31')
eq(seasonOf('2026-06-01'), 'Wet', 'June 1')
eq(seasonOf('2026-11-30'), 'Wet', 'November 30')
eq(seasonOf('2026-12-01'), 'Dry', 'December 1')
eq(seasonOf('2026-01-15'), 'Dry', 'January')
eq(seasonOf('2026-08-20'), 'Wet', 'August')
eq(seasonOf(''), '', 'no date yet')
eq(seasonOf(undefined), '', 'no date at all')

// a new row has no season of its own, and the body sent has none either
eq('season' in makeCropRecord(1), false, 'a blank row has no season')
const body = buildCropRecordPayload({ ...makeCropRecord(1), date_planted: '2026-07-01', crop_type: '1', season: 'Dry' }, { farmerInfo: { farmer_id: 1 }, barangay: 'Alaska', cropTypes: [] })
eq('season' in body, false, 'the season is not sent')
eq(body.year, 2026, 'the year still is')

// the screens: no season box to type in, a read-only value instead
const table = read('../src/pages/Monitoring/CropRecordsTable.jsx')
eq(/set\('season'/.test(table), false, 'the crop table never sets a season')
eq(table.includes('seasonOf(rec.date_planted)'), true, 'the crop table shows the season of the date')
const edit = read('../src/pages/CropInformation/CropInformationPage.jsx')
eq(/set\("season"/.test(edit) || /form\.season/.test(edit), false, 'the edit-crop form never sets a season')
eq(edit.includes('seasonOf(form.date_planted)'), true, 'the edit-crop form shows the season of the date')
eq(/<option value="Wet">/.test(table) || /<option value="Wet">/.test(edit), false, 'no Wet / Dry choice list')

console.log(`ok - ${n} assertions`)
