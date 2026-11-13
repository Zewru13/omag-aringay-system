import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The User Manual's search bar: type what you want to do or a button's name and pick a result to jump to that guide, picture or step.
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const { manualFor } = await import(new URL('../src/pages/Manual/manualContent.js', import.meta.url).href)
const { searchManual, manualTargets } = await import(new URL('../src/pages/Manual/manualSearch.js', import.meta.url).href)

const admin = manualFor('admin')
const targets = new Set(manualTargets(admin))
ok(targets.size > 100, 'every guide, step and picture has a place to jump to')

eq(searchManual(admin, ''), [], 'nothing typed, nothing listed')
eq(searchManual(admin, '   '), [], 'spaces only')
eq(searchManual(admin, 'zzqxj'), [], 'a word that is nowhere')

const registerFarmer = searchManual(admin, 'register farmer')
eq(registerFarmer[0].kind, 'guide', 'a guide title comes first')
eq(registerFarmer[0].target, 'guide-register-farmer', 'it jumps to the guide')
ok(registerFarmer[0].title.includes('Register a farmer'), 'with its number and title')

const profile = searchManual(admin, 'farmer profile')
eq(profile.find((r) => r.kind === 'screen')?.target, 'screen-register-farmer-admin-farmer-profile', 'a picture by its name')
ok(profile.some((r) => /Farmer profile/i.test(r.title)), 'listed under its title')

const imp = searchManual(admin, 'Import Farm Parcels')
ok(imp.some((r) => r.kind === 'element' && /Import Farm Parcels/.test(r.title)), 'a button of a picture, by its name')
ok(imp.find((r) => r.kind === 'element').context.length > 0, 'with the picture it is on')

eq(searchManual(admin, 'parcels farm').map((r) => r.target), searchManual(admin, 'farm parcels').map((r) => r.target), 'words in any order')
eq(searchManual(admin, 'FARM PARCELS').map((r) => r.target), searchManual(admin, 'farm parcels').map((r) => r.target), 'any capitals')
eq(searchManual(admin, 'the', { limit: 5 }).length, 5, 'a limit')
ok(searchManual(admin, 'the').length <= 12, 'twelve at most by default')

// a word of a step finds the step, and its snippet shows the words around it
const step = searchManual(admin, 'Record Farm Visit').find((r) => r.kind === 'step')
ok(step && /Record Farm Visit/.test(step.snippet), 'a step, with the words around the match')
ok(/^guide-[a-z0-9-]+-step-\d+$/.test(step.target), 'jumps to the step')

// the results come in the order guide, picture, button or field, step
const order = { guide: 0, screen: 1, element: 2, step: 3 }
const mixed = searchManual(admin, 'organization', { limit: 12 })
eq(mixed.every((r, i) => i === 0 || order[mixed[i - 1].kind] <= order[r.kind]), true, 'guides first, then pictures, then buttons and fields, then steps')

// every result of every kind of account points at something on the page
for (const audience of ['admin', 'focal', 'farmer', 'fisherfolk', 'org']) {
  const guides = manualFor(audience)
  const valid = new Set(manualTargets(guides))
  for (const q of ['register', 'edit', 'search', 'report', 'organization', 'harvest', 'password']) {
    for (const r of searchManual(guides, q, { limit: 40 })) ok(valid.has(r.target), `${audience}: "${q}" -> ${r.target} is on the page`)
  }
}

// the screen: the box, and the anchors it jumps to
const body = read('src/pages/Manual/ManualBody.jsx')
const box = read('src/pages/Manual/ManualSearchBox.jsx')
ok(/type="search"/.test(box) && /aria-label="Search the manual"/.test(box), 'the page has a search box')
ok(/searchManual\(/.test(box), 'it uses the search rules')
ok(/scrollIntoView/.test(box) && /prefers-reduced-motion/.test(box), 'a result scrolls to its place, calmly under reduced motion')
ok(/<ManualSearchBox guides=\{guides\}/.test(body), 'the manual shows the box')
ok(/id=\{screenTarget\(g, s\)\}/.test(body) && /id=\{stepTarget\(g, j\)\}/.test(body) && /id=\{guideTarget\(g\)\}/.test(body), 'guides, pictures and steps have anchors')
ok(/sticky top-14/.test(body), 'the bar stays at the top while reading')
ok(/role="listbox"/.test(box) && /aria-live="polite"/.test(box), 'the results are announced')
ok(/manual-found/.test(read('src/index.css')), 'the place it jumps to is flashed')

console.log(`manualSearch: ${n} checks passed`)
