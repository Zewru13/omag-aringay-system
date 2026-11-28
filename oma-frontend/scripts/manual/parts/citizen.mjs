// Screens of the Farmer, Fisherfolk and Cooperative accounts on a computer (the phone pictures are in phone.mjs). They show the account
// pages of pages/Account: the five-entry menu (Home, then the account's lists, More), a heading and one line under it, the list (rows on a
// phone, a table on a computer) and the existing windows the buttons open.
import { FA, FI, O, click, SIDEBAR, MENU_TOGGLE } from './common.mjs'

const H1 = { css: 'main h1' }
const HELPER = { css: 'main h1 + p' }
const SEARCH = { css: 'main input[type=search]' }
const TABLE_HEAD = { css: 'main thead' }
const ROW1 = { css: 'main tbody tr:not(:has(th))', nth: 0 }
const SECTION_ROW = { css: 'main tbody th[scope=colgroup]', nth: 0 }
const WINDOW = { css: '.modal-content' }
const btn = (text, nth = 0) => ({ text, tag: 'button, a', exact: true, nth })

const MENU = (entries) => ({ find: SIDEBAR, label: 'Menu', desc: `${entries} More holds the other pages of your account. The page you are on is highlighted.` })
const MENU_BTN = { find: MENU_TOGGLE, label: 'Menu button', desc: 'Hides the left menu to give the page more room, or shows it again.' }
const TOP = { find: { css: 'button[aria-label="Open account menu"]', up: 2 }, label: 'Bell and your name', desc: 'The bell lists your notices. Your name opens your profile; the arrow beside it opens a short menu with Help and Logout.' }
const TITLE = (desc) => ({ find: [H1, HELPER], label: 'Page heading', desc })
const SEARCH_BOX = (what) => ({ find: SEARCH, label: 'Search box', desc: `Type to narrow the list to ${what}. The words can be in any order.` })
const SECTIONS = (desc) => ({ find: SECTION_ROW, label: 'Sections', desc })
const STATUS_BADGE = { find: { css: 'main tbody tr:not(:has(th)) td:last-child', nth: 0 }, label: 'Status', desc: 'Scheduled means claim it on that date, at that time and place. After that time it shows as Received. There is nothing for you to press.' }
const COLUMNS = (desc) => ({ find: TABLE_HEAD, label: 'Columns', desc })
const TODO = { find: { text: 'To do today', tag: 'h2', closest: 'section' }, label: 'To do today', desc: 'Only what needs you now, the most urgent first. Each line has the button that does it.' }
const SUMMARY = { find: { text: 'Summary', tag: 'h2', closest: 'section' }, label: 'Summary', desc: 'Three figures. A dash means that figure could not be read; Try again at the top reloads it.' }

const PROFILE = (who) => [
  { find: { css: 'main section', nth: 0 }, label: 'Your name and picture', desc: `${who}. Change photo (or Change logo) replaces the picture at once.` },
  { find: { css: 'main section', nth: 1 }, label: 'Details you can change', desc: 'Edit saves at once. Request change sends the new value to the office, and the row shows Waiting for approval until it is decided.' },
  { find: { css: 'main section', nth: 2 }, label: 'Fixed details', desc: 'The padlock means only the office can correct it.' },
  { find: { text: 'Your change requests', tag: 'h2', closest: 'section' }, label: 'Your change requests', desc: 'Everything you asked to change: what it was, what you asked for, and whether it was approved or rejected (with the reason).' },
  { find: [btn('Change password'), btn('Log out')], label: 'Password and Log out', desc: 'Change password asks for the current one and the new one twice. Log out asks first.' },
]

