import api from '../../api/axiosInstance.js'
import logo from '../../assets/LOGO OMAg.jpg'
import { SYSTEM_TITLE } from '../../constants/appInfo.js'
import { escapeHtml as esc, headerCss, headerHtml } from './printHeader.js'

// Disaster Log documents: formatting, Print Disaster Log and Download Disaster Log, for both the Fisheries
// logs (GET /fisheries/disaster-reports/<id>/) and the Farmer logs (GET /production/disaster-logs/<id>/).
// Print is built from the same document JSON the backend writes into the PDF, so the screen, the printout
// and the PDF always show the same saved log. Printing and downloading never change anything.

export function fmtDate(v) {
  if (!v) return null
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${v}T00:00:00`))
}

export function fmtDateTime(v) {
  if (!v) return null
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(v))
}

export function fmtNumber(v, suffix = '') {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (Number.isNaN(n)) return `${v}${suffix}`
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 4 })}${suffix}`
}

const keep = rows => rows.filter(([, v]) => v !== null && v !== undefined && v !== '')

// ─── Fisheries ────────────────────────────────────────────────────────────────

// Fingerlings lost per stock and pond/cage of a multi-stock log (doc.fingerling_losses, totals summed by the
// backend) as table rows: each stock's rows, its subtotal, then the overall total. null when there are none
// (older logs and logs not linked to a stock).
export function lossTable(doc) {
  const groups = doc.fingerling_losses || []
  if (!groups.length) return null
  const num = v => (v === null || v === undefined ? null : fmtNumber(v))
  const rows = []
  const boldRows = new Set()
  groups.forEach(g => {
    g.rows.forEach(r => rows.push([g.label, r.unit_label, num(r.fingerlings_stocked) ?? '—',
      num(r.fingerlings_lost) ?? 'Not recorded', r.is_total_loss ? 'Yes' : 'No']))
    boldRows.add(rows.length)
    rows.push([`Subtotal — ${g.label}`, '', '', num(g.total_lost) ?? '—', ''])
  })
  boldRows.add(rows.length)
  rows.push(['TOTAL FINGERLINGS LOST', '', '', num(doc.fingerlings_lost_total) ?? '—', ''])
  return { head: ['Stock', 'Production Unit', 'Fingerlings Stocked', 'Fingerlings Lost', 'Total Loss'], rows, boldRows }
}

// Several affected stocks: one row each (one stock keeps the detailed single-stock section).
export function stocksTable(doc) {
  const groups = doc.fingerling_losses || []
  if (groups.length < 2) return null
  return {
    head: ['Stock', 'Stocking Date', 'Location', 'Fingerlings Stocked', 'Stock Status'],
    rows: groups.map(g => [g.label, g.date_stocked ? `${fmtDate(g.date_stocked)}${g.date_stocked_is_estimated ? ' (estimated)' : ''}` : '—',
      g.location || '—', fmtNumber(g.number_of_fingerlings) ?? '—', g.stock_status]),
    boldRows: new Set(),
  }
}

// The Fisheries log's sections as [label, value] rows (empty values dropped), for the details view and print.
export function reportSections(doc) {
  const stock = (doc.fingerling_losses || []).length > 1 ? null : doc.affected_stock
  return {
    header: keep([
      ['Reference No.', doc.report_number],
      ['Status', doc.submission_label],
      ['Date/Time Logged', fmtDateTime(doc.date_reported)],
      ['Logged By', doc.reported_by_name],
      ['Submitted to Admin', fmtDateTime(doc.submitted_at)],
      ['Submitted By', doc.submitted_by_name],
    ]),
    fisherfolk: keep([
      ['Name', doc.fisherfolk?.name],
      ['Barangay', doc.fisherfolk?.barangay],
      ['Organization', doc.fisherfolk?.organization],
    ]),
    stock: stock ? keep([
      ['Species', stock.species],
      ['Stocking Date', stock.date_stocked ? `${fmtDate(stock.date_stocked)}${stock.date_stocked_is_estimated ? ' (estimated)' : ''}` : null],
      ['Production Cycle', stock.production_cycle],
      ['Production Units', (stock.production_units || []).join(', ')],
      ['Pond / Cage', stock.pond_name],
      ['Location', stock.location],
      ['Organization', stock.organization],
      ['Culture Type', stock.culture_type],
      ['Culture Phase', stock.culture_phase],
      ['Fingerlings Stocked', fmtNumber(stock.number_of_fingerlings)],
      ['Area Stocked', fmtNumber(stock.area_hectares, ' ha')],
      ['Stock Status', stock.stock_status],
    ]) : null,
    details: keep([
      ['Date of Occurrence', fmtDate(doc.date_of_occurrence)],
      ['Disaster Type', doc.disaster_type_label],
      ['Volume Lost', fmtNumber(doc.volume_lost_kg, ' kg') || 'Not recorded'],
      ['Area Affected', fmtNumber(doc.area_affected_ha, ' ha')],
      ['Total Loss', doc.is_total_loss ? 'Yes — stock completely destroyed' : null],
      ['Disaster Status', doc.status],
      ['Recovered On', fmtDate(doc.recovered_date)],
    ]),
  }
}

