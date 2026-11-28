// The topics of Help: for each kind of account, one topic for each page of its menu, in the menu's order, with the pictures of
// that page. The pictures and the numbered explanations under them are made by scripts/manual (shoot.mjs) and live in
// Manual/manualScreens.js. Plain data and rules, so they can be tested without a screen.
//   a topic:  { id, title, about, screens: [picture ids], tip }   or { id, title, about, kind: 'questions' | 'about' }
//   a group of the menu that opens:  { id, title, topics: [topic] }
import SCREENS from '../Manual/manualScreens.js'
import { ABOUT_WORDS, questionsFor } from '../Manual/manualFaq.js'
import { matchesSearch, searchWords } from '../../utils/searchMatch.js'

export const GROUPS = [
  { id: 'admin', label: 'Admin' },
  { id: 'focal', label: 'Focal Person' },
  { id: 'farmer', label: 'Farmer' },
  { id: 'fisherfolk', label: 'Fisherfolk' },
  { id: 'org', label: 'Cooperative' },
]

// Which group an account reads: `role` is ADMIN | EVALUATOR | CITIZEN; the citizen kinds come from who the account is linked to.
export function audienceFor({ role, isFarmer, isFisherfolk, isOrg }) {
  if (role === 'ADMIN') return 'admin'
  if (role === 'EVALUATOR') return 'focal'
  if (isOrg) return 'org'
  if (isFisherfolk) return 'fisherfolk'
  if (isFarmer) return 'farmer'
  return 'admin'
}

const topic = (id, title, about, screens, tip) => ({ id, title, about, screens, tip })
const folder = (id, title, topics) => ({ id, title, topics })
const QUESTIONS = { id: 'questions', title: 'Common questions', about: 'Short answers to what people ask most.', kind: 'questions' }
const ABOUT = { id: 'about', title: 'About This System', about: 'What the system is, the office it serves and who built it.', kind: 'about' }

const PHONE_TIP = 'There is nothing to install: open the same web address in the browser of your phone and sign in.'

