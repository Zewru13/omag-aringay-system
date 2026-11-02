// Takes the User Manual's annotated screenshots and writes src/pages/Manual/manualScreens.json (the legends that go with them).
//
//   node scripts/manual/shoot.mjs <role_tokens.json> [onlyAudience|onlyId ...]
//
// It needs the app running (vite on 5174, the API on 8001) with sample data, and one login token pair per kind of account:
//   role_tokens.json = { "ADMIN": { access, refresh }, "EVALUATOR": ..., "CITIZEN:FARMER": ..., "CITIZEN:FISHERFOLK": ..., "CITIZEN:FARMERS_ORG": ... }
// (mint them with simplejwt RefreshToken.for_user for the sample accounts; they last 15 minutes, so mint right before running).
//
// Each screen in screens.mjs is opened as that account at desktop (1280x800) or phone (390x844) size, the optional `js` runs (open a window, a tab...),
// then every callout is drawn on the page as an orange numbered box around the element it names, and the picture is saved to public/manual/.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const [tokensFile, ...only] = process.argv.slice(2)
const { SCREENS } = await import(pathToFileURL(process.env.SCREENS_FILE || path.join(here, 'screens.mjs')).href)
const tokens = JSON.parse(fs.readFileSync(tokensFile, 'utf8').replace(/^\uFEFF/, ''))
const outDir = path.join(root, 'public/manual')
const manifestFile = path.join(root, 'src/pages/Manual/manualScreens.js')
const MANIFEST_HEAD = '// Written by scripts/manual/shoot.mjs: the legend of every annotated screenshot of the User Manual. Do not edit by hand.\nexport default '
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8').slice(MANIFEST_HEAD.length)) : {}
const chosen = SCREENS.filter((s) => !only.length || only.includes(s.audience) || only.includes(s.id))

const BASE = 'http://127.0.0.1:5174'
const PORT = 9300 + Math.floor(Math.random() * 400)
const profile = fs.mkdtempSync(path.join(process.env.TEMP || '.', 'oma_shoot_'))
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--window-size=1280,800', 'about:blank',
], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function targetWs() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch { /* not up yet */ }
    await sleep(300)
  }
  throw new Error('Chrome did not start')
}
const ws = new WebSocket(await targetWs())
await new Promise((r) => { ws.onopen = r })
let id = 0
const waiting = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id) } }
const send = (method, params = {}) => new Promise((resolve) => { id += 1; waiting.set(id, resolve); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression: `(async()=>{${expression}})()`, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description?.slice(0, 200) || 'script error')
  return r.result?.result?.value
}

// Runs in the page: finds each callout's element and draws an orange numbered box around it. Returns the numbers that were not found.
const DRAW = (callouts) => `
const callouts = ${JSON.stringify(callouts)};
const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
const find = (f) => {
  let list = []
  const scope = f.in ? (document.querySelector(f.in) || document) : document
  if (f.css) list = [...scope.querySelectorAll(f.css)]
  else if (f.text) {
    const want = f.text.toLowerCase()
    list = [...scope.querySelectorAll(f.tag || 'button, a, h1, h2, h3, h4, th, label, p, span, li, div, td, strong')]
      .filter((el) => { const t = (el.innerText || '').trim().toLowerCase().replace(/\\s+/g, ' '); return f.exact ? t === want : t.includes(want) })
    // the smallest element that holds the text (not a big wrapper)
    if (!f.last) list.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height)
  }
  list = list.filter(visible)
  let el = f.last ? list[list.length - 1] : list[f.nth || 0]
  for (let k = 0; el && k < (f.up || 0); k += 1) el = el.parentElement
  if (el && f.closest) el = el.closest(f.closest) || el
  return el
}
const layer = document.createElement('div')
layer.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;'
document.body.appendChild(layer)
// A box counts only when the element can really be seen in the picture: inside the window (not scrolled away or below the fold) and not covered
// by a window or overlay on top of it. Otherwise its number would be in the legend but nowhere in the picture.
const shown = (el) => {
  const r = el.getBoundingClientRect()
  const vw = innerWidth, vh = innerHeight
  const visW = Math.min(r.right, vw) - Math.max(r.left, 0)
  const visH = Math.min(r.bottom, vh) - Math.max(r.top, 0)
  if (visW < Math.min(r.width * 0.6, 24) || visH < Math.min(r.height * 0.6, 14)) return false
  const x = Math.max(r.left, 0) + visW / 2
  const y = Math.max(r.top, 0) + Math.min(visH / 2, 12)
  const top = document.elementFromPoint(x, y)
  return Boolean(top) && (el.contains(top) || top.contains(el))
}
const missing = []
const lost = []
const found = []
callouts.forEach((c, i) => {
  const finds = Array.isArray(c.find) ? c.find : [c.find]
  const els = finds.map(find).filter(Boolean)
  if (!els.length) { missing.push(i + 1); return }
  const seen = els.filter(shown)
  if (!seen.length) { lost.push(c.label); return }
  found.push(i)
  seen.forEach((el) => {
    const r = el.getBoundingClientRect()
    const pad = c.pad ?? 3
    const box = document.createElement('div')
    box.style.cssText = 'position:fixed;border:3px solid #F97316;border-radius:6px;background:rgba(249,115,22,.07);left:' + (r.left - pad) + 'px;top:' + (r.top - pad) + 'px;width:' + (r.width + pad * 2) + 'px;height:' + (r.height + pad * 2) + 'px;'
    const tag = document.createElement('div')
    tag.textContent = String(found.length)
    // the number sits on the corner of its own box, so it cannot be mistaken for the box above it
    // ...and is kept inside the picture when its box touches an edge of the window
    const edgeR = r.right + pad + 12 > innerWidth
    const edgeT = r.top - pad - 12 < 0
    const side = c.tag === 'left' ? 'left:-12px;' : (edgeR ? 'right:4px;' : 'right:-12px;')
    tag.style.cssText = 'position:absolute;top:' + (edgeT ? '4px' : '-12px') + ';' + side + 'min-width:22px;height:22px;padding:0 5px;border-radius:11px;background:#F97316;color:#fff;font:700 13px/22px Helvetica,Arial,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff,0 1px 3px rgba(0,0,0,.4);'
    box.appendChild(tag)
    layer.appendChild(box)
  })
})
return { missing, found, lost }
`

