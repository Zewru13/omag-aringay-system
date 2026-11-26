// One page for help: the User Manual holds the screen guides, the common questions and About This System, with one search at the
// top. There is no separate Help page and no Quick Guide (it repeated the guides).
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const here = (p) => new URL(`../${p}`, import.meta.url)
const read = (p) => readFileSync(here(p), 'utf8').replace(/\r\n/g, '\n')
const imp = (p) => import(here(p).href)
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }

// --- the Help pages are gone and their addresses open the manual
for (const gone of ['src/pages/Help/HelpPage.jsx', 'src/pages/Help/helpSearch.js', 'src/pages/Citizen/CitizenHelpScreen.jsx']) {
  ok(!existsSync(here(gone)), `${gone} is gone`)
}
const app = read('src/App.jsx')
for (const path of ['/help', '/my-help']) {
  ok(new RegExp(`path="${path}" element=\\{<Navigate to="/manual" replace />\\}`).test(app), `${path} opens the User Manual`)
}
ok(!/HelpPage/.test(app), 'no Help page is loaded')

// --- one menu entry, called User Manual
const navbar = read('src/components/Layout/Navbar.jsx')
ok(!/helpPath|\n\s+Help\n/.test(navbar) && /\n\s+User Manual\n/.test(navbar), 'the account menu has User Manual and no Help')
const phone = read('src/components/Layout/StaffPhoneShell.jsx')
ok(!/go\('\/help'\)|> Help\n/.test(phone) && /> User Manual\n/.test(phone), 'the staff phone menu has User Manual and no Help')
const { accountNav } = await imp('src/pages/Account/accountNav.js')
for (const kind of ['farmer', 'fisherfolk', 'orgFarm', 'orgFish']) {
  const labels = accountNav(kind).more.map((e) => e.label)
  ok(labels.includes('User Manual') && !labels.includes('Help'), `${kind}: More has User Manual and no Help`)
}

// --- the page: one search box at the top, then the guides, the questions and About This System
const body = read('src/pages/Manual/ManualBody.jsx')
const order = ['<ManualSearchBox', 'guides.map((g, i)', '<ManualQuestions', '<AboutSystem']
ok(order.every((part) => body.includes(part)), 'the manual has the search, the guides, the questions and About This System')
ok(order.map((part) => body.indexOf(part)).every((at, i, all) => i === 0 || at > all[i - 1]), 'in that order')
for (const file of ['src/pages/Manual/ManualQuestions.jsx', 'src/pages/Manual/AboutSystem.jsx']) {
  ok(!/type="search"|<input/.test(read(file)), `${file}: no second search box`)
}

// --- every account gets its own questions, and the search finds them
const { questionsFor, faqTarget, ABOUT_TARGET } = await imp('src/pages/Manual/manualFaq.js')
const manual = await imp('src/pages/Manual/manualContent.js')
const { searchManual, manualTargets } = await imp('src/pages/Manual/manualSearch.js')
const asked = (audience) => questionsFor(audience).flatMap((s) => s.items.map((i) => i.q))
for (const { id } of manual.AUDIENCES) {
  ok(asked(id).length >= 5, `${id}: common questions`)
  const guides = manual.manualFor(id)
  const questions = questionsFor(id)
  const targets = new Set(manualTargets(guides, questions))
  const first = questions[0].items[0]
  const hits = searchManual(guides, first.q, { questions, limit: 40 })
  ok(hits.some((h) => h.kind === 'question' && h.target === faqTarget(0, 0)), `${id}: the search finds "${first.q}"`)
  ok(hits.every((h) => targets.has(h.target)), `${id}: every result points at something on the page`)
  const about = searchManual(guides, 'developer', { questions })
  ok(about.some((h) => h.kind === 'about' && h.target === ABOUT_TARGET), `${id}: the search finds About This System`)
}
ok(asked('admin').includes('How do I give someone an account?') && !asked('focal').includes('How do I give someone an account?'), 'staff questions follow the role')
ok(questionsFor('nobody').length === 0, 'an unknown audience has none')

// --- the Quick Guide is gone, and no sentence of a question is repeated in the guides
const content = await imp('src/pages/Help/helpContent.js')
ok(content.STEPS === undefined, 'no Quick Guide steps')
const SCREENS = (await imp('src/pages/Manual/manualScreens.js')).default
const sentences = (text) => String(text).split(/(?<=[.?!])\s+/).map((s) => s.trim().toLowerCase().replace(/\s+/g, ' ')).filter((s) => s.split(' ').length >= 6)
const questionText = new Set(manual.AUDIENCES.flatMap(({ id }) => questionsFor(id).flatMap((s) => s.items.flatMap((i) => [...sentences(i.q), ...sentences(i.a)]))))
ok(questionText.size > 300, 'the questions were read')
const guideText = []
for (const audience of manual.AUDIENCES) {
  for (const guide of manual.manualFor(audience.id)) guideText.push(guide.title, guide.intro, ...guide.steps)
}
for (const screen of Object.values(SCREENS)) { guideText.push(screen.purpose); screen.legend.forEach((row) => guideText.push(row.desc)) }
assert.deepEqual([...new Set(guideText.flatMap(sentences).filter((s) => questionText.has(s)))], [], 'sentences said twice'); n++
const everyStep = manual.AUDIENCES.flatMap((a) => manual.manualFor(a.id).flatMap((g) => g.steps)).join('\n')
ok(!/\bHelp, the User Manual|and Help\b/.test(everyStep), 'the guides no longer send anyone to a Help page')

console.log(`oneManual: ${n} checks passed`)
