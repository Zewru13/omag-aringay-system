// Help and the User Manual are two different pages for every account: Help has the quick guide and the questions, the User Manual has the
// screen guides, and nothing is said twice (no page holds the other one, and no sentence of the Help is repeated in the manual).
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const here = (p) => new URL(`../${p}`, import.meta.url)
const read = (p) => readFileSync(here(p), 'utf8').replace(/\r\n/g, '\n')
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }

// --- two pages, neither inside the other
ok(!existsSync(here('src/pages/Manual/UserManualTabs.jsx')), 'the page with the two tabs is gone')
const helpPage = read('src/pages/Help/HelpPage.jsx')
ok(!/ManualBody|UserManualTabs/.test(helpPage), 'the staff Help page does not hold the manual')
ok(/title="Help"/.test(helpPage), 'the staff Help page is called Help')
ok(helpPage.includes('Quick Guide') && helpPage.includes('Frequently Asked Questions'), 'the staff Help page keeps the quick guide and the questions')
for (const file of ['FarmerAccountPages.jsx', 'FisherfolkAccountPages.jsx', 'OrgAccountPages.jsx']) {
  const src = read(`src/pages/Citizen/${file}`)
  ok(!/ManualBody|UserManualTabs/.test(src), `${file}: the Help page does not hold the manual`)
  ok(/<PageLayout title="Help"/.test(src), `${file}: the page is called Help`)
  ok(!/<PageLayout title="User Manual"/.test(src), `${file}: no page there is called User Manual`)
}
const manualPage = read('src/pages/Manual/ManualPage.jsx')
ok(/<PageLayout title="User Manual"/.test(manualPage) && manualPage.includes('<ManualBody'), 'the User Manual page shows the screen guides')
ok(!/helpContent|CitizenHelpScreen|Quick Guide|Frequently Asked/.test(manualPage), 'the User Manual page has no quick guide or questions')
const manualBody = read('src/pages/Manual/ManualBody.jsx')
ok(!/helpContent|CitizenHelpScreen|Frequently Asked/.test(manualBody), 'the screen guides hold no questions')

// --- one address for the manual, for every kind of account; Help keeps its own
const app = read('src/App.jsx')
const manualRoute = app.slice(app.indexOf('path="/manual"'), app.indexOf('path="/manual"') + 420)
ok(app.includes('path="/manual"') && manualRoute.includes('<ManualPage'), '/manual opens the User Manual page')
ok(/allowedRoles=\{\["ADMIN", "EVALUATOR"\]\}/.test(manualRoute) && /allowFisherfolk/.test(manualRoute) && /allowFarmer/.test(manualRoute)
  && /allowOrg=\{\["FARMERS_ORG", "FISHERFOLK_ORG"\]\}/.test(manualRoute), 'every kind of account may open it')
ok(!app.includes('ManualRedirect'), '/manual no longer sends you to Help')
ok(app.includes('path="/help"') && app.includes('path="/my-help"'), 'the Help pages keep their addresses')

// --- the account menus offer both, each under its own name
const navbar = read('src/components/Layout/Navbar.jsx')
ok(/to=\{helpPath\}[\s\S]{0,400}?\n\s+Help\n/.test(navbar), 'the account menu has Help')
ok(/to="\/manual"[\s\S]{0,400}?\n\s+User Manual\n/.test(navbar), 'the account menu has User Manual, which opens /manual')
const staffPhone = read('src/components/Layout/StaffPhoneShell.jsx')
ok(/go\('\/help'\)[^\n]*\n[^\n]*> Help\n/.test(staffPhone), 'the staff phone menu has Help')
ok(/go\('\/manual'\)[^\n]*\n[^\n]*> User Manual\n/.test(staffPhone), 'the staff phone menu has User Manual')
const citizenPhone = read('src/pages/Citizen/CitizenPhoneShell.jsx')
ok(/help: 'Help'/.test(citizenPhone) && /manual: 'User Manual'/.test(citizenPhone), 'the citizen phone menu names both')
ok(citizenPhone.includes("navigate('/my-help')") && citizenPhone.includes("navigate('/manual')"), 'the citizen phone menu opens both')
const chrome = read('src/pages/Citizen/FarmerChrome.jsx')
ok(/onManual/.test(chrome) && /M\.manual/.test(chrome), 'the citizen menu panel can show User Manual')
const labels = read('src/pages/Citizen/labels.js')
for (const key of ['help', 'accountHelp', 'helpRowLabel']) ok(!new RegExp(`${key}: 'User Manual'`).test(labels), `labels: ${key} is not called User Manual`)
for (const block of ['orgHelp', 'farmerHelp', 'fisherfolkHelp']) {
  const at = labels.indexOf(`  ${block}: {`)
  ok(at > 0 && /title: 'Help'/.test(labels.slice(at, at + 200)), `labels: the ${block} screen is titled Help`)
}

// --- nothing is said twice: no sentence of a Help page is in the User Manual (its guides or its picture legends)
const imp = (p) => import(here(p).href)
const { STEPS, SECTIONS } = await imp('src/pages/Help/helpContent.js')
const manual = await imp('src/pages/Manual/manualContent.js')
const SCREENS = (await imp('src/pages/Manual/manualScreens.js')).default
const sentences = (text) => String(text).split(/(?<=[.?!])\s+/).map((s) => s.trim().toLowerCase().replace(/\s+/g, ' ')).filter((s) => s.split(' ').length >= 6)
const help = new Set()
const addHelp = (text) => sentences(text).forEach((s) => help.add(s))
STEPS.forEach((s) => { addHelp(s.title); addHelp(s.desc) })
SECTIONS.forEach((section) => section.items.forEach((item) => { addHelp(item.q); addHelp(item.a) }))
for (const file of ['FarmerAccountPages.jsx', 'FisherfolkAccountPages.jsx', 'OrgAccountPages.jsx']) {
  for (const m of read(`src/pages/Citizen/${file}`).matchAll(/'((?:[^'\\]|\\.){25,})'/g)) addHelp(m[1].replace(/\\'/g, "'"))
}
ok(help.size > 300, 'the Help wording was read')
const manualText = []
for (const audience of manual.AUDIENCES) {
  for (const guide of manual.manualFor(audience.id)) manualText.push(guide.title, guide.intro, ...guide.steps)
  const intro = manual.manualIntro(audience.id)
  manualText.push(intro.lead, intro.howToRead, ...intro.notes)
}
for (const screen of Object.values(SCREENS)) { manualText.push(screen.purpose); screen.legend.forEach((row) => manualText.push(row.desc)) }
const repeated = [...new Set(manualText.flatMap(sentences).filter((s) => help.has(s)))]
assert.deepEqual(repeated, [], `sentences of the Help repeated in the User Manual: ${JSON.stringify(repeated, null, 1)}`); n++

// --- the manual tells the reader where each page is
const everyGuide = manual.AUDIENCES.flatMap((a) => manual.manualFor(a.id).flatMap((g) => g.steps)).join('\n')
ok(!/the User Manual and Log ?out/.test(everyGuide), 'the guides name Help beside the User Manual in the account menu')
ok(!Object.values(SCREENS).some((s) => s.legend.some((row) => /your profile, the User Manual and Log out|Open it for the User Manual/.test(row.desc))), 'so do the picture legends')

console.log(`helpManualSplit: ${n} checks passed`)