// ---------------------------------------------------------------------------------------------------------------- Admin and Focal Person
function staffTopics(focal) {
  return [
    topic('getting-started', 'Getting started', 'Signing in, the menu, the top bar and your own account.',
      ['login', focal ? 'focal-layout' : 'admin-layout', 'admin-profile'],
      'There is no self-registration: the Admin creates every account. If you forget your password, choose Forgot password on the sign-in page.'),
    topic('dashboard', 'Dashboard', 'The totals of the municipality and what needs attention today.', [focal ? 'focal-dashboard' : 'admin-dashboard'],
      'A request to change a farmer\'s, fisherfolk\'s or cooperative\'s details arrives in the bell: open it to approve or reject it.'),
    folder('registration', 'Registration', [
      topic('farmers', 'Farmers', 'Everyone registered as a farmer, their profiles, farm parcels and crops.',
        [focal ? 'focal-farmers' : 'admin-farmers', 'admin-farmers-filters', 'admin-register-farmer', 'admin-farmer-profile', 'admin-farmer-parcels', 'admin-farmer-crop-details', 'admin-farmer-crops'],
        'Each farmer is registered once, with a new RSBSA number. A form you leave keeps its draft; Discard draft clears it.'),
      topic('fisherfolk', 'Fisherfolk', 'Everyone registered as a fisherfolk, their profiles, ponds and stocking records.',
        ['admin-fisherfolk', 'admin-register-fisherfolk', 'admin-fisherfolk-profile', 'admin-fisherfolk-ponds'],
        'Every fisherfolk is registered as Aquaculture. The RSBSA number is required; the FishR and PhilSys numbers are optional.'),
    ]),
    folder('cooperatives', 'Cooperatives', [
      topic('farmers-cooperatives', 'Farmers Cooperatives', 'Each farmers cooperative with its members, officers and equipment.',
        ['admin-organizations', 'admin-org-menu', 'admin-add-organization', 'admin-add-members', 'admin-edit-organization', 'admin-org-detail', 'admin-org-members', 'admin-org-equipment', 'admin-org-confirmed', 'admin-org-officers', 'admin-assign-officer'],
        'A member can hold one officer position at a time: end that term before giving them another.'),
      topic('fisherfolk-cooperatives', 'Fisherfolk Cooperatives', 'The same for the cooperatives of fisherfolk.', ['admin-fisherfolk-orgs'],
        'They work like Farmers Cooperatives, with fisherfolk as members.'),
    ]),
    folder('crop-management', 'Crop Management', [
      topic('crop-records', 'Crop Records', 'Every farm parcel and the crops planted on it.',
        ['admin-crop-records', 'admin-crop-records-grouped', 'admin-parcel-menu', 'admin-add-parcels', 'admin-add-crops', 'admin-add-crops-right', 'admin-edit-parcel'],
        'The crops on a parcel can never be larger than its area; double or triple cropping allows two or three times.'),
      topic('crop-monitoring', 'Crop Monitoring', 'Each crop from planting to harvest.',
        ['admin-crop-monitoring', 'admin-crop-filters', 'admin-crop-monitoring-grouped', 'admin-crop-menu', 'admin-crop-details', 'admin-record-activity', 'admin-record-harvest', 'admin-report-crop-disaster', 'admin-force-harvest'],
        'Record Harvest opens once half of the growing time has passed; point at the grayed button to see why it is closed.'),
    ]),
    folder('fisheries-management', 'Fisheries Management', [
      topic('aquaculture-records', 'Aquaculture Records', 'Every production cycle, and where a new one is started.', ['admin-aquaculture-records', 'admin-start-cycle'],
        'Choosing the fisherfolk fills in their cooperative when they belong to one.'),
      topic('aquaculture-monitoring', 'Aquaculture Monitoring', 'The production cycles of ponds and cages, from stocking to harvest.',
        ['admin-aquaculture', 'admin-aquaculture-filters', 'admin-aquaculture-menu', 'admin-cycle-details'],
        'A row can be harvested once at least half of the expected time has passed.'),
      topic('capture-monitoring', 'Capture Monitoring', 'Fishing trips and their catch.', ['admin-capture', 'admin-capture-log', 'admin-capture-timeline'],
        'Log one trip with a line for each species caught.'),
    ]),
    folder('forecasting', 'Forecasting', [
      topic('crop-forecasting', 'Crop Forecasting', 'The harvest expected from the planted crops, and how the actual harvest compared.',
        ['admin-crop-forecast', 'admin-forecast-details', 'admin-yield-analysis'],
        'The estimate is the area planted times the crop\'s yield per hectare in Crop Settings.'),
      topic('fisheries-forecasting', 'Fisheries Forecasting', 'The same for the production cycles.', ['admin-fisheries-forecast'],
        'Filter by the date stocked to compare one season\'s cycles.'),
    ]),
    folder('assistance', 'Assistance', [
      topic('crop-assistance', 'Crop Assistance', 'Help given to farmers and farmers cooperatives.',
        ['admin-crop-assistance', 'admin-assistance-history', 'admin-assistance-members', 'admin-assistance-filters', 'admin-assistance-import', 'admin-distribute', 'admin-distribute-farmers'],
        'Review Distribution saves nothing: it shows who would be blocked before you confirm.'),
      topic('fisheries-assistance', 'Fisheries Assistance', 'Help given to fisherfolk and fisherfolk cooperatives.', ['admin-fisheries-assistance'],
        'It works like Crop Assistance.'),
    ]),
    folder('disaster', 'Disaster', [
      topic('crop-disaster', 'Crop Disaster', 'The disaster logs of crops, and one form for many parcels at once.',
        ['admin-disaster', 'admin-disaster-filters', 'admin-disaster-detail', 'admin-log-crop-disaster'],
        'Tick Total loss only where a crop was destroyed: it moves to Total Loss.'),
      topic('fisheries-disaster', 'Fisheries Disaster', 'The disaster logs of ponds and cages.',
        ['admin-fisheries-disaster', 'admin-log-fisheries-disaster', 'admin-fisheries-disaster-form'],
        'One form makes a log for each fisherfolk, all together or not at all, and each is notified.'),
    ]),
    topic('reports', 'Reports', 'The official reports: choose one, set its filters and signatories, then print or download it.',
      ['admin-reports', 'admin-report-registered', 'admin-report-individual', 'admin-report-crop', 'admin-report-fisheries-production', 'admin-report-fisheries-disaster', 'admin-report-org-assistance'],
      'What the preview shows is what prints, with the signature lines.'),
    ...(focal ? [] : [folder('admin', 'Admin', [
      topic('crop-settings', 'Crop Settings', 'The lists the crop forms use.', ['admin-crop-settings', 'admin-crop-settings-add', 'admin-crop-settings-edit'],
        'The suggested activities set here fill in Log Activity.'),
      topic('fisheries-settings', 'Fisheries Settings', 'The lists the fisheries forms use.', ['admin-fisheries-settings'],
        'Species set here carry their activity steps into every new cycle.'),
      topic('activity-settings', 'Activity Settings', 'The kinds of crop and fisheries activities.', ['admin-activity-settings'],
        'These are the choices of the activity type boxes.'),
      topic('assistance-settings', 'Assistance Settings', 'Source agencies, assistance types and their units.', ['admin-assistance-settings'],
        'Renaming or removing a name never changes assistance already recorded.'),
      topic('classification-settings', 'Classification Settings', 'The classifications a farm parcel can carry.', ['admin-classification-settings'],
        'A parcel keeps the names it was saved with.'),
      topic('harvest-unit-settings', 'Harvest Unit Settings', 'How many kilograms one harvest unit weighs.', ['admin-harvest-unit-settings'],
        'A harvest counted in sacks or cavans is saved in kilograms using these weights.'),
      topic('users', 'User Management', 'Creating and managing the accounts.', ['admin-users'],
        'A new account must sign in and choose a password within 3 days, or it has to be set up again.'),
      topic('backup', 'Backup & Restore', 'A copy of the whole system, and putting one back.', ['admin-backup', 'admin-restore'],
        'A restore always makes a safety backup first. Keep backup files somewhere safe: they hold personal records.'),
      topic('signatories', 'Signatories', 'The names that sign the reports.', ['admin-signatories'],
        'A signatory saved here can be picked on every report.'),
      topic('audit-log', 'Audit Log', 'Who did what, and when, and the history of one farmer, fisherfolk or cooperative.',
        ['admin-audit-log', 'admin-audit-log-filters', 'admin-audit-log-history'],
        'View history on a row opens everything on record about that farmer, fisherfolk or cooperative.'),
    ])]),
    topic('phone', 'Using it on a phone', 'The same system on a phone.', ['login-phone'], PHONE_TIP),
    QUESTIONS,
  ]
}

