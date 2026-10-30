// "Print Report" on the crop and fisheries tables: the rows the table's filters match, as a printable list for the office. Pure (no screen,
// no network); the print itself is printSpec() from Monitoring/disasterReportDocument.js, the same one the harvest and assistance reports use.
// The registration tables have their own server report (utils/registeredReport.js).

// Every row a list matches, not only the page on screen: the pages are read one after another (200 rows at a time) until the server says
// there are no more. A list that does not paginate answers with an array. Stops after `maxPages` so a runaway list cannot loop forever.
export async function fetchAllRows(api, url, params = {}, maxPages = 50) {
  const rows = []
  for (let page = 1; page <= maxPages; page += 1) {
    const { data } = await api.get(url, { params: { ...params, page, page_size: 200 } })
    if (Array.isArray(data)) return data
    rows.push(...(data.results || []))
    if (!data.next) break
  }
  return rows
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const pad = (n) => String(n).padStart(2, '0')

const printedDate = (now) => new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(now)

const referenceOf = (now) => `LR-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`

// One record as a printable document (the Print Report of a parcel's or a cycle's ⋮ menu): `details` is [[label, value]] shown as the first
// section, `sections` the rest as the print document takes them (a table: { title, table: { head, rows, boldRows } }). Empty values show as a dash.
export function buildDetailReportSpec({ title, noun, details, sections = [], wide = false, now = new Date() }) {
  const reference = referenceOf(now)
  return {
    title,
    reference,
    pageSize: 'letter',
    landscape: wide,
    header: [['Date printed', printedDate(now)]],
    sections: [{ title: 'Details', rows: details.map(([label, value]) => [label, value === null || value === undefined || value === '' ? '—' : String(value)]) }, ...sections],
    photos: [],
    footerLabel: noun,
    signatures: ['Prepared by', 'Noted by'],
  }
}

// title: the report's heading ('CROP MONITORING REPORT'); noun: what a row is ('crop record'); filters: [[label, value]] for what the
// table was filtered by (empty values are left out, so an unfiltered table says so); head / rows: the table; wide: landscape paper.
export function buildListReportSpec({ title, noun, filters = [], head, rows, wide = false, now = new Date() }) {
  const reference = referenceOf(now)
  const applied = filters.filter(([, value]) => value)
  return {
    title,
    reference,
    pageSize: 'letter',
    landscape: wide,
    header: [
      ['Date printed', printedDate(now)],
      ...(applied.length ? applied : [['Filters', 'None (every record)']]),
      ['Records', plural(rows.length, noun)],
    ],
    sections: [{
      title: 'Records',
      table: { head: ['No.', ...head], rows: rows.map((row, i) => [String(i + 1), ...row.map((cell) => (cell === null || cell === undefined || cell === '' ? '—' : String(cell)))]), boldRows: new Set() },
    }],
    photos: [],
    footerLabel: `${noun} list`,
    signatures: ['Prepared by', 'Noted by'],
  }
}
