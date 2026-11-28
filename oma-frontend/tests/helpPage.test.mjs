// The Help page works like BasaJuan's: one topic at a time, the topic list on the right with Search help, one picture at a time
// with Enlarge, arrows and dots, one numbered list and one tip. It is the only help page, and it is called Help everywhere.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const here = (p) => new URL(`../${p}`, import.meta.url)
const read = (p) => readFileSync(here(p), 'utf8').replace(/\r\n/g, '\n')
const imp = (p) => import(here(p).href)
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }

const page = read('src/pages/Help/HelpPage.jsx')
const list = read('src/pages/Help/HelpTopicList.jsx')
const view = read('src/pages/Help/HelpTopicView.jsx')
const picture = read('src/pages/Help/HelpPicture.jsx')

// --- the page
ok(page.includes('title="Help"') && />Help<\/h2>/.test(page) && page.includes('countLine('), 'called Help, with how many topics and for whom')
ok(page.includes('useSearchParams') && page.includes("get('topic')") && page.includes("get('picture')"), 'each topic and picture has its own address')
ok(page.includes('findTopic(') && page.includes('pictureIndex('), 'a wrong address still shows a topic')
ok(page.includes('<HelpTopicList') && page.includes('<HelpTopicView') && page.indexOf('<HelpTopicView') < page.indexOf('<aside'), 'the topic on the left, the list on the right')
ok(/Topics\s*<\/button>/.test(page) && page.includes('lg:hidden'), 'a Topics button on a phone')
ok(!/Print|window\.print/.test(page + list + view + picture), 'no Print / Save as PDF')

// --- the list
ok(list.includes('placeholder="Search help"') && list.includes('searchTopics('), 'Search help')
ok(list.includes('No topic matches'), 'a search with no match says so')
ok(list.includes('overflow-y-auto') && /max-h-/.test(list), 'its own scrollbar')
ok(list.includes('ChevronRight') && list.includes('ChevronDown') && list.includes('aria-expanded'), 'arrows, and groups that open')
ok(list.includes('aria-current'), 'the open topic is marked')
ok(list.includes('uppercase'), 'headed by account type')

// --- the topic
ok(view.includes('<HelpPicture') && view.includes('legend.map(') && view.includes('Lightbulb') && view.includes('topic.tip'), 'pictures, one numbered list and one tip')
ok(view.includes("topic.kind === 'questions'") && view.includes('<ManualQuestions') && view.includes("topic.kind === 'about'") && view.includes('<AboutSystem'), 'common questions and About This System are topics')
ok(!/How to use this page|About this guide|How to read the pictures/.test(view + page), 'no extra sections')

// --- the picture
ok(picture.includes('Enlarge'), 'Enlarge')
ok(picture.includes('count > 1 &&') && picture.includes('Previous picture') && picture.includes('Next picture'), 'arrows only when there are several')
ok(picture.includes('{index + 1} of {count}'), '"1 of 3"')
ok(picture.includes('onTouchStart') && picture.includes('onTouchEnd'), 'swipe on a phone')
ok(picture.includes("'Escape'") && picture.includes('createPortal') && picture.includes('Zoom in'), 'Enlarge fills the screen, zooms, and Escape closes it')

// --- the old manual is gone
for (const gone of ['ManualPage.jsx', 'ManualBody.jsx', 'ManualSearchBox.jsx', 'manualSearch.js', 'manualPrint.js', 'manualContent.js']) {
  ok(!existsSync(here(`src/pages/Manual/${gone}`)), `${gone} is gone`)
}

// --- one menu entry, called Help, at /help
const app = read('src/App.jsx')
ok(/path="\/help"\s+element=\{\s*<ProtectedRoute[\s\S]{0,200}?<HelpPage \/>/.test(app), '/help is the page')
for (const old of ['/manual', '/my-help']) ok(new RegExp(`path="${old}" element=\\{<Navigate to="/help" replace />\\}`).test(app), `${old} leads to Help`)
const navbar = read('src/components/Layout/Navbar.jsx')
ok(navbar.includes('to="/help"') && /\n\s+Help\n/.test(navbar) && !/User Manual/.test(navbar), 'the account menu says Help')
const phone = read('src/components/Layout/StaffPhoneShell.jsx')
ok(phone.includes("go('/help')") && /> Help\n/.test(phone) && !/User Manual/.test(phone), 'the staff phone menu too')
const { accountNav, activeNavKey } = await imp('src/pages/Account/accountNav.js')
for (const kind of ['farmer', 'fisherfolk', 'orgFarm', 'orgFish']) {
  const entry = accountNav(kind).more.find((e) => e.key === 'help')
  ok(entry && entry.label === 'Help' && entry.to === '/help', `${kind}: More has Help`)
}
ok(activeNavKey(accountNav('farmer'), '/help') === 'more', 'Help is under More')
for (const file of ['src/App.jsx', 'src/pages/Account/MoreScreen.jsx', 'src/pages/Citizen/FarmerChrome.jsx', 'src/pages/Citizen/CitizenPhoneShell.jsx', 'src/pages/Account/accountNav.js', 'src/pages/Account/helpAnswers.js', 'src/pages/Help/helpContent.js']) {
  ok(!/User Manual/.test(read(file)), `${file}: no "User Manual" is left`)
}

// --- the questions
const { questionsFor } = await imp('src/pages/Manual/manualFaq.js')
const asked = (audience) => questionsFor(audience).flatMap((s) => s.items.map((i) => i.q))
for (const audience of ['admin', 'focal', 'farmer', 'fisherfolk', 'org']) ok(asked(audience).length >= 5, `${audience}: common questions`)
ok(asked('admin').includes('How do I give someone an account?') && !asked('focal').includes('How do I give someone an account?'), 'staff questions follow the role')
ok(questionsFor('nobody').length === 0, 'an unknown audience has none')

console.log(`helpPage: ${n} checks passed`)
