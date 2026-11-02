// Staff screens, part 1: the menu and top bar, the Dashboard, and Registration (farmers and fisherfolk).
import { A, F, click, wait, clickIncl, expandMenu, SIDEBAR, SEARCH, FILTERS, PRINT, DOWNLOAD, COLS, ROW1, PAGER, MENU_TOGGLE, BELL, ACCOUNT, PAGER_ROW, FILTERS_ROW, PRINT_ROW, DOWNLOAD_ROW, SEARCH_ROW } from './common.mjs'

const g = (name) => ({ text: name, tag: 'span, button, div', exact: true, in: 'aside' })

const LAYOUT = (R) => R({
  id: R === A ? 'admin-layout' : 'focal-layout', file: R === A ? 'admin/layout.png' : 'focal/layout.png', url: '/dashboard', wait: 4500, height: 1300, js: expandMenu, after: 1500,
  title: 'The menu and the top bar', purpose: 'Where everything is: the menu on the left and the bar along the top are on every staff page.',
  callouts: [
    { find: MENU_TOGGLE, label: 'Menu button', desc: 'Hides the left menu to give the page more room, or shows it again. On a phone the menu moves to the bottom of the screen instead.' },
    { find: BELL, label: 'Notifications bell', desc: 'Notices for you, such as a disaster that a farmer or fisherfolk reported, a change request waiting for review, or a harvest coming up. A number on the bell counts the new ones; open it to read them.' },
    { find: ACCOUNT, label: 'Account menu', desc: 'Your name, the role and today\'s date. Open it for the User Manual (this page), the Activity Log (Admin) and Logout. The first item also leads to your own profile.' },
    { find: { text: 'Dashboard', tag: 'a, span', exact: true, in: 'aside' }, label: 'Dashboard', desc: 'The first page after sign-in: totals of the municipality and what needs attention today.' },
    { find: g('Registration'), label: 'Registration', desc: 'Farmers and Fisherfolk: the registry of every person, their profile and their farm parcels or ponds.' },
    { find: g('Organizations'), label: 'Organizations', desc: 'Farmers Organizations and Fisherfolk Organizations: each one\'s members, officers and equipment.' },
    { find: g('Crop Management'), label: 'Crop Management', desc: 'Crop Records (every farm parcel and the crops on it) and Crop Monitoring (each crop from planting to harvest).' },
    { find: g('Fisheries Management'), label: 'Fisheries Management', desc: 'Aquaculture Monitoring (production cycles of ponds and cages) and Capture Monitoring (fishing trips and catch).' },
    { find: g('Forecasting'), label: 'Forecasting', desc: 'Crop Forecasting and Fisheries Forecasting: the harvest expected, and how the actual harvest compared (yield analysis).' },
    { find: g('Assistance'), label: 'Assistance', desc: 'Crop Assistance and Fisheries Assistance: help given to farmers, fisherfolk and organizations.' },
    { find: g('Disaster'), label: 'Disaster', desc: 'Crop Disaster and Fisheries Disaster: the disaster logs, with their reports.' },
    { find: g('Reports'), label: 'Reports', desc: 'The official reports, each with a preview, Print and Download.' },
    ...(R === A ? [{ find: g('Admin'), label: 'Admin', desc: 'Only for the Admin account: Crop Settings, Fisheries Settings, Activity Settings, Assistance Settings, Classification Settings, Harvest Unit Settings, User Management and Backup. The Focal Person does not see this group.' }] : []),
  ],
})