export const CITIZEN = [
  // ───────────────────────────── Farmer ─────────────────────────────
  FA({ id: 'farmer-home', file: 'farmer/home.png', url: '/my-account', wait: 7000, height: 1300, title: 'Home (Farmer)', purpose: 'What needs you today, then your crops.',
    callouts: [
      MENU('Home, Crops, Assistance and Disasters.'), MENU_BTN, TOP,
      TITLE('Your name, the kind of account and today\'s date.'),
      TODO,
      { find: { css: 'main li button, main li a', nth: 0 }, label: 'The button of a to-do', desc: 'View assistance opens your Assistance page. Log activity and Record harvest open that form right here. View loan opens Borrow equipment.' },
      { find: { text: 'My crops', tag: 'h2', closest: 'section' }, label: 'My crops', desc: 'The crops still in the field, each with Details.' },
      SUMMARY,
    ] }),
  FA({ id: 'farmer-crops', file: 'farmer/crops.png', url: '/crop-monitoring', wait: 6000, title: 'Crops (Farmer)', purpose: 'Every crop the office has on record for you.',
    callouts: [
      TITLE('My crops: the list the office keeps for you.'),
      SEARCH_BOX('a crop or a place'),
      COLUMNS('The crop and variety, the area in hectares, the place, the dates and the status. A red triangle beside the status means a disaster is still open on it.'),
      SECTIONS('Growing, Ready to harvest, Harvested and Lost, each with how many.'),
      { find: btn('Log activity'), label: 'Log activity', desc: 'Records what you did on the crop. The form starts with the activity that is due.' },
      { find: btn('Log activity on many crops'), label: 'Log activity on many crops', desc: 'The same work done on several crops: choose the activity and the date once, tick the crops, and it is saved on every one of them.' },
      { find: btn('Details'), label: 'Details', desc: 'Everything about the crop, with its own buttons (see the next picture).' },
    ] }),
  FA({ id: 'farmer-crop-details', file: 'farmer/crop-details.png', url: '/crop-monitoring', wait: 6000, js: click('Details'), after: 2500, height: 900, title: 'Crop details (Farmer)', purpose: 'One crop: its facts, its history and what you can do with it.',
    callouts: [
      { find: WINDOW, label: 'Crop details', desc: 'The crop, its parcel, its dates and how far it has grown, then its activities, disasters and remarks.' },
      { find: ['Log Activity', 'Record Harvest', 'Force Harvest', 'Report Disaster'].map((name) => ({ ...btn(name), in: '.modal-content' })), label: 'Buttons', desc: 'Log Activity records work done on the crop. Record Harvest opens once half of the growing time has passed; before that it says when. Force Harvest harvests early when a storm or flood is coming. Report Disaster is not offered for a harvested crop.' },
    ] }),
  FA({ id: 'farmer-assistance', file: 'farmer/assistance.png', url: '/crop-assistance', wait: 6000, title: 'Assistance (Farmer)', purpose: 'Help recorded for you.',
    callouts: [
      TITLE('Help recorded for you by the office or your cooperative.'),
      SEARCH_BOX('one kind of assistance'),
      COLUMNS('What was given, how much, from which agency, the date, time and place, and the status.'),
      SECTIONS('Scheduled first: what you can still claim. History is what has passed.'),
      STATUS_BADGE,
    ] }),
  FA({ id: 'farmer-disasters', file: 'farmer/disasters.png', url: '/disaster', wait: 6000, title: 'Disasters (Farmer)', purpose: 'Damage you reported, ongoing first.',
    callouts: [
      TITLE('Every disaster you reported on your crops.'),
      { find: btn('Report a disaster'), label: 'Report a disaster', desc: 'Starts a new report (see the next picture).' },
      COLUMNS('The disaster, the crop, the date, the area affected and the status.'),
      SECTIONS('Ongoing, then Recovered. An ongoing report also has Mark recovered.'),
      { find: btn('Details'), label: 'Details', desc: 'The report as it was saved, with Print and Download.' },
    ] }),
  FA({ id: 'farmer-report-disaster', file: 'farmer/report-disaster.png', url: '/disaster', wait: 6000, js: click('Report a disaster'), after: 2000, title: 'Report a disaster (Farmer)', purpose: 'First choose the crops that were hit.',
    callouts: [
      { find: WINDOW, label: 'Choose the crops', desc: 'Tick each crop that was damaged (Select all ticks them all), then Continue. The second window asks for the type, the date, the damage and photos, once for all of them.' },
    ] }),
  FA({ id: 'farmer-forecast', file: 'farmer/forecast.png', url: '/forecasting', wait: 6000, title: 'Forecast (Farmer)', purpose: 'When each crop should be ready, and how past harvests compared.',
    callouts: [
      { find: [btn('Forecast'), btn('Yield analysis')], label: 'Forecast / Yield analysis', desc: 'Forecast is the list below. Yield analysis compares what you harvested with the estimate, and lists activities that were missed.' },
      COLUMNS('The expected harvest (with the days left), the estimated yield, then once harvested: the day and the yield.'),
      { find: SECTION_ROW, label: 'Growing / Harvested', desc: 'A harvested crop shows the difference from its estimate: green when more, red when less.' },
      { find: btn('Details'), label: 'Details', desc: 'How the estimate was made, and the office\'s remarks.' },
    ] }),
  FA({ id: 'farmer-equipment', file: 'farmer/equipment.png', url: '/my-equipment', wait: 6000, title: 'Borrow equipment (Farmer)', purpose: 'Equipment your cooperative lends, under More.',
    callouts: [
      { find: { text: 'Available to borrow', tag: 'h3, h2, p', up: 1 }, label: 'Available to borrow', desc: 'Your cooperative\'s equipment with units free now. Open one to ask for it: how many units and when you will return it.' },
      { find: { text: 'My loans', tag: 'h3, h2, p', up: 1 }, label: 'My loans', desc: 'What you asked for or borrowed, and its status. Cancel request, or I returned it when you bring it back.' },
    ] }),
  FA({ id: 'farmer-more', file: 'farmer/more.png', url: '/more', wait: 5000, title: 'More (Farmer)', purpose: 'The rest of your account.',
    callouts: [
      { find: { css: 'main ul' }, label: 'Pages', desc: 'Forecast, Borrow equipment (when you belong to a cooperative), My profile, Help, and Log out.' },
    ] }),
  FA({ id: 'farmer-profile', file: 'farmer/profile.png', url: '/my-profile', wait: 6000, height: 1600, title: 'My profile (Farmer)', purpose: 'What the office has on record about you.',
    callouts: PROFILE('Your name, Farmer, and your RSBSA number') }),

  // ───────────────────────────── Fisherfolk ─────────────────────────────
  FI({ id: 'fisherfolk-home', file: 'fisherfolk/home.png', url: '/my-account', wait: 7000, height: 900, title: 'Home (Fisherfolk)', purpose: 'What needs you today, then your cycles.',
    callouts: [
      MENU('Home, Cycles, Assistance and Disasters.'), MENU_BTN, TOP,
      TITLE('Your name, the kind of account and today\'s date.'),
      TODO,
      { find: { text: 'My cycles', tag: 'h2', closest: 'section' }, label: 'My cycles', desc: 'The cycles still in the water, each with Details.' },
      SUMMARY,
    ] }),
  FI({ id: 'fisherfolk-cycles', file: 'fisherfolk/cycles.png', url: '/fisheries-monitoring', wait: 6000, title: 'Cycles (Fisherfolk)', purpose: 'Your production cycles, ponds and cages.',
    callouts: [
      TITLE('My cycles: every production cycle of yours.'),
      { find: btn('Start a cycle'), label: 'Start a cycle', desc: 'A new production cycle: the species, the culture system, the ponds or cages and the fingerlings stocked.' },
      COLUMNS('The species and cycle number, the ponds and cages, the place, the dates and the status.'),
      SECTIONS('Growing, Ready to harvest, Harvested and Lost.'),
      { find: btn('Log activity'), label: 'Log activity', desc: 'Asks which log first: the Feeding Log or the Health Log.' },
      { find: btn('Log on many cycles'), label: 'Log on many cycles', desc: 'The same feeding or the same observation in several cycles: fill it in once, tick the cycles (or their ponds and cages) and it is saved on all of them.' },
      { find: btn('Details'), label: 'Details', desc: 'The cycle with its ponds and cages (see the next picture).' },
    ] }),
  FI({ id: 'fisherfolk-log-choice', file: 'fisherfolk/log-choice.png', url: '/fisheries-monitoring', wait: 6000, js: click('Log activity'), after: 1500, title: 'Which log (Fisherfolk)', purpose: 'Log activity asks first.',
    callouts: [
      { find: WINDOW, label: 'Feeding Log or Health Log', desc: 'Feeding: the feed and how much. Health: sick or dead fish, water problems and treatment. A Health Log of deaths or disease can allow an early harvest.' },
    ] }),
  FI({ id: 'fisherfolk-cycle-details', file: 'fisherfolk/cycle-details.png', url: '/fisheries-monitoring', wait: 6000, js: click('Details'), after: 3000, height: 900, title: 'Cycle details (Fisherfolk)', purpose: 'One cycle and everything you can do with it.',
    callouts: [
      { find: WINDOW, label: 'Cycle details', desc: 'The cycle, its ponds or cages (size, fingerlings, PCIC) and its totals.' },
      { find: [btn('Activity logs'), btn('Edit'), btn('Print')], label: 'Buttons', desc: 'Activity logs lists every feeding and health entry. Edit corrects the cycle. Print makes a one-page report of it.' },
      { find: btn('Force harvest'), label: 'Force harvest', desc: 'For an emergency (a typhoon coming, for example): harvest now, with the reason.' },
    ] }),
  FI({ id: 'fisherfolk-assistance', file: 'fisherfolk/assistance.png', url: '/fisheries-assistance', wait: 6000, title: 'Assistance (Fisherfolk)', purpose: 'Help recorded for you.',
    callouts: [
      TITLE('Help recorded for you by the office or your cooperative.'),
      COLUMNS('What was given, how much, from which agency, the date, time and place, and the status.'),
      SECTIONS('Scheduled first: what you can still claim. History is what has passed.'),
      STATUS_BADGE,
    ] }),
  FI({ id: 'fisherfolk-disasters', file: 'fisherfolk/disasters.png', url: '/disaster', wait: 7000, title: 'Disasters (Fisherfolk)', purpose: 'Damage you reported on your ponds and cages.',
    callouts: [
      TITLE('Every disaster you reported.'),
      { find: btn('Report a disaster'), label: 'Report a disaster', desc: 'Opens the report: the date and type, the ponds or cages hit, the fish lost, equipment damage and photos.' },
      COLUMNS('The disaster, the stock it hit, the date, the volume lost and the status.'),
      SECTIONS('Ongoing, then Recovered.'),
      { find: btn('Details'), label: 'Details', desc: 'The report as it was saved, with Print and Download.' },
    ] }),
  FI({ id: 'fisherfolk-forecast', file: 'fisherfolk/forecast.png', url: '/fisheries-forecasting', wait: 6000, title: 'Forecast (Fisherfolk)', purpose: 'When each cycle should be ready, and how past harvests compared.',
    callouts: [
      { find: [btn('Forecast'), btn('Yield analysis')], label: 'Forecast / Yield analysis', desc: 'Forecast is the list below. Yield analysis compares harvests with their estimate and names the feeding and health logs behind them.' },
      COLUMNS('The expected harvest (with the days left), the estimated harvest in kg, then once harvested: the day and the kilos.'),
      { find: btn('Details'), label: 'Details', desc: 'How the estimate was made.' },
    ] }),
  FI({ id: 'fisherfolk-profile', file: 'fisherfolk/profile.png', url: '/my-profile', wait: 6000, height: 1300, title: 'My profile (Fisherfolk)', purpose: 'What the office has on record about you.',
    callouts: PROFILE('Your name, Fisherfolk, and your RSBSA number') }),

  // ───────────────────────────── Cooperative ─────────────────────────────
  O({ id: 'org-home', file: 'org/home.png', url: '/my-account', wait: 7000, title: 'Home (Cooperative)', purpose: 'What needs your cooperative today.',
    callouts: [
      MENU('Home, Members, Assistance and Equipment.'), MENU_BTN, TOP,
      TITLE('The cooperative\'s name, the kind of account and today\'s date.'),
      TODO,
      SUMMARY,
    ] }),
  O({ id: 'org-members', file: 'org/members.png', url: '/my-organization', wait: 6000, title: 'Members (Cooperative)', purpose: 'Everyone in your cooperative.',
    callouts: [
      TITLE('Members: active first, then those no longer active.'),
      { find: btn('Log activity'), label: 'Log activity', desc: 'For members who have no activated account: choose the work and the date once, tick their crops (cycles for a fisherfolk cooperative), and it is saved on each.' },
      { find: [btn('Add member'), btn('Import')], label: 'Add member / Import', desc: 'Add member finds registered people by name, several at a time. Import adds many from a spreadsheet (download its template first).' },
      SEARCH_BOX('a member, an RSBSA number or a position'),
      COLUMNS('The name, the RSBSA number, the position, the date joined and whether this is the person\'s main cooperative.'),
      SECTIONS('Active and Inactive.'),
    ] }),
  O({ id: 'org-add-member', file: 'org/add-member.png', url: '/my-organization', wait: 6000, js: click('Add member'), after: 1500, title: 'Add member (Cooperative)', purpose: 'Only registered farmers or fisherfolk can be added.',
    callouts: [
      { find: WINDOW, label: 'Add member', desc: 'Search a name and pick the person, then search for the next and pick again: everyone picked is listed under Members to Add. Choose the date joined and add them all together. Someone already in another cooperative is shown, and can belong to both.' },
    ] }),
  O({ id: 'org-equipment', file: 'org/equipment.png', url: '/my-organization?tab=equipment', wait: 6000, title: 'Equipment (Cooperative)', purpose: 'What your cooperative owns, and what it lends.',
    callouts: [
      { find: [btn('Lend equipment'), btn('Import'), btn('Add equipment')], label: 'Buttons', desc: 'Lend equipment records units lent to several members at once. Import adds equipment from a spreadsheet. Add equipment adds one.' },
      { find: { css: 'main [role=tablist]' }, label: 'Items / Loans', desc: 'Items is what you own. Loans lists requests and loans; its number is how many requests wait.' },
      COLUMNS('The equipment, its units, their condition, how many are out and how many can be lent now.'),
      { find: btn('Details'), label: 'Details', desc: 'The units by condition, each with Change condition, Record repair, Lend, History and Remove.' },
    ] }),
  O({ id: 'org-item-details', file: 'org/item-details.png', url: '/my-organization?tab=equipment', wait: 6000, js: click('Details'), after: 1500, title: 'An item\'s details (Cooperative)', purpose: 'One kind of equipment, by condition.',
    callouts: [
      { find: WINDOW, label: 'By condition', desc: 'Each condition opens onto its units: how many are out, who has them, and its buttons. Only units in Good condition can be lent.' },
    ] }),
  O({ id: 'org-loans', file: 'org/loans.png', url: '/my-organization?tab=borrowed', wait: 6000, title: 'Loans (Cooperative)', purpose: 'Borrow requests, what is out, and what came back.',
    callouts: [
      COLUMNS('The equipment, who borrowed it, the units, the dates and the status. The rows come in sections: Requests, On loan (overdue ones first) and Returned.'),
      { find: [btn('Approve'), btn('Reject')], label: 'Approve / Reject', desc: 'Your answer to a member\'s request. Reject asks for the reason, which the member sees.' },
      { find: btn('Mark returned'), label: 'Mark returned', desc: 'When units come back: returned, damaged or never returned.' },
    ] }),
  O({ id: 'org-officers', file: 'org/officers.png', url: '/my-organization?tab=officers', wait: 6000, title: 'Officers (Cooperative)', purpose: 'Who holds each position now, under More.',
    callouts: [
      { find: [btn('Officer history'), btn('Assign officer')], label: 'Officer history / Assign officer', desc: 'Officer history lists everyone who held a position. Assign officer gives a free position to an active member.' },
      COLUMNS('The officer, the position, the term, and whether the officer is a member (one who is not cannot receive assistance through you).'),
      { find: btn('End term early'), label: 'End term early', desc: 'Ends a term before its date, with the reason, so the position can be given again.' },
    ] }),
  O({ id: 'org-assistance', file: 'org/assistance.png', url: '/crop-assistance', wait: 6000, title: 'Assistance (Cooperative)', purpose: 'Assistance your cooperative gave its members.',
    callouts: [
      { find: btn('Distribute assistance'), label: 'Distribute assistance', desc: 'Records new assistance. It asks first whether it goes to one member or to all members.' },
      { find: { css: 'main [role=tablist]' }, label: 'Scheduled / History', desc: 'Scheduled is what members can still claim. History is what has passed, with Earlier confirmations under it.' },
      { find: { css: 'main input[placeholder^="Search member"]' }, label: 'Search member', desc: 'Type a member\'s name to find the assistance given to that person.' },
      { find: { text: 'Filters', tag: 'button' }, label: 'Filters', desc: 'Narrows the list by status, kind of assistance, source agency and dates.' },
      { find: { css: 'main table thead' }, label: 'Columns', desc: 'The date, time and place, what was given and by which agency, how much, how many members, and the status.' },
      { find: { css: 'main table tbody tr', nth: 0 }, label: 'One distribution', desc: 'One row for each time you gave assistance. Click the row to see its members (next picture).' },
    ] }),
  O({ id: 'org-assistance-members', file: 'org/assistance-members.png', url: '/crop-assistance', wait: 6000, js: `document.querySelector('main table tbody tr').click()`, after: 1200, title: 'A distribution\'s members (Cooperative)', purpose: 'Who is on the list of one distribution.',
    callouts: [
      { find: { css: '[aria-label="Members in this distribution"]' }, label: 'Members', desc: 'Everyone who was given this assistance, each with a status. Nobody has to confirm anything.' },
      { find: { text: 'Remove from the list', tag: 'button', exact: true }, label: 'Remove from the list', desc: 'Takes off a member who did not claim it.' },
    ] }),
  O({ id: 'org-distribute-choice', file: 'org/distribute-choice.png', url: '/crop-assistance', wait: 6000, js: click('Distribute assistance'), after: 1500, title: 'Distribute assistance (Cooperative)', purpose: 'Who receives it?',
    callouts: [
      { find: WINDOW, label: 'One member or all members', desc: 'Give to one member: pick the members by name. Give to all members: every current member gets the same. Both then ask what is given, by which agency, and the date, time and place to claim it.' },
    ] }),
  O({ id: 'org-profile', file: 'org/profile.png', url: '/my-profile', wait: 6000, height: 1400, title: 'Cooperative profile', purpose: 'Your cooperative\'s details and account.',
    callouts: PROFILE('The cooperative\'s name and logo, and its registration number') }),
]