await send('Page.enable')
await send('Runtime.enable')

try {
  let current = null
  let scriptId = null
  let isPhone = null
  for (const screen of chosen) {
    const t = screen.anon ? { access: '', refresh: '' } : tokens[screen.role]
    if (!t) { console.log('NO TOKENS for', screen.role, screen.id); continue }
    if (screen.anon) {
      // signed out: drop the tokens a previous screen put in the browser
      if (scriptId) { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId }); scriptId = null }
      current = 'anon'
      await send('Page.navigate', { url: BASE + '/login' })
      await sleep(2500)
      await evaluate('localStorage.clear(); sessionStorage.clear()')
    } else if (screen.role !== current) {
      current = screen.role
      if (scriptId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId })
      const add = await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('accessToken',${JSON.stringify(t.access)});localStorage.setItem('refreshToken',${JSON.stringify(t.refresh)});}catch(e){}` })
      scriptId = add.result.identifier
    }
    const phone = Boolean(screen.phone)
    if (phone !== isPhone) {
      isPhone = phone
      if (phone) {
        await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
        await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36' })
        await send('Emulation.setTouchEmulationEnabled', { enabled: true })
      } else {
        await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
        await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36' })
        await send('Emulation.setTouchEmulationEnabled', { enabled: false })
      }
    }
    // A tall desktop picture (screen.height) for pages with many panels: the page is shown at 1280 x height.
    if (phone) {
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: screen.height || 844, deviceScaleFactor: 2, mobile: true })
    } else {
      const h = screen.height || 800
      await send('Emulation.setDeviceMetricsOverride', { width: screen.width || 1280, height: h, deviceScaleFactor: 1, mobile: false })
    }
    await send('Page.navigate', { url: BASE + screen.url })
    await sleep((screen.wait || 3500) + 1500)
    if (screen.js) { await evaluate(screen.js); await sleep(screen.after || 1500) }
    if (process.env.INVENTORY) {
      // List every visible control of the screen (not a picture): what the manual's legend has to explain.
      const list = await evaluate(`
const vis = (el) => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' }
const root = [...document.querySelectorAll('[role=dialog], [aria-modal=true], .fixed.inset-0')].filter(vis).pop() || document
const region = (e) => e.closest('aside') ? 'sidebar' : e.closest('header') ? 'header' : e.closest('nav') ? 'nav' : e.closest('table') ? 'table' : 'page'
const label = (e) => (e.getAttribute('aria-label') || e.innerText || e.value || e.getAttribute('placeholder') || e.getAttribute('title') || (e.labels && e.labels[0] && e.labels[0].innerText) || '').trim().replace(/\\s+/g, ' ').slice(0, 60)
const out = []
const seen = new Set()
for (const e of root.querySelectorAll('button, a[href], input, select, textarea, [role=tab], [role=menuitem], th, h1, h2, h3, label')) {
  if (!vis(e)) continue
  const tag = e.tagName.toLowerCase() + (e.type && ['input'].includes(e.tagName.toLowerCase()) ? ':' + e.type : '')
  const reg = region(e)
  if (reg === 'sidebar' || reg === 'header') continue
  if (reg === 'table' && e.tagName !== 'TH' && e.closest('tbody tr') && e.closest('tbody tr') !== e.closest('tbody').querySelector('tr')) continue
  const key = tag + '|' + label(e) + '|' + reg
  if (seen.has(key)) continue
  seen.add(key)
  out.push(reg + ' ' + tag + ' ' + JSON.stringify(label(e)))
}
return out.join('\\n')`)
      fs.appendFileSync(process.env.INVENTORY, `\n=== ${screen.id} (${screen.url})\n${list}\n`)
      console.log('inventoried', screen.id)
      continue
    }
    const { missing, found, lost } = await evaluate(DRAW(screen.callouts))
    const path_ = await evaluate('return location.pathname')
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    const file = path.join(outDir, screen.file)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'))
    manifest[screen.id] = {
      audience: screen.audience, title: screen.title, purpose: screen.purpose, image: `/manual/${screen.file}`, phone: phone || undefined, width: phone ? 780 : (screen.width || 1280), height: phone ? (screen.height || 844) * 2 : (screen.height || 800),
      legend: found.map((idx, k) => ({ n: k + 1, label: screen.callouts[idx].label, desc: screen.callouts[idx].desc })),
    }
    console.log(missing.length || lost.length ? 'MISSING' : 'ok', screen.id, path_, missing.length ? `callouts not found: ${missing.join(',')}` : '', lost.length ? `NOT VISIBLE (dropped): ${lost.join(' | ')}` : '')
  }
  fs.writeFileSync(manifestFile, `${MANIFEST_HEAD}${JSON.stringify(manifest, null, 1)}\n`)
} finally {
  ws.close()
  chrome.kill()
  try { spawn('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* gone */ }
}
process.exit(0)