// ------------------------------------------------------------------------------------------------ Farmer, Fisherfolk and Cooperative
const SIGN_IN_TIP = 'The first time, you are asked to choose a new password. Do this within 3 days of the office setting up the account.'

const FARMER = [
  topic('getting-started', 'Getting started', 'Signing in, and the menu of your account.', ['login', 'farmer-more'], SIGN_IN_TIP),
  topic('home', 'Home', 'What needs you today, the most urgent first.', ['farmer-home'], 'Press the button on a line to do it there.'),
  topic('crops', 'Crops', 'Every crop the office registered for you.', ['farmer-crops', 'farmer-crop-details'],
    'Did the same work on many crops? Log activity on many crops asks for it once.'),
  topic('assistance', 'Assistance', 'The help recorded for you.', ['farmer-assistance'], 'There is nothing to answer: claim it on the date, at the time and place shown.'),
  topic('disasters', 'Disasters', 'Reporting damage to your crops.', ['farmer-disasters', 'farmer-report-disaster'],
    'One report can cover every crop that was hit, with one set of photos.'),
  topic('forecast', 'Forecast', 'When your crops should be ready.', ['farmer-forecast'], 'Yield analysis shows which activities were missed.'),
  topic('borrow', 'Borrow equipment', 'Asking your cooperative for its equipment.', ['farmer-equipment'],
    'It is there when you belong to a cooperative that lends equipment.'),
  topic('profile', 'My profile', 'What the office has on record about you.', ['farmer-profile'],
    'Some details change at once; a name or barangay change waits for the office.'),
  topic('phone', 'Using it on a phone', 'The same account on a phone.',
    ['login-phone', 'farmer-p-home', 'farmer-p-crops', 'farmer-p-assistance', 'farmer-p-more'], PHONE_TIP),
  QUESTIONS,
]

const FISHERFOLK = [
  topic('getting-started', 'Getting started', 'Signing in to your account.', ['login'], SIGN_IN_TIP),
  topic('home', 'Home', 'What needs you today, the most urgent first.', ['fisherfolk-home'], 'Press the button on a line to do it there.'),
  topic('cycles', 'Cycles', 'Your production cycles, ponds and cages.', ['fisherfolk-cycles', 'fisherfolk-log-choice', 'fisherfolk-cycle-details'],
    'Record harvest opens once half of the culture time has passed.'),
  topic('assistance', 'Assistance', 'The help recorded for you.', ['fisherfolk-assistance'], 'There is nothing to answer: claim it on the date, at the time and place shown.'),
  topic('disasters', 'Disasters', 'Reporting damage to your ponds, cages or stocks.', ['fisherfolk-disasters'],
    'Take the photos with your phone while the damage can still be seen.'),
  topic('forecast', 'Forecast', 'When your cycles should be ready.', ['fisherfolk-forecast'],
    'Yield analysis names possible factors, not proven causes.'),
  topic('profile', 'My profile', 'What the office has on record about you.', ['fisherfolk-profile'],
    'A change to your name or barangay waits for the office.'),
  topic('phone', 'Using it on a phone', 'The same account on a phone.', ['login-phone', 'fisherfolk-p-home', 'fisherfolk-p-cycles', 'fisherfolk-p-disasters'], PHONE_TIP),
  QUESTIONS,
]