export function allPhotoUrls(doc) {
  return [...(doc.photos || []).map(p => p.url), ...(doc.legacy_photo ? [doc.legacy_photo] : [])]
}

function damageParagraphs(doc) {
  return [
    doc.description,
    doc.production_loss && `Estimated production loss: ${doc.production_loss}`,
    doc.status === 'Recovered' && doc.recovery_note && `Recovery note: ${doc.recovery_note}`,
  ].filter(Boolean)
}

export function fisheriesPrintSpec(doc) {
  const s = reportSections(doc)
  const stocks = stocksTable(doc)
  const losses = lossTable(doc)
  return {
    title: 'FISHERFOLK DISASTER REPORT',
    officeHeader: true,   // the office name under an enlarged seal, no system-name tagline (see printHeader.js)
    reference: doc.report_number,
    header: s.header,
    sections: [
      { title: 'Fisherfolk', rows: s.fisherfolk },
      ...(stocks ? [{ title: 'Affected Stocks', table: stocks }] : []),
      ...(s.stock ? [{ title: 'Affected Stock', rows: s.stock }] : []),
      ...(losses ? [{ title: 'Fingerlings Lost per Stock and Production Unit', table: losses }] : []),
      { title: 'Disaster Details', rows: s.details },
      { title: 'Equipment Damaged', bullets: doc.equipment_damaged || [], empty: 'No equipment recorded as damaged.' },
      { title: 'Description of Damage', paragraphs: damageParagraphs(doc), empty: 'Not provided.' },
    ],
    photos: allPhotoUrls(doc),
    photoTitle: 'Photo Documentation of Damage',
    pageSize: 'A4',
  }
}

// ─── Farmer ───────────────────────────────────────────────────────────────────

export function cropSections(doc) {
  const crop = doc.crop_record || {}
  return {
    header: keep([
      ['Reference No.', doc.report_number],
      ['Disaster Status', doc.status],
      ['Date/Time Logged', fmtDateTime(doc.date_reported)],
      ['Logged By', doc.reported_by_name],
    ]),
    farmer: keep([['Name', doc.farmer?.name], ['Barangay', doc.farmer?.barangay], ['Organization', doc.farmer?.organization]]),
    crop: keep([
      ['Crop', crop.crop], ['Variety', crop.variety], ['Season', crop.season],
      ['Date Planted', crop.date_planted ? `${fmtDate(crop.date_planted)}${crop.date_planted_is_estimated ? ' (estimated)' : ''}` : null],
      ['Area Planted', fmtNumber(crop.area_planted_ha, ' ha')], ['Location', crop.location],
      ['Growth Stage', crop.growth_stage], ['Crop Status', crop.record_status],
    ]),
    details: keep([
      ['Date of Occurrence', fmtDate(doc.date_of_occurrence)],
      ['Disaster Type', doc.disaster_type_label],
      ['Area Affected', fmtNumber(doc.area_affected_ha, ' ha')],
      ['Severity', doc.severity],
      ['Total Loss', doc.is_total_loss ? 'Yes — crop completely destroyed' : null],
      ['Recovered On', fmtDate(doc.recovered_date)],
    ]),
    paragraphs: damageParagraphs(doc),
  }
}