export const STAFF1 = [
  LAYOUT(A),
  LAYOUT(F),

  // ───────────────────────────── Dashboard ─────────────────────────────
  A({ id: 'admin-dashboard', file: 'admin/dashboard.png', url: '/dashboard', wait: 6000, height: 1650, title: 'Dashboard', purpose: 'The first page after sign-in: the totals of the municipality at a glance, and what needs attention today.',
    callouts: [
      { find: { text: 'What needs attention today', tag: 'h1, h2', up: 1 }, label: 'Welcome banner', desc: 'Today\'s date and which view you have (Administrator or Focal Person).' },
      { find: { text: 'Crop Sector', tag: 'h3', up: 3 }, label: 'Crop Sector', desc: 'Registered Farmers (with how many were registered this month) and Farmers Organizations that are active and registered.' },
      { find: { text: 'Fisheries Sector', tag: 'h3', up: 3 }, label: 'Fisheries Sector', desc: 'Registered Fisherfolk (with this month\'s new ones) and Fisherfolk Organizations that are active and registered.' },
      { find: { text: 'Disaster Reports Over Time', tag: 'h3', up: 3 }, label: 'Disaster Reports Over Time', desc: 'A chart of the disasters logged month by month, for crops (green) and fisheries (blue).' },
      { find: { css: 'input[type=month]', nth: 0 }, label: 'From month', desc: 'The first month of the chart. Pick a month to change the period.' },
      { find: { css: 'input[type=month]', nth: 1 }, label: 'To month', desc: 'The last month of the chart.' },
      { find: { text: 'Still active', tag: 'span, div', up: 2 }, label: 'Totals above the chart', desc: 'How many reports there are in the period, how many are still active (not yet recovered), and how many are on crops and on fisheries.' },
      { find: { text: 'By type of disaster', tag: 'p, span, div', up: 1 }, label: 'By type of disaster', desc: 'The same disasters counted by type: typhoon, flood, drought, fish kill and so on.' },
      { find: { text: 'Season Snapshot', tag: 'h3', up: 3 }, label: 'Season Snapshot: Crop Yield Variance', desc: 'For each crop, the yield estimated at planting (Target, blue) against the actual harvest (green), in metric tons per hectare, with the percentage the actual is above or below the target (a red arrow is below).' },
      { find: { text: 'Fisheries', tag: 'button', exact: true, nth: 0, up: 1 }, label: 'Crop / Fisheries switch', desc: 'Switches the snapshot between crops and fisheries.' },
      { find: { text: 'Farmers — Harvest vs Estimate', tag: 'h3', up: 3 }, label: 'Farmers: Harvest vs Estimate', desc: 'How many farmers harvested above, on or below the estimate made when the crop was planted, and how many have no harvest to compare yet.' },
      { find: { css: 'select[aria-label="Year compared, farmers"]' }, label: 'Year (farmers)', desc: 'Choose the year to compare, or All years.' },
      { find: { text: 'Fisherfolk — Harvest vs Estimate', tag: 'h3', up: 3 }, label: 'Fisherfolk: Harvest vs Estimate', desc: 'The same comparison for fisherfolk, against the estimate made when the fish were stocked (Year box on the right).' },
      { find: { text: 'Needs Attention', tag: 'h3', up: 3 }, label: 'Needs Attention: Activity Overdue', desc: 'For Crop Monitoring and for Fisheries Monitoring: activities that are Overdue, Due Today and Upcoming.' },
      { find: { text: 'View crop activities', tag: 'button, a, span' }, label: 'View activities links', desc: 'View crop activities opens Crop Monitoring, and View fisheries activities opens Aquaculture Monitoring, to work on them.' },
      { find: { text: 'Barangay Activity Status', tag: 'h3', up: 3 }, label: 'Barangay Activity Status', desc: 'The same Overdue / Due Today / Upcoming counts for each barangay. The Crop / Fisheries buttons at its top switch the table.' },
      { find: { text: 'Pending Change Requests', tag: 'h3', up: 3 }, label: 'Pending Change Requests', desc: 'Requests from farmers, fisherfolk and organizations to change a locked detail (such as name or barangay). Approve applies the change, Reject refuses it, and Review all opens User Management.' },
    ] }),
  F({ id: 'focal-dashboard', file: 'focal/dashboard.png', url: '/dashboard', wait: 6000, height: 1650, title: 'Dashboard (Focal Person)', purpose: 'The same Dashboard for a Focal Person.',
    callouts: [
      { find: { text: 'What needs attention today', tag: 'h1, h2', up: 1 }, label: 'Welcome banner', desc: 'Shows the Focal Person view.' },
      { find: { text: 'Crop Sector', tag: 'h3', up: 3 }, label: 'Crop Sector', desc: 'Registered farmers and active farmers organizations.' },
      { find: { text: 'Fisheries Sector', tag: 'h3', up: 3 }, label: 'Fisheries Sector', desc: 'Registered fisherfolk and active fisherfolk organizations.' },
      { find: { text: 'Disaster Reports Over Time', tag: 'h3', up: 3 }, label: 'Disaster Reports Over Time', desc: 'Disasters logged per month, with the From and To month boxes and the totals above the chart.' },
      { find: { text: 'Season Snapshot', tag: 'h3', up: 3 }, label: 'Season Snapshot', desc: 'Target against actual yield per crop; the Crop / Fisheries buttons switch it.' },
      { find: { text: 'Farmers — Harvest vs Estimate', tag: 'h3', up: 3 }, label: 'Harvest vs Estimate', desc: 'Farmers and fisherfolk harvest compared with the estimate; choose the year in each box.' },
      { find: { text: 'Needs Attention', tag: 'h3', up: 3 }, label: 'Needs Attention', desc: 'Overdue, due today and upcoming crop and fisheries activities, with links to Crop Monitoring and Aquaculture Monitoring.' },
      { find: { text: 'Pending Change Requests', tag: 'h3', up: 3 }, label: 'Pending Change Requests', desc: 'Change requests that wait for review: Approve or Reject them here.' },
    ] }),

  // ───────────────────────────── Registration: Farmers ─────────────────────────────
  A({ id: 'admin-farmers', file: 'admin/farmers.png', url: '/farmers?tab=registry', title: 'Registration > Farmers', purpose: 'The list of every registered farmer.',
    callouts: [
      SEARCH_ROW('a farmer by name, RSBSA number or barangay'),
      { ...FILTERS_ROW, desc: 'Opens the filter row: barangay, sex, farmer type, senior citizen, ICC/IP, PWD, 4Ps and the Registered From / To dates.' },
      PRINT_ROW,
      DOWNLOAD_ROW,
      { find: { text: 'Import Farmers', tag: 'button' }, label: 'Import Farmers', desc: 'Registers many farmers from a spreadsheet (xlsx or csv). You see a preview first; rows that cannot be added are listed with the reason, and a recent import can be undone.' },
      { find: { text: 'Register Farmer', tag: 'button', exact: true }, label: 'Register Farmer', desc: 'Opens the form to register one new farmer.' },
      { find: COLS, label: 'Columns', desc: 'RSBSA number, full name, barangay, age, farmer type (Farm Operator and so on) and the date registered.' },
      { find: ROW1, label: 'A farmer row', desc: 'Click a row to open that farmer\'s profile.' },
      { ...PAGER_ROW, find: PAGER },
    ] }),
  F({ id: 'focal-farmers', file: 'focal/farmers.png', url: '/farmers?tab=registry', title: 'Registration > Farmers (Focal Person)', purpose: 'A Focal Person registers and updates farmers like an Admin.',
    callouts: [
      SEARCH_ROW('a farmer by name, RSBSA number or barangay'),
      FILTERS_ROW, PRINT_ROW, DOWNLOAD_ROW,
      { find: { text: 'Import Farmers', tag: 'button' }, label: 'Import Farmers', desc: 'Registers many farmers from a spreadsheet, with a preview first.' },
      { find: { text: 'Register Farmer', tag: 'button', exact: true }, label: 'Register Farmer', desc: 'Opens the form to register a new farmer.' },
      { find: ROW1, label: 'A farmer row', desc: 'Click a row to open the farmer\'s profile.' },
    ] }),
]