const ORG = [
  topic('getting-started', 'Getting started', 'Signing in with the cooperative\'s account.', ['login'], SIGN_IN_TIP),
  topic('home', 'Home', 'What needs the cooperative today.', ['org-home'], 'Each line opens the list where you act.'),
  topic('members', 'Members', 'Everyone in the cooperative.', ['org-members', 'org-add-member'],
    'Log activity records farm work for members who have no activated account.'),
  topic('officers', 'Officers', 'Who holds each position.', ['org-officers'], 'One position for each person: end a term early to free it.'),
  topic('equipment', 'Equipment', 'What the cooperative owns and what is lent.', ['org-equipment', 'org-item-details', 'org-loans'],
    'Only units in Good condition can be lent.'),
  topic('assistance', 'Assistance', 'What the cooperative gave its members.', ['org-assistance', 'org-assistance-members', 'org-distribute-choice'],
    'Nobody confirms receipt. Take off the list anyone who did not claim it.'),
  topic('profile', 'Cooperative profile', 'The cooperative\'s own details.', ['org-profile'],
    'The password is shared by everyone who uses the account: tell your officers before changing it.'),
  topic('phone', 'Using it on a phone', 'The same account on a phone.', ['login-phone', 'org-p-home', 'org-p-members', 'org-p-equipment'], PHONE_TIP),
  QUESTIONS,
]

const TOPICS = { admin: () => staffTopics(false), focal: () => staffTopics(true), farmer: () => FARMER, fisherfolk: () => FISHERFOLK, org: () => ORG }
const SYSTEM = { id: 'system', label: 'This System', topics: [ABOUT] }

// The groups of the topic list an account sees: an Admin every kind of account, anyone else their own. About This System is last.
export function groupsFor(audience) {
  const ids = audience === 'admin' ? GROUPS.map((g) => g.id) : [audience]
  return [...GROUPS.filter((g) => ids.includes(g.id)).map((g) => ({ ...g, topics: TOPICS[g.id]() })), SYSTEM]
}

// Every topic of these groups, in the order of the list. Its `key` is its address: "admin.farmers".
export function flatTopics(groups) {
  return groups.flatMap((g) => g.topics.flatMap((entry) => (entry.topics ? entry.topics.map((t) => ({ ...t, folder: entry.id })) : [entry])
    .map((t) => ({ ...t, group: g.id, key: `${g.id}.${t.id}` }))))
}

// The topic an address names, among those this account sees; for anything else, the first one.
export function findTopic(groups, key) {
  const all = flatTopics(groups)
  return all.find((t) => t.key === key) || all[0]
}

// "?picture=2" of a topic with `count` pictures -> 1; anything unreadable -> the first.
export function pictureIndex(value, count) {
  const number = Number(value)
  return Number.isInteger(number) && number >= 1 && number <= count ? number - 1 : 0
}

export const pictureOf = (id) => ({ id, ...SCREENS[id] })

// "37 topics · admin, focal person, farmer, fisherfolk and cooperative"
export function countLine(groups) {
  const names = groups.filter((g) => g.id !== SYSTEM.id).map((g) => g.label.toLowerCase())
  const listed = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
  return `${flatTopics(groups).length} topics · ${listed}`
}

const screenWords = (screen) => [screen.title, screen.purpose, ...(screen.legend || []).flatMap((row) => [row.label, row.desc])].join(' ')

// Search help: the topics that hold every word typed (in any order, as every search of the system), each with the picture to open:
// the first one if the topic's own words match, else the first picture whose title or numbered explanations do.
export function searchTopics(groups, query) {
  if (!searchWords(query).length) return []
  return flatTopics(groups).flatMap((t) => {
    if (matchesSearch(`${t.title} ${t.about} ${t.tip || ''}`, query)) return [{ key: t.key, picture: 0 }]
    if (t.kind === 'questions') {
      const asked = questionsFor(t.group).some((section) => section.items.some((faq) => matchesSearch(`${faq.q} ${faq.a}`, query)))
      return asked ? [{ key: t.key, picture: 0 }] : []
    }
    if (t.kind === 'about') return matchesSearch(`${t.title} ${ABOUT_WORDS}`, query) ? [{ key: t.key, picture: 0 }] : []
    const picture = t.screens.findIndex((id) => matchesSearch(screenWords(SCREENS[id]), query))
    return picture < 0 ? [] : [{ key: t.key, picture }]
  })
}