export function cropPrintSpec(doc) {
  const s = cropSections(doc)
  return {
    title: 'FARMER DISASTER REPORT',
    officeHeader: true,
    reference: doc.report_number,
    header: s.header,
    sections: [
      { title: 'Farmer', rows: s.farmer },
      { title: 'Affected Crop', rows: s.crop },
      { title: 'Disaster Details', rows: s.details },
      { title: 'Description of Damage', paragraphs: s.paragraphs, empty: 'No description recorded.' },
    ],
    photos: [...(doc.photo ? [doc.photo] : []), ...(doc.photos || []).map(p => p.url)],
  }
}

// ─── Print ────────────────────────────────────────────────────────────────────

const kvTable = rows => `<table class="kv">${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`
const dataTable = ({ head, rows, boldRows }) => `<table class="data"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
  rows.map((r, i) => `<tr${boldRows?.has(i) ? ' class="total"' : ''}>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

export function buildPrintHtml(spec) {
  let n = 0
  const section = (title, body) => `<section><h2>${ROMAN[n++]}. ${esc(title)}</h2>${body}</section>`
  const body = spec.sections.map((sec) => {
    if (sec.rows) return sec.rows.length ? section(sec.title, kvTable(sec.rows)) : ''
    if (sec.table) return section(sec.title, dataTable(sec.table))
    if (sec.bullets) return section(sec.title, sec.bullets.length ? `<ul>${sec.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : `<p class="muted">${esc(sec.empty)}</p>`)
    return section(sec.title, sec.paragraphs.length ? sec.paragraphs.map(p => `<p class="pre">${esc(p)}</p>`).join('') : `<p class="muted">${esc(sec.empty)}</p>`)
  }).join('')
  const photos = spec.photos.length
    ? section(`${spec.photoTitle || 'Photo Documentation'} (${spec.photos.length})`, `<div class="photos">${spec.photos.map((u, i) => `<figure><img src="${esc(u)}" alt="Damage photo ${i + 1}"></figure>`).join('')}</div>`)
    : ''
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(spec.title)} ${esc(spec.reference)}</title>
<style>
  @page { size: ${spec.pageSize === 'A4' ? 'A4' : 'letter'}; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: #0f172a; font-size: 11px; margin: 0; }
${headerCss({ office: spec.officeHeader })}
  h1 { text-align: center; font-size: 17px; letter-spacing: .06em; margin: 8px 0 10px; }
  h2 { font-size: 11px; color: #15803d; border-bottom: 1px solid #15803d; padding-bottom: 2px; margin: 14px 0 6px; }
  table.kv { width: 100%; border-collapse: collapse; }
  table.kv th, table.kv td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; vertical-align: top; }
  table.kv th { width: 32%; color: #475569; background: #f8fafc; font-weight: bold; }
  table.data { width: 100%; border-collapse: collapse; }
  table.data th, table.data td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: left; vertical-align: top; }
  table.data th { background: #f1f5f9; color: #334155; }
  table.data tr.total td { font-weight: bold; background: #f8fafc; }
  table.data tr { break-inside: avoid; }
  ul { margin: 0; padding-left: 18px; }
  .pre { white-space: pre-wrap; margin: 0 0 4px; }
  .muted { color: #64748b; font-style: italic; }
  .photos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .photos figure { margin: 0; border: 1px solid #cbd5e1; height: 230px; display: flex; align-items: center; justify-content: center; break-inside: avoid; }
  .photos img { max-width: 100%; max-height: 100%; object-fit: contain; }
  footer { margin-top: 16px; border-top: 1px solid #15803d; padding-top: 4px; color: #64748b; font-size: 9px; text-align: center; }
  .sigs { display: flex; gap: 40px; margin-top: 38px; }
  .sig { flex: 1; border-top: 1px solid #0f172a; padding-top: 3px; text-align: center; font-size: 10px; }
</style></head>
<body>
  ${headerHtml({ office: spec.officeHeader, logoUrl: new URL(logo, window.location.href).href, systemTitle: SYSTEM_TITLE })}
  <h1>${esc(spec.title)}</h1>
  ${kvTable(spec.header)}
  ${body}
  ${photos}
  ${spec.signatures ? `<div class="sigs">${spec.signatures.map(label => `<div class="sig">${esc(label)}</div>`).join('')}</div>` : ''}
  <footer>Printed ${esc(fmtDateTime(new Date().toISOString()))} from the saved ${esc(spec.footerLabel || 'disaster log')} ${esc(spec.reference)} — OMAg Aringay Integrated Agricultural Monitoring System.</footer>
</body></html>`
}

// Print only the log: written into a hidden iframe (never the app page, so no sidebar/navbar/buttons) and
// printed once its images have loaded. Read-only - nothing is sent to the server.
export function printSpec(spec) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
    document.body.appendChild(frame)
    const cleanup = () => setTimeout(() => frame.remove(), 1000)
    try {
      const fdoc = frame.contentWindow.document
      fdoc.open()
      fdoc.write(buildPrintHtml(spec))
      fdoc.close()
      // Print only once every image has loaded AND been decoded (a loaded-but-undecoded photo can print blank);
      // a photo that fails still lets the rest print. Capped so a dead link can never block printing.
      const ready = Array.from(fdoc.images).map(img => new Promise(done => {
        const decode = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(done)
        if (img.complete) { decode(); return }
        img.addEventListener('load', decode, { once: true })
        img.addEventListener('error', done, { once: true })
      }))
      Promise.race([Promise.all(ready), new Promise(done => setTimeout(done, 20000))]).then(() => {
        try {
          frame.contentWindow.addEventListener('afterprint', cleanup, { once: true })
          frame.contentWindow.focus()
          frame.contentWindow.print()
          setTimeout(() => frame.remove(), 60000)   // fallback where afterprint never fires
          resolve()
        } catch (err) { cleanup(); reject(err) }
      })
    } catch (err) {
      cleanup()
      reject(err)
    }
  })
}

