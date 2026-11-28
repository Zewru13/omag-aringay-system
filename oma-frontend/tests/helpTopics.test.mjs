// Help's topics: they follow the menu, each account type sees only its own, every picture is in one, and the search finds them.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'

const here = (p) => new URL(`../${p}`, import.meta.url)
const imp = (p) => import(here(p).href)
const read = (p) => readFileSync(here(p), 'utf8').replace(/\r\n/g, '\n')
const help = await imp('src/pages/Help/helpTopics.js')
const SCREENS = (await imp('src/pages/Manual/manualScreens.js')).default
const { accountNav } = await imp('src/pages/Account/accountNav.js')
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); n++ }

const KINDS = ['admin', 'focal', 'farmer', 'fisherfolk', 'org']
eq(help.GROUPS.map((g) => [g.id, g.label]), [['admin', 'Admin'], ['focal', 'Focal Person'], ['farmer', 'Farmer'], ['fisherfolk', 'Fisherfolk'], ['org', 'Cooperative']], 'the account types')
eq(help.groupsFor('admin').map((g) => g.id), [...KINDS, 'system'], 'an Admin reads every group, and About This System')
for (const kind of ['focal', 'farmer', 'fisherfolk', 'org']) eq(help.groupsFor(kind).map((g) => g.id), [kind, 'system'], `${kind} reads only its own`)

// every topic has a title and one line; a topic with pictures has them all, and a tip
const used = new Set()
for (const kind of KINDS) {
  const flat = help.flatTopics(help.groupsFor(kind).filter((g) => g.id === kind))
  eq(new Set(flat.map((t) => t.key)).size, flat.length, `${kind}: every topic has its own address`)
  for (const topic of flat) {
    ok(topic.title && topic.about, `${topic.key}: a title and one line`)
    if (topic.kind) continue
    ok(topic.screens.length > 0 && topic.tip, `${topic.key}: pictures and a tip`)
    for (const id of topic.screens) {
      ok(SCREENS[id], `${topic.key}: the picture ${id} exists`)
      ok(existsSync(here(`public${SCREENS[id].image}`)), `${topic.key}: its file ${SCREENS[id].image}`)
      used.add(id)
    }
  }
  ok(flat.some((t) => t.kind === 'questions'), `${kind}: common questions`)
}
eq(Object.keys(SCREENS).filter((id) => !used.has(id)), [], 'every picture is in a topic')
ok(help.flatTopics(help.groupsFor('farmer')).some((t) => t.key === 'system.about' && t.kind === 'about'), 'About This System')

