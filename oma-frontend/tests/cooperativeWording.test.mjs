// People read "Cooperative" where the website used to say "Organization". Addresses, field names and saved values keep the old
// word, so nothing in the database changes. That includes the words of the Help pictures (pages/Manual/manualScreens.js).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const { parse } = createRequire(import.meta.url)('@babel/parser')
const src = fileURLToPath(new URL('../src', import.meta.url))
const WORD = /organi[sz]ation/i

// Written like an address, a field name or a code: no spaces, and not a capitalised word that would be read as a label.
const isCode = (value, kind) => {
  const v = value.trim()
  if (kind === 'jsx-text') return false
  if (/^attr:(className|to|href|path|key|id|name|htmlFor|data-testid|type|value)$/.test(kind)) return true
  if (/\s/.test(v) || /^[A-Z][a-z]+s?[?!.,:]?$/.test(v)) return false
  return /^[A-Za-z0-9_\-/.:?=&%#]*$/.test(v)
}

const strings = []
const readFile = (file, name) => {
  const code = fs.readFileSync(file, 'utf8')
  if (!WORD.test(code)) return
  const visit = (node, parent, key) => {
    if (!node || typeof node.type !== 'string') return
    let value = null
    let kind = null
    if (node.type === 'JSXText') { value = node.value; kind = 'jsx-text' }
    else if (node.type === 'StringLiteral') { value = node.value; kind = parent?.type === 'JSXAttribute' ? `attr:${parent.name.name}` : 'string' }
    else if (node.type === 'TemplateElement') { value = node.value.cooked ?? node.value.raw; kind = 'template' }
    const isSource = key === 'source' && /^(Import|Export)/.test(parent?.type || '') || parent?.callee?.type === 'Import'
    const isKey = (parent?.type === 'ObjectProperty' && key === 'key') || (parent?.type === 'MemberExpression' && key === 'property')
    if (value !== null && WORD.test(value) && !isSource && !isKey) strings.push({ name, line: node.loc.start.line, value, kind })
    for (const [childKey, child] of Object.entries(node)) {
      if (childKey === 'loc' || childKey.endsWith('Comments')) continue
      if (Array.isArray(child)) child.forEach((c) => visit(c, node, childKey))
      else if (child && typeof child.type === 'string') visit(child, node, childKey)
    }
  }
  visit(parse(code, { sourceType: 'module', plugins: ['jsx'] }).program, null, null)
}
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(js|jsx)$/.test(entry.name)) {
      const name = path.relative(src, full).replace(/\\/g, '/')
      readFile(full, name)
    }
  }
}
walk(src)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual, null, 1)}, wanted ${JSON.stringify(expected)}`); n++ }
const list = (items) => items.map((s) => `${s.name}:${s.line} ${s.value.trim().replace(/\s+/g, ' ').slice(0, 80)}`)

// ── nothing a person reads says "organization"
// The one capitalised word that is a saved value: the seed source 'Organization' (shown as Cooperative, checked below).
const isSavedValue = (s) => s.value === 'Organization' && s.name === 'pages/CropInformation/cropEntry.js'
eq(list(strings.filter((s) => !isCode(s.value, s.kind) && !isSavedValue(s))), [], 'screen text that still says organization')
// words that look like codes but were shown on screen
eq(list(strings.filter((s) => s.value === 'ORGANIZATION' && !s.name.startsWith('pages/Users/userTabs'))), [], 'the word in capitals was a column heading')
eq(list(strings.filter((s) => /\.xlsx$/.test(s.value))), [], 'downloaded template file names')
const read = (p) => fs.readFileSync(path.join(src, p), 'utf8')
eq(/'organizations?'\s*[}:]|: 'organizations'|\|\| 'Non-organization'/.test(read('pages/AssistanceManagement/DistributeAssistanceModal.jsx') + read('pages/Monitoring/AddCropMonitoringPage.jsx')), false, 'single words shown inside sentences')

// ── what the system relies on is unchanged
eq(strings.some((s) => s.value.startsWith('/organizations/')), true, 'the server addresses keep their names')
const { OWNERSHIP_OPTIONS, machineryOwnershipLabel } = await import(new URL('../src/pages/Farmers/parcelRows.js', import.meta.url).href)
eq(OWNERSHIP_OPTIONS.includes('Organization-Owned'), true, 'the saved machinery value is unchanged')
eq(['Organization-Owned', 'Borrowed', '', undefined].map(machineryOwnershipLabel), ['Cooperative-Owned', 'Borrowed', '', ''], 'and it is shown as Cooperative-Owned')
for (const file of ['pages/Farmers/MachineryEditor.jsx', 'pages/Farmers/FarmerMachineryCard.jsx', 'pages/Monitoring/ParcelViewModal.jsx']) {
  eq(/machineryOwnershipLabel\(/.test(read(file)), true, `${file} shows the label`)
}

// A crop's seed source is saved as the text picked, so Edit Crop keeps saving 'Organization' and only shows "Cooperative".
const { seedSourceLabel, seedSourceChoices } = await import(new URL('../src/pages/CropInformation/cropEntry.js', import.meta.url).href)
eq(seedSourceChoices([], 'Organization'), [{ value: 'Organization', label: 'Cooperative' }], 'the saved seed source value is unchanged')
eq(['Organization', 'Commercial', '', undefined].map(seedSourceLabel), ['Cooperative', 'Commercial', '', ''], 'and it is shown as Cooperative')
eq(read('pages/CropInformation/CropInformationPage.jsx').includes('options={seedSourceChoices('), true, 'Edit Crop uses that list')
for (const file of ['pages/CropInformation/CropInformationPage.jsx', 'pages/Farmers/farmerProfile.js', 'pages/Monitoring/cropDetails.js']) {
  eq(/seedSourceLabel\(/.test(read(file)), true, `${file} shows the label`)
}

console.log(`cooperativeWording: ${n} checks passed`)
