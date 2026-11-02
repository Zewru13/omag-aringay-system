// Phone-size pictures (390 x 844) of the Farmer, Fisherfolk and Organization accounts, with the sign-in page.
import { FA, FI, O, click, wait } from './common.mjs'

const CARD = 'section, article, [class*="rounded-xl"], [class*="rounded-[1"]'
const card = (text, tag = 'h2') => ({ text, tag, closest: CARD })
const NAV = { css: 'nav', nth: 0 }
const HEAD = { find: [{ css: 'button[aria-label*="otification"]' }, { css: 'header button[aria-haspopup=menu]' }], label: 'Bell and account', desc: 'The bell shows your notices. Your initials open the account menu: your profile, the User Manual and Log out.' }
const SEARCH = { find: { css: 'input[type=search]' }, label: 'Search box', desc: 'Type to find an item in the list.' }
const BOTTOM = (items) => ({ find: NAV, label: 'Bottom menu', desc: `${items} Tap one to open it; the open one is highlighted.` })
const phoneMenu = "document.querySelector('header button[aria-haspopup=menu]').click()"

export const PHONE = [
  { id: 'login', audience: 'all', anon: true, file: 'login.png', url: '/login', wait: 3500, title: 'Sign in', purpose: 'Every account signs in here.',
    callouts: [
      { find: { css: '#login-email' }, label: 'Email or username', desc: 'The username or email the office gave you.' },
      { find: { css: '#login-password' }, label: 'Password', desc: 'Your password. There is no self-registration: the Office of the Municipal Agriculturist creates your account.' },
      { find: { css: 'button[aria-label="Show password"]' }, label: 'Show password', desc: 'Shows or hides what you typed, to check it.' },
      { find: { text: 'Sign in', tag: 'button', exact: true }, label: 'Sign in', desc: 'Opens your account. It stays disabled until both boxes are filled.' },
      { find: { text: "Can't sign in?", tag: 'p' }, label: 'Help signing in', desc: 'Ask the Office of the Municipal Agriculturist to check your account or to reset a forgotten password.' },
    ] },
  { id: 'login-phone', audience: 'all', anon: true, phone: true, file: 'login-phone.png', url: '/login', wait: 3500, title: 'Sign in on a phone', purpose: 'The same page at phone size.',
    callouts: [
      { find: { css: '#login-email' }, label: 'Email or username', desc: 'The username or email the office gave you.' },
      { find: { css: '#login-password' }, label: 'Password', desc: 'Your password.' },
      { find: { css: 'button[aria-label="Show password"]' }, label: 'Show password', desc: 'The eye shows or hides what you typed.' },
      { find: { text: 'Sign in', tag: 'button', exact: true }, label: 'Sign in', desc: 'Opens your account.' },
    ] },

  // ───────────────────────────── Farmer ─────────────────────────────
  FA({ id: 'farmer-p-home', phone: true, file: 'farmer/phone-home.png', url: '/my-account', wait: 6000, height: 1750, title: 'Home on a phone (Farmer)', purpose: 'The same Home on a phone, with the menu along the bottom.',
    callouts: [
      HEAD,
      { find: { text: 'Welcome', tag: 'h1, h2, p, div', up: 1 }, label: 'Welcome banner', desc: 'Your name, the kind of account and the date.' },
      { find: { text: 'Farm parcels', tag: 'p, span, div', up: 2 }, label: 'Totals', desc: 'Your farm parcels, active crops, total area and harvests this month.' },
      { find: card('My crops by stage'), label: 'My crops by stage', desc: 'A ring of your crops by stage (growing, harvested).' },
      { find: card('Harvest vs estimate'), label: 'Harvest vs estimate', desc: 'Your latest harvests against the estimate, in kg.' },
      { find: card('Disasters by type'), label: 'Disasters by type', desc: 'The disasters you reported, by type.' },
      BOTTOM('Home, Monitoring, Disaster, Forecasting and Assistance.'),
    ] }),
  FA({ id: 'farmer-p-menu', phone: true, file: 'farmer/phone-menu.png', url: '/my-account', wait: 6000, js: phoneMenu, after: 1000, title: 'Account menu on a phone (Farmer)', purpose: 'Opened with your initials at the top right.',
    callouts: [
      { find: { text: 'My Profile', tag: 'button, a' }, label: 'My Profile', desc: 'Opens your profile: your details, your photo and your password.' },
      { find: { text: 'User Manual', tag: 'button, a' }, label: 'User Manual', desc: 'Opens this manual and the quick guide and frequently asked questions.' },
      { find: { text: 'Log out', tag: 'button, a' }, label: 'Log out', desc: 'Signs you out of this device.' },
    ] }),
  FA({ id: 'farmer-p-crops', phone: true, file: 'farmer/phone-crops.png', url: '/crop-monitoring', wait: 5000, title: 'Crop Monitoring on a phone (Farmer)', purpose: 'Your parcels and crops as cards.',
    callouts: [
      SEARCH,
      { find: { text: 'Filters', tag: 'button', exact: true }, label: 'Filters', desc: 'Opens the filter row. Print Report and Download Report are in the row above.' },
      { find: { css: 'main button[aria-expanded]', nth: 0 }, label: 'A parcel card', desc: 'Tap a parcel to open the crops planted on it. Each crop has its own menu with Record Activity, View Crop Details, Record Harvest and Report Disaster.' },
      BOTTOM('Home, Monitoring, Disaster, Forecasting and Assistance.'),
    ] }),
  FA({ id: 'farmer-p-disaster', phone: true, file: 'farmer/phone-disaster.png', url: '/disaster', wait: 5000, title: 'Disaster on a phone (Farmer)', purpose: 'Report a disaster from the field.',
    callouts: [
      { find: { text: 'Disaster history', tag: 'button' }, label: 'Disaster history', desc: 'The disasters you reported before, with their status.' },
      { find: { text: 'Select all', tag: 'span, label, div', up: 1 }, label: 'Choose the crops', desc: 'Step 1: tick every crop that was hit.' },
      { find: { text: 'Continue', tag: 'button', exact: true }, label: 'Continue', desc: 'Step 2: choose the disaster and the date, describe the damage and add photos taken with the phone camera.' },
      BOTTOM('Home, Monitoring, Disaster, Forecasting and Assistance.'),
    ] }),
  FA({ id: 'farmer-p-forecast', phone: true, file: 'farmer/phone-forecast.png', url: '/forecasting', wait: 5000, title: 'Forecasting on a phone (Farmer)', purpose: 'The expected harvest of your crops.',
    callouts: [
      { find: [{ text: 'Forecast', tag: 'button', exact: true }, { text: 'Yield analysis', tag: 'button' }], label: 'Forecast / Yield analysis', desc: 'Forecast looks ahead at your crops; Yield analysis compares the estimate with the actual harvest.' },
      SEARCH,
      BOTTOM('Home, Monitoring, Disaster, Forecasting and Assistance.'),
    ] }),
  FA({ id: 'farmer-p-assistance', phone: true, file: 'farmer/phone-assistance.png', url: '/crop-assistance', wait: 5000, title: 'Assistance on a phone (Farmer)', purpose: 'The help given to you.',
    callouts: [
      { find: [{ text: 'History', tag: 'button', exact: true }, { text: 'Upcoming', tag: 'button' }, { text: 'Needs Follow-up', tag: 'button' }], label: 'History / Upcoming / Needs Follow-up', desc: 'What you received, what is scheduled, and what you reported as not received.' },
      { find: { css: 'main button[aria-expanded]', nth: 0 }, label: 'An assistance', desc: 'Tap one to open its details and to confirm that you received it when it asks you to.' },
      BOTTOM('Home, Monitoring, Disaster, Forecasting and Assistance.'),
    ] }),
  FA({ id: 'farmer-p-profile', phone: true, file: 'farmer/phone-profile.png', url: '/my-profile', wait: 5000, height: 1300, title: 'My Profile on a phone (Farmer)', purpose: 'Your details on a phone.',
    callouts: [
      { find: { css: 'button[aria-label="Change photo"]' }, label: 'Change photo', desc: 'The camera button changes your photo.' },
      { find: { text: 'Log out', tag: 'span, button, a', up: 1 }, label: 'Log out', desc: 'Signs you out of this device.' },
    ] }),

  // ───────────────────────────── Fisherfolk ─────────────────────────────
  FI({ id: 'fisherfolk-p-home', phone: true, file: 'fisherfolk/phone-home.png', url: '/my-account', wait: 6000, height: 1750, title: 'Home on a phone (Fisherfolk)', purpose: 'Your cycles at a glance, with the menu along the bottom.',
    callouts: [
      HEAD,
      { find: { text: 'Welcome', tag: 'h1, h2, p, div', up: 1 }, label: 'Welcome banner', desc: 'Your name, the kind of account and the date.' },
      { find: { text: 'Active cycles', tag: 'p, span, div', up: 2 }, label: 'Totals', desc: 'Your active cycles, ponds and cages, harvested cycles and open disasters.' },
      { find: card('My cycles by stage'), label: 'My cycles by stage', desc: 'How many of your cycles are growing, near harvest or harvested.' },
      { find: card('Harvest vs estimate'), label: 'Harvest vs estimate', desc: 'Your latest harvests against the estimate.' },
      { find: card('Disasters by type'), label: 'Disasters by type', desc: 'The disasters you reported, by type.' },
      { find: { text: 'Open cycle', tag: 'button' }, label: 'Open cycle', desc: 'Opens that production cycle.' },
      { find: { text: 'Report disaster', tag: 'button' }, label: 'Report disaster', desc: 'Starts a disaster report for that cycle.' },
      BOTTOM('Home, Monitoring, Disaster, Forecasting and Assistance.'),
    ] }),
  FI({ id: 'fisherfolk-p-stocks', phone: true, file: 'fisherfolk/phone-stocks.png', url: '/fisheries-monitoring', wait: 5000, title: 'Monitoring on a phone (Fisherfolk)', purpose: 'Your stocks as cards.',
    callouts: [
      { find: { text: 'Start Production Cycle', tag: 'button' }, label: 'Start Production Cycle', desc: 'Starts a new production cycle: species, pond or cage, dates, fingerlings and where they came from.' },
      { find: { text: 'Tilapia', tag: 'h3, p, div, span', closest: CARD }, label: 'A stock card', desc: 'Tap a stock to open its ponds or cages, its dates, the harvest and its menu (details, logs, force harvest).' },
      BOTTOM('Home, Monitoring, Disaster, Forecasting and Assistance.'),
    ] }),
  FI({ id: 'fisherfolk-p-disaster', phone: true, file: 'fisherfolk/phone-disaster.png', url: '/disaster', wait: 5000, height: 1500, title: 'Disaster on a phone (Fisherfolk)', purpose: 'Report a disaster from the pond side.',
    callouts: [
      { find: { text: 'Disaster history', tag: 'button' }, label: 'Disaster history', desc: 'The disasters you reported before.' },
      { find: { text: 'Affected Stock', tag: 'label', up: 1 }, label: 'Affected Stock', desc: 'Choose the stocks that were hit, or Not linked to a stock for equipment damage only.' },
      { find: { text: 'Take Photo', tag: 'button' }, label: 'Take Photo', desc: 'Takes a photo of the damage with the phone camera.' },
      BOTTOM('Home, Monitoring, Disaster, Forecasting and Assistance.'),
    ] }),
  FI({ id: 'fisherfolk-p-forecast', phone: true, file: 'fisherfolk/phone-forecast.png', url: '/fisheries-forecasting', wait: 5000, title: 'Forecasting on a phone (Fisherfolk)', purpose: 'The expected harvest of your cycles.',
    callouts: [
      { find: [{ text: 'Forecast', tag: 'button', exact: true }, { text: 'Yield analysis', tag: 'button' }], label: 'Forecast / Yield analysis', desc: 'Forecast looks ahead; Yield analysis compares the estimate with the actual harvest.' },
      BOTTOM('Home, Monitoring, Disaster, Forecasting and Assistance.'),
    ] }),
  FI({ id: 'fisherfolk-p-assistance', phone: true, file: 'fisherfolk/phone-assistance.png', url: '/fisheries-assistance', wait: 5000, title: 'Assistance on a phone (Fisherfolk)', purpose: 'The help given to you.',
    callouts: [
      { find: [{ text: 'All Records', tag: 'button' }, { text: 'Needs Follow-up', tag: 'button' }], label: 'All Records / Needs Follow-up', desc: 'Everything you received, and what you reported as not received.' },
      BOTTOM('Home, Monitoring, Disaster, Forecasting and Assistance.'),
    ] }),

  // ───────────────────────────── Organization ─────────────────────────────
  O({ id: 'org-p-home', phone: true, file: 'org/phone-home.png', url: '/my-account', wait: 6000, height: 1400, title: 'Home on a phone (Organization)', purpose: 'Your organization on a phone.',
    callouts: [
      HEAD,
      { find: { text: 'Welcome', tag: 'h1, h2, p, div', up: 1 }, label: 'Welcome banner', desc: 'The organization\'s name and the date.' },
      { find: card('Members'), label: 'Members', desc: 'Your members by status.' },
      { find: { text: 'Confirm for Members', tag: 'button', exact: true, nth: 0 }, label: 'Confirm for Members', desc: 'Shown when members have no working account: you can confirm for them that they received an assistance.' },
      { find: { text: 'Distribute assistance', tag: 'span, a, button', up: 1 }, label: 'Shortcuts', desc: 'Distribute assistance, Members, Officers, Equipment, Borrowed equipment and Confirm for members open those pages.' },
      BOTTOM('Home, Organization and Assistance.'),
    ] }),
  O({ id: 'org-p-members', phone: true, file: 'org/phone-members.png', url: '/my-organization', wait: 5000, title: 'My Organization on a phone', purpose: 'Members, equipment, borrowed items and officers from the phone.',
    callouts: [
      { find: { text: 'Members', tag: 'button', exact: true }, label: 'Tabs', desc: 'Members, Equipment, Borrowed, Officers and Confirmed for Members. Swipe the tabs sideways to see them all.' },
      { find: { text: 'Import', tag: 'button' }, label: 'Import', desc: 'Adds members (or equipment) from a spreadsheet.' },
      { find: { text: 'Add Member', tag: 'button' }, label: 'Add Member', desc: 'Adds a registered farmer to the organization.' },
      SEARCH,
      { find: { text: 'Filters', tag: 'button', exact: true }, label: 'Filters', desc: 'Narrows the list.' },
      BOTTOM('Home, Organization and Assistance.'),
    ] }),
  O({ id: 'org-p-assistance', phone: true, file: 'org/phone-assistance.png', url: '/crop-assistance', wait: 5000, title: 'Assistance on a phone (Organization)', purpose: 'Give assistance to your members from the phone.',
    callouts: [
      { find: [{ text: 'History', tag: 'button', exact: true }, { text: 'Confirm for Members', tag: 'button' }], label: 'History / Confirm for Members', desc: 'What was given, and the members you confirm for.' },
      { find: { text: 'Distribute to All Members', tag: 'button' }, label: 'Distribute to All Members', desc: 'Gives the same assistance to every member.' },
      { find: { text: 'Distribute to Individual', tag: 'button' }, label: 'Distribute to Individual', desc: 'Gives an assistance to the members you tick.' },
      BOTTOM('Home, Organization and Assistance.'),
    ] }),
]