// the topics follow the menus
const sidebar = read('src/components/Layout/Sidebar.jsx')
const staffMenu = [...sidebar.slice(0, sidebar.indexOf('ownNav')).matchAll(/\{ (?:key: "[^"]+", )?to: "[^"]+", icon: \w+, label: "([^"]+)" \}/g)].map((m) => m[1])
ok(staffMenu.length >= 25, `the staff menu was read (${staffMenu.length})`)
const titles = (kind) => new Set(help.flatTopics(help.groupsFor(kind)).map((t) => t.title))
for (const label of staffMenu) ok(titles('admin').has(label), `Admin: a topic for "${label}"`)
ok(titles('admin').has('Audit Log'), 'Admin: a topic for the Audit Log (in the account menu)')
const folders = (kind) => help.groupsFor(kind)[0].topics.filter((t) => t.topics).map((t) => t.title)
eq(folders('admin'), ['Registration', 'Cooperatives', 'Crop Management', 'Fisheries Management', 'Forecasting', 'Assistance', 'Disaster', 'Admin'], 'the groups that open, as in the menu')
eq(folders('focal'), ['Registration', 'Cooperatives', 'Crop Management', 'Fisheries Management', 'Forecasting', 'Assistance', 'Disaster'], 'a Focal Person has no Admin pages')
ok(!titles('focal').has('User Management') && !titles('focal').has('Backup & Restore'), 'and no Admin topics')
for (const [kind, nav] of [['farmer', 'farmer'], ['fisherfolk', 'fisherfolk'], ['org', 'orgFarm']]) {
  const entries = accountNav(nav, { isMember: kind === 'farmer' })
  for (const entry of [...entries.main, ...entries.more]) {
    if (['more', 'manual', 'help'].includes(entry.key)) continue
    ok(titles(kind).has(entry.label), `${kind}: a topic for "${entry.label}"`)
  }
}

// the address names one topic; anything else opens the first one
const mine = help.groupsFor('farmer')
eq(help.findTopic(mine, 'farmer.crops').title, 'Crops', 'found by its address')
eq(help.findTopic(mine, 'admin.dashboard').key, 'farmer.getting-started', 'another account type\'s topic is not shown')
eq(help.findTopic(mine, 'nothing').key, 'farmer.getting-started', 'an old or wrong address')
eq(help.findTopic(mine, null).key, 'farmer.getting-started', 'no address')
eq(help.pictureIndex('2', 3), 1, 'the second picture')
for (const wrong of [null, '0', '9', 'x', '-1', '1.5']) eq(help.pictureIndex(wrong, 3), 0, `picture "${wrong}" opens the first`)

// how many, and for whom
eq(help.countLine(help.groupsFor('farmer')), `${help.flatTopics(help.groupsFor('farmer')).length} topics · farmer`, 'a farmer')
eq(help.countLine(help.groupsFor('admin')), `${help.flatTopics(help.groupsFor('admin')).length} topics · admin, focal person, farmer, fisherfolk and cooperative`, 'an admin')

// Search help: the topics that match, each opened on the picture that has the words
const admin = help.groupsFor('admin')
const hits = (query, groups = admin) => help.searchTopics(groups, query)
ok(hits('Backup').some((h) => h.key === 'admin.backup'), 'by title')
const filters = hits('Reset Filters')
ok(filters.length > 0, 'by a button name')
for (const hit of filters) {
  const topic = help.findTopic(admin, hit.key)
  if (topic.kind) continue
  ok(/reset|filters/i.test(JSON.stringify(SCREENS[topic.screens[hit.picture]])) || /reset filters/i.test(`${topic.title} ${topic.about} ${topic.tip}`), `${hit.key}: opens on the picture with it`)
}
eq(hits('zzzz-nothing'), [], 'no match')
eq(hits('   '), [], 'nothing typed')
ok(hits('Backup', mine).length === 0, 'a farmer\'s search stays in a farmer\'s topics')
ok(hits('How do I give someone an account').some((h) => h.key === 'admin.questions'), 'a common question is found')
ok(hits('developer', mine).some((h) => h.key === 'system.about'), 'About This System is found')

// the pictures and their numbered explanations (kept from the old manual's checks)
const all = Object.entries(SCREENS)
for (const [id, screen] of all) {
  ok(screen.title && screen.purpose && screen.legend.length >= 1, `${id}: described and explained`)
  eq(screen.legend.map((row) => row.n), screen.legend.map((_, i) => i + 1), `${id}: the numbers run 1, 2, 3...`)
  ok(screen.legend.every((row) => row.label && row.desc), `${id}: every number says what it is`)
  ok(screen.image.startsWith('/manual/') && statSync(here(`public${screen.image}`)).size > 5000, `${id}: a real picture`)
}
ok(all.filter(([, s]) => s.legend.length >= 5).length >= 60, 'most pictures explain five or more things')
ok(all.reduce((sum, [, s]) => sum + s.legend.length, 0) >= 700, 'hundreds of buttons and fields are explained')
for (const kind of ['farmer', 'fisherfolk', 'org']) {
  const phone = help.flatTopics(help.groupsFor(kind)).find((t) => t.id === 'phone')
  ok(phone.screens.filter((id) => SCREENS[id].phone && id !== 'login-phone').length >= 3, `${kind}: phone pictures`)
}
const equipment = help.findTopic(help.groupsFor('org'), 'org.equipment')
ok(equipment.screens.includes('org-loans') && /Items \/ Loans/.test(SCREENS['org-equipment'].legend.map((r) => r.label).join(' ')), 'the cooperative\'s Equipment shows Items, Loans')

// every picture a topic shows is one the screenshot tool can take again; the words of the citizen topics name today's pages
const { SCREENS: SPECS } = await imp('scripts/manual/screens.mjs')
const specs = new Set(SPECS.map((s) => s.id))
for (const kind of KINDS) {
  for (const t of help.flatTopics(help.groupsFor(kind))) for (const id of t.screens || []) ok(specs.has(id), `${t.key}: the screenshot tool takes ${id}`)
}
const GONE = ['My Organization', 'Crop Monitoring', 'Fisheries Monitoring', 'Aquaculture Monitoring', 'Borrowed History', 'Borrowed tab', 'Distribute to Individual', 'Distribute to All Members', 'My Logged Disasters', 'Open crop']
for (const kind of ['farmer', 'fisherfolk', 'org']) {
  const words = help.flatTopics(help.groupsFor(kind).filter((g) => g.id === kind)).map((t) => `${t.title} ${t.about} ${t.tip || ''}`).join(' ')
  for (const gone of GONE) ok(!words.includes(gone), `${kind}: no topic names "${gone}", which is gone`)
}

console.log(`helpTopics: ${n} checks passed`)
