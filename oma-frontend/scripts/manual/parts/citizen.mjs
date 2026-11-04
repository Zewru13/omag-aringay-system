// Screens of the Farmer, Fisherfolk and Organization accounts (desktop, then phone).
import { FA, FI, O, click, clickIncl, wait, SIDEBAR, SEARCH, FILTERS, PRINT, DOWNLOAD, COLS, ROW1, PAGER, PAGER_ROW, SEARCH_ROW, FILTERS_ROW, PRINT_ROW, DOWNLOAD_ROW, MENU_TOGGLE, BELL, ACCOUNT } from './common.mjs'

const CARD = 'section, article, [class*="rounded-xl"], [class*="rounded-[1"]'
const card = (text, tag = 'h2') => ({ text, tag, closest: CARD })
const NAV = { css: 'nav', nth: 0 }
const BOTTOM = (desc) => ({ find: NAV, label: 'Bottom menu', desc })
const HEADER_BAR = (extra = '') => ({ find: { css: 'header' }, label: 'Top bar', desc: `The system name, the bell (notifications) and your initials, which open your account menu: your profile, the User Manual and Log out.${extra}` })
const ACCOUNT_MENU = { find: [BELL, { css: 'button[aria-label="Open account menu"]', up: 1 }], label: 'Bell and account menu', desc: 'The bell shows your notices (for example a new assistance or a harvest coming up). Your name opens the account menu: your profile, the User Manual and Log out.' }
const MENU_BTN = { find: MENU_TOGGLE, label: 'Menu button', desc: 'Hides the left menu to give the page more room, or shows it again.' }
const crop = (up) => ({ text: up, tag: 'button, p, span, div' })
const farmerCropMenu = "const b=[...document.querySelectorAll('button')].find(x=>/crops on/.test(x.getAttribute('aria-label')||'')||/01-33-02-005/.test(x.textContent))||document.querySelector('tbody tr button'); b&&b.click(); await new Promise(r=>setTimeout(r,1500)); const rows=[...document.querySelectorAll('tbody tr')]; const r=rows.find(x=>/Palay/.test(x.textContent)); if(r){const bs=r.querySelectorAll('button'); bs[bs.length-1].click()}"

const PROFILE_ROWS = [
  { find: { css: 'button[aria-label*="photo"], button[title*="photo"], button[aria-label="Change photo"]' }, label: 'Change photo', desc: 'The camera button on your picture changes your photo (JPG, PNG or WEBP, up to 5 MB).' },
  { find: { text: 'Instant Change', up: 2 }, label: 'Key to the icons', desc: 'The pencil changes a detail at once. The arrows send a request that the office checks first. A padlock means it cannot be changed here.' },
  { find: { text: 'RSBSA NUMBER', up: 1 }, label: 'RSBSA number', desc: 'Locked. Contact the office to have it corrected.' },
  { find: { text: 'Personal Information', tag: 'h2, h3, p, div, span', closest: CARD }, label: 'Personal information', desc: 'Your name and barangay (a change request goes to the office, who approve it) and your contact number (changed at once with the pencil).' },
  { find: { text: 'Reference Information', tag: 'h2, h3, p, div, span', closest: CARD }, label: 'Reference information', desc: 'Your birthdate, civil status, education and organization, as the office recorded them. They are locked.' },
  { find: { text: 'Change Password', tag: 'p, h3, div, span', up: 2 }, label: 'Change Password', desc: 'Optional. Press Edit to set a new password; it is never required.' },
  { find: { text: 'Log out', tag: 'span, button, a', up: 1 }, label: 'Log out', desc: 'Signs you out of this device.' },
]