// ─── Actions by id (used from list rows and the details views) ─────────────────

export const FISHERIES_LOG = {
  docUrl: id => `/fisheries/disaster-reports/${id}/`,
  pdfUrl: id => `/fisheries/disaster-reports/${id}/pdf/`,
  printSpec: fisheriesPrintSpec,
  inlinePhotos: true,
}

// The SAVED photos of a log (their server URLs from the log document) embedded as data URLs, so the print
// frame already holds every image before printing - nothing left to load from another host while the print
// dialog opens. A photo that cannot be fetched keeps its URL (printed as before, never dropped).
async function inlineImages(urls) {
  return Promise.all(urls.map(async (url) => {
    try {
      const r = await fetch(url)
      if (!r.ok) return url
      const blob = await r.blob()
      if (!blob.type.startsWith('image/')) return url
      return await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => resolve(url)
        reader.readAsDataURL(blob)
      })
    } catch {
      return url
    }
  }))
}
export const FARMER_LOG = {
  docUrl: id => `/production/disaster-logs/${id}/`,
  pdfUrl: id => `/production/disaster-logs/${id}/pdf/`,
  printSpec: cropPrintSpec,
}

export async function printLog(kind, id, doc = null) {
  const data = doc || (await api.get(kind.docUrl(id))).data
  const spec = kind.printSpec(data)
  if (kind.inlinePhotos && spec.photos.length) spec.photos = await inlineImages(spec.photos)
  await printSpec(spec)
}

// Downloads the backend-generated PDF. Verifies it really is a PDF before saving; throws with the server's
// message otherwise (an error body of a blob request arrives as a Blob).
export async function downloadLog(kind, id, filename) {
  let r
  try {
    r = await api.get(kind.pdfUrl(id), { responseType: 'blob' })
  } catch (err) {
    let msg = 'The PDF could not be generated. Please try again.'
    const data = err?.response?.data
    if (data instanceof Blob) {
      try { msg = JSON.parse(await data.text()).detail || msg } catch { /* keep the generic message */ }
    }
    throw new Error(msg, { cause: err })
  }
  const head = r.data instanceof Blob ? await r.data.slice(0, 5).text() : ''
  if (!head.startsWith('%PDF')) throw new Error('The PDF could not be generated. Please try again.')
  const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename || 'Disaster_Log.pdf'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Every page of a (possibly paginated) stocking list.
export async function fetchAllStocks(params) {
  const all = []
  for (let page = 1; page <= 50; page++) {
    const r = await api.get('/fisheries/stocking/', { params: { ...params, page } })
    if (Array.isArray(r.data)) { all.push(...r.data); break }
    all.push(...(r.data.results || []))
    if (!r.data.next) break
  }
  return all
}