export const CITIZEN = [
  // ───────────────────────────── Farmer ─────────────────────────────
  FA({ id: 'farmer-home', file: 'farmer/home.png', url: '/my-account', wait: 6000, height: 1100, title: 'Home (Farmer)', purpose: 'Your farm at a glance.',
    callouts: [
      { find: SIDEBAR, label: 'Menu', desc: 'Home, Crop Monitoring, Forecasting, Disaster and Assistance. Equipment appears when you belong to an organization that lends equipment.' },
      MENU_BTN, ACCOUNT_MENU,
      { find: { text: 'Welcome', tag: 'h1, h2, p, div', up: 1 }, label: 'Welcome banner', desc: 'Your name, the kind of account and today\'s date.' },
      { find: { text: 'Farm parcels', tag: 'p, span, div', up: 1 }, label: 'Totals', desc: 'Your farm parcels, your active crops (not yet harvested), your total area in hectares and the harvests recorded this month.' },
      { find: card('My crops by stage'), label: 'My crops by stage', desc: 'A ring of your crops by stage: growing, harvested and the others.' },
      { find: card('Harvest vs estimate'), label: 'Harvest vs estimate', desc: 'For your latest harvested crops, the estimate made when it was planted (light) against the actual harvest (dark), in kg.' },
      { find: card('Disasters by type'), label: 'Disasters by type', desc: 'The disasters you reported, by type: typhoon, flood, drought and so on.' },
      { find: { text: 'needs attention', tag: 'p, span, h3, div', closest: CARD }, label: 'Crops that need attention', desc: 'Shown when some activity is due today or overdue. View opens the crops that need work.' },
      { find: { text: 'Open crop', tag: 'button', nth: 0 }, label: 'Open crop', desc: 'Opens that crop\'s details: its activities, disasters and remarks.' },
      { find: { text: 'Report disaster', tag: 'button', nth: 0 }, label: 'Report disaster', desc: 'Starts a disaster report for that crop.' },
      { find: { text: 'Activity suggestion', tag: 'p, span, div', up: 1 }, label: 'Activity suggestion', desc: 'The next activity recommended for the crop at its stage (for example fertilizer application).' },
    ] }),
  FA({ id: 'farmer-profile', file: 'farmer/profile.png', url: '/my-profile', height: 900, title: 'My Profile (Farmer)', purpose: 'What the office has on record about you.',
    callouts: [
      ...PROFILE_ROWS,
      { find: { text: 'Borrow equipment', tag: 'button, a' }, label: 'Borrow equipment', desc: 'Shown when you belong to an organization: opens the equipment your organization lends.' },
    ] }),
  FA({ id: 'farmer-crops', file: 'farmer/crops.png', url: '/crop-monitoring', js: farmerCropMenu, after: 1200, height: 800, title: 'Crop Monitoring (Farmer)', purpose: 'Your farm parcels and the crops on them.',
    callouts: [
      SEARCH_ROW('one of your crops by crop name or barangay'),
      { ...FILTERS_ROW, desc: 'Opens the filter row: status, season and the other filters. Print Report and Download Report follow them.' },
      PRINT_ROW, DOWNLOAD_ROW,
      { find: COLS, label: 'Parcel columns', desc: 'Each row is one of your farm parcels: its number, you, the barangay, the area (ha), the ownership (Owner, Lessee or Tenant) and how many records it holds.' },
      { find: { css: 'tbody tr', nth: 0 }, label: 'A parcel row', desc: 'The arrow at the end of the row opens or closes the crops planted on that parcel.' },
      { find: { text: 'CROP', tag: 'th', closest: 'thead' }, label: 'Crop columns', desc: 'Under an open parcel: the crop, its variety, the organization, barangay, date planted, expected harvest, how many activities were logged, whether it is PCIC insured and its status (Planted, Near Harvest, Harvested...).' },
      { find: { text: 'Record Activity', tag: 'button' }, label: 'Record Activity', desc: 'Logs what you did on the crop (for example watering, fertilizing or spraying): the activity, the date, the plant condition and notes. Get Suggestions shows what is recommended next.' },
      { find: { text: 'Crop Details', tag: 'button', exact: true }, label: 'Crop Details', desc: 'Opens everything about the crop: activities, pest and disease reports, disasters and remarks.' },
      { find: { text: 'Record Harvest', tag: 'button' }, label: 'Record Harvest', desc: 'Records the harvest once at least half of the crop\'s growing time has passed: the date, the area harvested, the unit and the quantity.' },
      { find: { text: 'Report Disaster', tag: 'button' }, label: 'Report Disaster', desc: 'Reports damage on this crop: the type, the date, the area affected, a description, whether it is a total loss, and photos.' },
    ] }),
  FA({ id: 'farmer-forecast', file: 'farmer/forecast.png', url: '/forecasting', title: 'Forecasting (Farmer)', purpose: 'The harvest expected from your crops.',
    callouts: [
      { find: [{ text: 'Forecast', tag: 'button', exact: true }, { text: 'Yield analysis', tag: 'button' }], label: 'Forecast / Yield analysis', desc: 'Forecast looks ahead at your planted crops. Yield analysis compares the estimate with the actual harvest of crops already harvested.' },
      SEARCH_ROW('one of your crops'),
      FILTERS_ROW,
      { find: COLS, label: 'Columns', desc: 'Crop, area planted, the estimated yield in kg (the area times the crop\'s usual yield per hectare), the expected harvest date, the status and Details.' },
      { find: { text: 'View', tag: 'button', exact: true, nth: 0 }, label: 'View', desc: 'Opens the forecast details of the crop.' },
    ] }),
  FA({ id: 'farmer-disaster', file: 'farmer/disaster.png', url: '/disaster', height: 800, title: 'Disaster (Farmer): step 1', purpose: 'Report a disaster that hurt your crops.',
    callouts: [
      { find: { text: 'Disaster history', tag: 'button' }, label: 'Disaster history', desc: 'Opens the list of disasters you reported before: reference number, crop, type, date, area affected, status (Active or Recovered), date logged, and View / Actions for each.' },
      { find: { text: 'Select all', tag: 'span, label, div', up: 1 }, label: 'Select all', desc: 'Step 1: ticks every one of your crops. Tick the crops that were hit; you fill in the disaster only once for all of them.' },
      { find: { css: 'main label', nth: 1 }, label: 'A crop', desc: 'Each crop with its season, the date it was planted and the barangay. Tick the ones that were affected.' },
      { find: { text: 'Continue', tag: 'button', exact: true }, label: 'Continue', desc: 'Goes to step 2. It stays grayed out until at least one crop is ticked.' },
    ] }),
  FA({ id: 'farmer-disaster-history', file: 'farmer/disaster-history.png', url: '/disaster', js: click('Disaster history'), after: 2000, title: 'Disaster history (Farmer)', purpose: 'The disasters you reported.',
    callouts: [
      { find: { text: 'Disaster history', tag: 'h2' }, label: 'Disaster history', desc: 'Close it with the X at the top right.' },
      { find: COLS, label: 'Columns', desc: 'Reference number, crop, disaster type, date of occurrence, area affected, status (Active until the crop recovers, then Recovered), date logged and Actions.' },
      { find: { css: 'tbody tr:first-child button', nth: 0 }, label: 'View', desc: 'Opens that disaster log with its details and photos, with Print and Download.' },
    ] }),
  FA({ id: 'farmer-assistance', file: 'farmer/assistance.png', url: '/crop-assistance', title: 'Assistance Received (Farmer)', purpose: 'The help given to you.',
    callouts: [
      { find: [{ text: 'Current', tag: 'button', exact: true }, { text: 'History', tag: 'button', exact: true }], label: 'Current / History', desc: 'Current is what is scheduled for a later date, what waits for you to confirm it, and what you reported as not received (until the office resolves it). History is what you received and confirmed, or that was resolved.' },
      FILTERS_ROW,
      { find: { css: 'main button[aria-expanded]', nth: 0 }, label: 'An assistance', desc: 'Each one shows its type and date. Click it to open the details: the source agency, the quantity, the status, and a button to confirm that you received it (or that you did not) when it asks you to.' },
    ] }),
  FA({ id: 'farmer-equipment', file: 'farmer/equipment.png', url: '/my-equipment', title: 'Borrow Equipment (Farmer)', purpose: 'The equipment your organization lends. This page is for farmers who belong to an organization.',
    callouts: [
      { find: { text: 'AVAILABLE TO BORROW', tag: 'h3', up: 1 }, label: 'Available to borrow', desc: 'The equipment of your organization that can be lent now, with how many units are available.' },
      SEARCH_ROW('equipment by name'),
      FILTERS_ROW,
      { find: { css: 'main button', last: true, nth: 0 }, label: 'An item', desc: 'Click an item to ask to borrow it: choose how many units and a date you will return it. Your organization then approves or rejects the request.' },
      { find: { text: 'MY LOANS', tag: 'h3', up: 1 }, label: 'My loans', desc: 'What you asked for or borrowed, with its status, and the return date.' },
    ] }),

  // ───────────────────────────── Fisherfolk ─────────────────────────────
  FI({ id: 'fisherfolk-stocks', file: 'fisherfolk/stocks.png', url: '/fisheries-monitoring', js: "const r=document.querySelector('tbody tr'); r&&r.click()", after: 1500, width: 1900, height: 800, title: 'Aquaculture Monitoring (Fisherfolk)', purpose: 'Your production cycles, ponds and cages.',
    callouts: [
      { find: SIDEBAR, label: 'Menu', desc: 'Home, Aquaculture Monitoring, Forecasting, Disaster and Assistance.' },
      { find: { text: 'Start Production Cycle', tag: 'button' }, label: 'Start Production Cycle', desc: 'Starts a new production cycle (next picture).' },
      { find: COLS, label: 'Columns', desc: 'Ownership, species, culture type (pond or cage), cycle number, date stocked, expected harvest, organization, pond location, status (a small red alert icon beside it means a disaster is still active on the cycle, a green check means it recovered) and Actions.' },
      { find: { css: 'tbody tr:first-child td:last-child button', nth: 0 }, label: 'Harvest / Actions', desc: 'The harvest button is grayed out until at least half of the expected time has passed. The three dots open the menu of the cycle: view and edit it, see its logs, or force a harvest.' },
      { find: { text: 'ponds', tag: 'span, p, div', up: 1 }, label: 'Ponds of the cycle', desc: 'Click a row to open its ponds or cages: the unit, its PCIC Insured round check (View form opens the uploaded form inside the system), species, fingerlings, dimensions, area, estimated and actual harvest, the date harvested and the status.' },
      { ...PAGER_ROW, find: PAGER },
    ] }),
  FI({ id: 'fisherfolk-start-cycle', file: 'fisherfolk/start-cycle.png', url: '/fisheries-monitoring', js: click('Start Production Cycle'), after: 2500, height: 1500, title: 'Start Production Cycle (Fisherfolk)', purpose: 'Starts a new production cycle for your ponds or cages.',
    callouts: [
      { find: { text: 'Fisherfolk', tag: 'label', up: 1 }, label: 'Fisherfolk', desc: 'You, already filled in.' },
      { find: { text: 'Organization', tag: 'label', up: 1 }, label: 'Organization', desc: 'Optional. Your organization, if you belong to one.' },
      { find: { text: 'Culture Phase', tag: 'label', up: 1 }, label: 'Culture Phase', desc: 'Required: Nursery, Stocking, Grow-out and the other phases.' },
      { find: [{ text: 'Species Farmed', tag: 'label', up: 1 }, { text: 'Culture System', tag: 'label', up: 1 }], label: 'Species and Culture System', desc: 'Required. The species, and Fishpond or Fishcage.' },
      { find: [{ text: 'Water Source', tag: 'label', up: 1 }, { text: 'Fingerling Source', tag: 'label', up: 1 }], label: 'Water and fingerling source', desc: 'Required. River, spring, rain-fed, deep well or other; and where the fingerlings came from (BFAR, own production, private hatchery).' },
      { find: [{ text: 'Pond Location', tag: 'label', up: 1 }, { text: 'Ownership', tag: 'label', up: 1 }], label: 'Pond location and ownership', desc: 'Required. The barangay of the pond or cage, and Tenant, Lease or Owner.' },
      { find: [{ text: 'Stocking Date', tag: 'label', up: 1 }, { text: 'Season', tag: 'label', up: 1 }, { text: 'Target Harvest Date', tag: 'label', up: 1 }], label: 'Stocking date, season, target harvest', desc: 'Required. The day you stocked; the season is detected from it; and the date you plan to harvest. The harvest button opens when half of this time has passed.' },
      { find: { text: 'Number of Ponds', tag: 'label', up: 1 }, label: 'Number of Ponds', desc: 'Required. How many ponds or cages: a line for each opens, to give its size, the fingerlings and whether it has PCIC insurance.' },
      { find: { text: 'Start Cycle', tag: 'button' }, label: 'Start Cycle', desc: 'Saves the production cycle.' },
    ] }),
  FI({ id: 'fisherfolk-forecast', file: 'fisherfolk/forecast.png', url: '/fisheries-forecasting', width: 1700, title: 'Forecasting (Fisherfolk)', purpose: 'The harvest expected from your production cycles.',
    callouts: [
      { find: [{ text: 'Forecast', tag: 'button', exact: true }, { text: 'Yield analysis', tag: 'button' }], label: 'Forecast / Yield analysis', desc: 'Forecast looks ahead at your cycles. Yield analysis compares the estimate with the actual harvest.' },
      { find: COLS, label: 'Columns', desc: 'Species, you, culture type, date stocked, fingerlings, the estimated harvest yield (kg), the actual harvest, the estimated and actual harvest dates and the status.' },
      { ...PAGER_ROW, find: PAGER },
    ] }),
  FI({ id: 'fisherfolk-disaster', file: 'fisherfolk/disaster.png', url: '/disaster', height: 1200, title: 'Disaster (Fisherfolk)', purpose: 'Report a disaster that hurt your ponds, cages or stocks.',
    callouts: [
      { find: { text: 'Disaster history', tag: 'button' }, label: 'Disaster history', desc: 'The disasters you reported before, with their status (Active or Recovered) and View for each.' },
      { find: { text: 'Affected Stock', tag: 'label', up: 1 }, label: 'Affected Stock', desc: 'Required. One or more stocks: tick the affected stocks (a search box finds them by species, cycle or location). Or Not linked to a stock, for pond, cage or equipment damage only.' },
      { find: { text: 'Date of Occurrence', tag: 'label', up: 1 }, label: 'Date of Occurrence', desc: 'Required. The day it happened.' },
      { find: { text: 'Disaster Type', tag: 'label', up: 1 }, label: 'Disaster Type', desc: 'Required: Typhoon, Flooding, Storm Surge, El Niño, Drought, Red Tide, Fish Kill or Other.' },
      { find: { text: 'Volume Lost', tag: 'label', up: 1 }, label: 'Volume Lost (kg)', desc: 'Optional. The kg of fish lost, if known.' },
      { find: { text: 'Equipment Damaged', tag: 'label', up: 1 }, label: 'Equipment Damaged', desc: 'Optional. Tick the pond, cage, feeding, water-quality or power equipment that was damaged.' },
      { find: { text: 'Description of Damage', tag: 'label', up: 1 }, label: 'Description of Damage', desc: 'Optional notes about what was damaged.' },
      { find: [{ text: 'Take Photo', tag: 'button' }, { text: 'Add More Photos', tag: 'button' }], label: 'Photos', desc: 'Take Photo uses the camera; Add More Photos chooses files (JPG, PNG or WEBP, up to 5 MB each, up to 10).' },
      { find: { text: 'Log Disaster', tag: 'button', exact: true, last: true }, label: 'Log Disaster', desc: 'Sends the report. The office is notified.' },
    ] }),
  FI({ id: 'fisherfolk-assistance', file: 'fisherfolk/assistance.png', url: '/fisheries-assistance', title: 'Assistance Received (Fisherfolk)', purpose: 'The help given to you.',
    callouts: [
      { find: [{ text: 'Current', tag: 'button', exact: true }, { text: 'History', tag: 'button', exact: true }], label: 'Current / History', desc: 'Current is what is scheduled, what waits for you to confirm it, and what you reported as not received. History is what you received and confirmed, or that was resolved.' },
      SEARCH_ROW('an assistance'),
      FILTERS_ROW,
    ] }),
  FI({ id: 'fisherfolk-profile', file: 'fisherfolk/profile.png', url: '/my-profile', height: 900, title: 'My Profile (Fisherfolk)', purpose: 'What the office has on record about you.',
    callouts: PROFILE_ROWS.filter((r) => !/Reference/.test(r.label)) }),

  // ───────────────────────────── Organization ─────────────────────────────
  O({ id: 'org-home', file: 'org/home.png', url: '/my-account', wait: 6000, height: 800, title: 'Home (Organization)', purpose: 'Your organization at a glance.',
    callouts: [
      { find: SIDEBAR, label: 'Menu', desc: 'Home, My Organization and Assistance.' },
      MENU_BTN, ACCOUNT_MENU,
      { find: { text: 'Welcome', tag: 'h1, h2, p, div', up: 1 }, label: 'Welcome banner', desc: 'The organization\'s name, the kind of account and today\'s date.' },
      { find: card('Members'), label: 'Members', desc: 'A ring of your members by status, with the total in the middle.' },
      { find: card('Assistance reported in', 'h2'), label: 'Assistance reported this year', desc: 'A chart of the assistance records per month this year.' },
      { find: card('Assistance by type'), label: 'Assistance by type', desc: 'The same assistance counted by type (seeds, fertilizer, cash...).' },
      { find: { text: 'waiting for a confirmation', tag: 'p, h2, h3, span, div', closest: CARD }, label: 'Waiting for a confirmation', desc: 'Members who have no working account of their own cannot confirm that they received an assistance, so you can confirm for them. Confirm for Members opens that list.' },
      { find: [{ text: 'Distribute assistance', tag: 'span, a, button', up: 1 }, { text: 'Members', tag: 'span, a, button', exact: true, up: 1, last: true }, { text: 'Officers', tag: 'span, a, button', exact: true, up: 1, last: true }], label: 'Shortcuts (1)', desc: 'Distribute assistance opens the Assistance page; Members opens the members list; Officers opens the officers.' },
      { find: [{ text: 'Equipment', tag: 'span, a, button', exact: true, up: 1, last: true }, { text: 'Borrowed equipment', tag: 'span, a, button', up: 1 }, { text: 'Confirm for members', tag: 'span, a, button', exact: true, up: 1, last: true }], label: 'Shortcuts (2)', desc: 'Equipment opens the equipment you own; Borrowed equipment opens who borrowed what; Confirm for members opens the confirmations.' },
    ] }),
  O({ id: 'org-members', file: 'org/my-organization.png', url: '/my-organization', height: 800, title: 'My Organization: Members', purpose: 'The members of your organization.',
    callouts: [
      { find: [{ text: 'Members', tag: 'button', exact: true }, { text: 'Equipment', tag: 'button', exact: true }, { text: 'Borrowed', tag: 'button' }, { text: 'Borrowed History', tag: 'button', exact: true }, { text: 'Officers', tag: 'button', exact: true }, { text: 'Confirmed for Members', tag: 'button' }], label: 'Tabs', desc: 'Members, Equipment, Borrowed (with the number of loans waiting), Borrowed History, Officers and Confirmed for Members. Equipment is a tab here, not a separate page.' },
      { find: { text: 'Import Members', tag: 'button' }, label: 'Import Members', desc: 'Adds many members from a spreadsheet, with a preview first.' },
      { find: { text: 'Add Member', tag: 'button', exact: true }, label: 'Add Member', desc: 'Adds one registered farmer to the organization (next picture).' },
      SEARCH_ROW('a member by name'),
      FILTERS_ROW,
      { find: { css: 'main button', last: true }, label: 'A member', desc: 'Click a member to see their details, such as their position and when they joined.' },
    ] }),
  O({ id: 'org-add-member', file: 'org/add-member.png', url: '/my-organization', js: click('Add Member'), after: 2000, title: 'Add Member window', purpose: 'Adds one registered farmer to your organization.',
    callouts: [
      { find: { text: 'Search Farmer', tag: 'label', up: 1 }, label: 'Search Farmer', desc: 'Required. Type a name or RSBSA number and choose the farmer. Only registered farmers can be added.' },
      { find: { text: 'Date Joined', tag: 'label', up: 1 }, label: 'Date Joined', desc: 'Required. The day the farmer joined. It cannot be in the future.' },
      { find: { text: 'Add Member', tag: 'button', last: true }, label: 'Add Member', desc: 'Saves the membership.' },
      { find: { text: 'Cancel', tag: 'button', exact: true, last: true }, label: 'Cancel', desc: 'Closes the window; nothing is saved.' },
    ] }),
  O({ id: 'org-equipment', file: 'org/equipment.png', url: '/my-organization', js: click('Equipment'), after: 2000, height: 800, title: 'My Organization: Equipment', purpose: 'What the organization owns and who borrowed it.',
    callouts: [
      { find: { text: 'Equipment', tag: 'button', exact: true }, label: 'Equipment tab', desc: 'Equipment is a tab of My Organization. Each item shows its units, their condition and how many are on loan.' },
      { find: { text: 'Import Equipment', tag: 'button' }, label: 'Import Equipment', desc: 'Adds many items from a spreadsheet.' },
      { find: { text: 'Add Equipment', tag: 'button', exact: true }, label: 'Add Equipment', desc: 'Adds one item: the equipment, how many units and optionally the date acquired and remarks. New equipment starts as Good.' },
      SEARCH_ROW('an item by name'),
      { ...FILTERS_ROW, desc: 'Filters the items by Condition (Good, Needs Repair, Not Operational, Broken, Lost) and Availability (units available or not).' },
      { find: { text: 'Hand Tractor', tag: 'p, div, span, h3', up: 2 }, label: 'An item', desc: 'Click an item to open it. There you can Lend units to a member, Change condition (Needs Repair, Not Operational, Broken or Lost) and Repair units that were fixed. Only units in Good condition can be lent.' },
      { find: { text: 'Borrowed', tag: 'button' }, label: 'Borrowed tab', desc: 'What is out, who borrowed it and what came back (next picture).' },
    ] }),
  O({ id: 'org-borrowed', file: 'org/borrowed.png', url: '/my-organization', js: "const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent&&/^Borrowed/.test(x.textContent.trim())); b&&b.click()", after: 2000, height: 800, title: 'My Organization: Borrowed', purpose: 'Equipment that is out, and what came back.',
    callouts: [
      { find: { text: 'Lend equipment', tag: 'button' }, label: 'Lend equipment', desc: 'Records that members borrowed equipment (picture after next).' },
      { find: { text: 'Borrowed History', tag: 'button', exact: true }, label: 'Borrowed History', desc: 'This tab lists what is still out (and the requests), one row per person. Everything that came back, with when and in what condition, is in the Borrowed History tab.' },
      SEARCH_ROW('a member'),
      FILTERS_ROW,
      { find: { text: 'Needs action', tag: 'span, p, div', up: 2 }, label: 'A borrower', desc: 'Click a borrower to open their items. A request made by a member with an account shows Needs action: Approve or Reject it. For an item that came back, choose Mark returned and say what happened: Returned, Damaged (and how) or Not returned (the unit is recorded as Lost). An item past its return-by date shows Overdue.' },
    ] }),
  O({ id: 'org-borrowed-history', file: 'org/borrowed-history.png', url: '/my-organization', js: click('Borrowed History'), after: 2000, height: 700, title: 'My Organization: Borrowed History', purpose: 'Everything that was lent and came back.',
    callouts: [
      { find: { text: 'Borrowed History', tag: 'button', exact: true }, label: 'Borrowed History tab', desc: 'Everything that was lent and has come back, on its own page. What is still out is in the Borrowed tab.' },
      SEARCH_ROW('a member'),
      FILTERS_ROW,
      { find: COLS, label: 'Columns', desc: 'Who borrowed it, the equipment, how many units, when it went out and when it came back, and the condition the units came back in (Returned late if it came back after its return-by date).' },
    ] }),
  O({ id: 'org-lend', file: 'org/lend-equipment.png', url: '/my-organization', js: `const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent&&/^Borrowed/.test(x.textContent.trim())); b&&b.click(); ${wait(1500)}; const l=[...document.querySelectorAll('button')].find(x=>/Lend equipment/.test(x.textContent)); l&&l.click()`, after: 2500, height: 1000, title: 'Lend equipment window', purpose: 'Records that members borrowed equipment (for members who have no account to request it themselves).',
    callouts: [
      { find: { text: 'Date borrowed', tag: 'label', up: 1 }, label: 'Date borrowed', desc: 'Required. The day it was borrowed.' },
      { find: { text: 'Equipment', tag: 'label', up: 1 }, label: 'Equipment', desc: 'Required. The equipment and how many units are available. Only units in Good condition can be lent.' },
      { find: { css: 'input[type=text]', last: true }, label: 'Search member', desc: 'Find a member by name.' },
      { find: { css: 'input[type=checkbox]', nth: 0 }, label: 'Tick the borrowers', desc: 'Tick every member who borrowed it and give each one\'s number of units. Once all units are given out, no other member can be ticked.' },
      { find: { text: 'Lend another equipment', tag: 'button' }, label: 'Lend another equipment', desc: 'Adds a section for a different equipment (even to a member already ticked).' },
      { find: { text: 'Record borrowed', tag: 'button' }, label: 'Record borrowed', desc: 'Saves everything together as Borrowed.' },
    ] }),
  O({ id: 'org-officers', file: 'org/officers.png', url: '/my-organization', js: click('Officers'), after: 2000, height: 700, title: 'My Organization: Officers', purpose: 'The officers of the organization and their positions.',
    callouts: [
      { find: { text: 'Officers', tag: 'button', exact: true }, label: 'Officers tab', desc: 'The president, vice president, secretary, treasurer, auditor, board members and the other officers, with their term.' },
      { find: { text: 'Officer History', tag: 'button' }, label: 'Officer History', desc: 'Every officer who held a position before, with the term dates and why it ended.' },
      { find: { text: 'Assign Officer', tag: 'button' }, label: 'Assign Officer', desc: 'Choose a position and one of your members. Positions that are held are grayed out, and a member who already holds a position cannot be given another: end that term first (open the officer, End term early, give the reason: migrated or transferred registration, or Others).' },
    ] }),
  O({ id: 'org-confirmed', file: 'org/confirmed.png', url: '/my-organization', js: "const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent&&/Confirmed/.test(x.textContent.trim())); b&&b.click()", after: 2000, height: 700, title: 'My Organization: Confirmed for Members', purpose: 'The record of what you confirmed for your members.',
    callouts: [
      { find: { text: 'Confirmed for Members', tag: 'button' }, label: 'Confirmed for Members tab', desc: 'When you confirm for members that they received an assistance, the confirmations are listed here, grouped by the moment and who confirmed, with the proof photos they share. These confirmations are final: they need no staff approval.' },
    ] }),
  O({ id: 'org-assistance', file: 'org/assistance.png', url: '/crop-assistance', height: 800, title: 'Assistance (Organization)', purpose: 'Gives assistance to your members and shows what was given.',
    callouts: [
      { find: [{ text: 'Current', tag: 'button', exact: true }, { text: 'History', tag: 'button', exact: true }], label: 'Current / History', desc: 'Current lists the assistance that is scheduled, awaiting confirmation or needs follow-up. History lists what your members received and confirmed, or that was resolved.' },
      { find: { text: 'Confirm for Members', tag: 'button', last: true }, label: 'Confirm for Members', desc: 'Opens the list of members who cannot confirm for themselves (next picture); Back to Current returns.' },
      { find: { text: 'Distribute to All Members', tag: 'button' }, label: 'Distribute to All Members', desc: 'Gives the same assistance to every member in one step. Choose the type, source agency (required; Others lets you type one), quantity and its unit (required), date and description, then Review and confirm.' },
      { find: { text: 'Distribute to Individual', tag: 'button' }, label: 'Distribute to Individual', desc: 'Gives an assistance to only the members you tick.' },
      SEARCH_ROW('a member'),
      FILTERS_ROW,
      { find: COLS, label: 'Columns', desc: 'The date and time, the assistance, the quantity, how many members, the status and Action. Click a row to open the members who benefited.' },
    ] }),
  O({ id: 'org-confirm-members', file: 'org/confirm-members.png', url: '/crop-assistance', js: "const b=[...document.querySelectorAll('button')].find(x=>x.offsetParent&&/Confirm for Members/.test(x.textContent)); b&&b.click()", after: 2000, height: 800, title: 'Confirm for Members', purpose: 'Confirms, for members without a working account, that they received an assistance.',
    callouts: [
      { find: { text: 'Select all', tag: 'button' }, label: 'Select all', desc: 'Ticks every member in the list.' },
      { find: { css: 'table input[type=checkbox]', nth: 0 }, label: 'Tick boxes', desc: 'Tick each member you are confirming for.' },
      { find: COLS, label: 'Columns', desc: 'The date given, the member, the assistance type, the quantity and the status. The Actions menu of a row confirms one member.' },
      { find: { text: 'Confirm for members', tag: 'button', last: true }, label: 'Confirm for members', desc: 'Confirms the ticked members. You add proof photos, and the confirmation is final: no staff approval is needed.' },
    ] }),
  O({ id: 'org-profile', file: 'org/profile.png', url: '/my-profile', height: 1450, title: 'My Profile (Organization)', purpose: 'Your organization\'s own details.',
    callouts: [
      { find: { css: 'button[aria-label="Change logo"]' }, label: 'Change logo', desc: 'The camera button changes the organization\'s logo (JPG, PNG or WEBP).' },
      { find: { text: 'REGISTRATION DETAILS', tag: 'h2', closest: CARD }, label: 'Registration details', desc: 'The registration number, the agency, the date organized and the date registered. They are locked (padlock): contact the office to correct them.' },
      { find: { text: 'ORGANIZATION DETAILS', tag: 'h2', closest: CARD }, label: 'Organization details', desc: 'The name, barangay, street address, email and contact person. Request change sends a request that the office reviews before the change is made.' },
      { find: { text: 'CONTACT NUMBER', tag: 'h2', closest: CARD }, label: 'Contact number', desc: 'Edit changes the contact number at once.' },
      { find: { text: 'ACCOUNT PASSWORD', tag: 'h2', closest: CARD }, label: 'Account password', desc: 'This is a shared account: changing the password affects everyone who uses it, so tell your officers the new password first. Change password sets a new one.' },
      { find: { text: 'CHANGE REQUESTS', tag: 'h2', closest: CARD }, label: 'Change requests', desc: 'The changes you asked for and whether each was approved, rejected or is still pending.' },
    ] }),
]
