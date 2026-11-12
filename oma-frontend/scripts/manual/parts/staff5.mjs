// Staff screens, part 5: the Fisheries Disaster page, Reports, the Admin settings, User Management, the Activity Log, Backup and My Profile.
import { A, F, click, clickIncl, wait, rowMenu, SEARCH, FILTERS, PRINT, DOWNLOAD, COLS, ROW1, PAGER, PAGER_ROW, FILTERS_ROW, PRINT_ROW, DOWNLOAD_ROW, SEARCH_ROW } from './common.mjs'

const H = '[class*="rounded-xl"]'
const field = (label, tag = 'label') => ({ text: label, tag, up: 1 })
const thl = (label) => ({ text: label, tag: 'th', up: 1, last: true })
const REPORT_TYPE = { find: { css: '#report-type' }, label: 'Report type', desc: 'Chooses the report: Registered Farmers, Fisherfolk & Organizations; Crop Records Harvested; Fisheries Production Harvested; Fisheries Disaster Reports; Crop / Parcel Disaster Reports; or Organization Assistance. The filters under it change with the report.' }
const REPORT_SELECTED = { find: { css: '[aria-label="Selected report"]' }, label: 'Selected report', desc: 'Repeats the report you chose, what it covers, the period and the filters applied right now.' }
const REPORT_PAPER = { find: { css: '[aria-label="Print-ready report preview template"]' }, label: 'Print-ready preview', desc: 'The report as it will print: the letterhead, the title, the period, the tables and the signature lines of the signers you chose. It changes as you change the filters or the signers.' }
const ROW_CLICK = ' Click a row to see that one record\'s individual report.'
const REPORT_SIGNERS = { find: { text: 'Signatories', tag: 'legend', closest: 'fieldset' }, label: 'Signatories', desc: 'Who signs the report: Prepared by (you, to start with), Checked by, Noted by and Approved by. Choose a name from each list, or leave it on None. The names print at the foot of Print and Preview PDF (Download Excel has no signature lines). The choice is for this printout only; the Admin keeps the names under Admin > Signatories.' }
const REPORT_BUTTONS = [
  REPORT_SELECTED,
  REPORT_SIGNERS,
  { find: { text: 'Print Report', tag: 'button', exact: true }, label: 'Print Report', desc: 'Opens the report as the same PDF as the preview, with the signature lines, ready to print.' },
  { find: { text: 'Download Report', tag: 'button', exact: true }, label: 'Download Report', desc: 'Saves the same report as a PDF file.' },
]
export const STAFF5 = [
  // ───────────────────────────── Fisheries Disaster ─────────────────────────────
  A({ id: 'admin-fisheries-disaster', file: 'admin/fisheries-disaster.png', url: '/disaster?tab=fisheries', title: 'Disaster > Fisheries Disaster', purpose: 'The disaster logs of ponds, cages and stocks, by fisherfolk.',
    callouts: [
      SEARCH_ROW('a log by fisherfolk, species, disaster type or reference number'),
      { ...FILTERS_ROW, desc: 'Opens the filter row: barangay, disaster type, status, year and the date it occurred (From and To).' },
      { find: { text: 'Log Disaster', tag: 'button', exact: true }, label: 'Log Disaster', desc: 'Reports a disaster for one fisherfolk (the next two pictures).' },
      { find: { css: 'main button[aria-expanded]', nth: 0 }, label: 'A fisherfolk row', desc: 'One row per fisherfolk with disasters, how many are active. Click it to open their disasters; click one to see its log.' },
      { find: { css: 'button[aria-label="Actions"], button[title="Actions"], main button[aria-haspopup]', nth: 0 }, label: 'Actions', desc: 'View Report (their disasters, with Print Report and Download Report inside), Print and Download (the same PDF straight away).' },
    ] }),
  A({ id: 'admin-log-fisheries-disaster', file: 'admin/log-fisheries-disaster.png', url: '/disaster?tab=fisheries', js: click('Log Disaster'), after: 2500, height: 2100, title: 'Log Fisheries Disaster: the ponds and cages', purpose: 'Fill in the disaster once, then tick the ponds and cages that were hit, for any fisherfolk, in one report.',
    callouts: [
      { find: { text: 'Log Disaster', tag: 'h2', in: '.modal-content' }, label: 'Window title', desc: 'One disaster on the ponds and cages of one fisherfolk or of many at once. The X (or Cancel) closes the window; what was typed is kept as a draft for next time.' },
      { find: { text: 'THE DISASTER', tag: 'h3', up: 1 }, label: 'The disaster', desc: 'Filled in once for everyone: the date of occurrence, the disaster type (Typhoon, Flooding, Storm Surge, El Nino, Drought, Red Tide or Other) and the description of damage.' },
      { find: { text: 'AFFECTED PONDS AND CAGES', tag: 'h3' }, label: 'Affected ponds and cages', desc: 'One row for each active cycle, with its fisherfolk and barangay. Click a cycle to open it and see all of its ponds and cages. Tick the ones that were hit: a cycle tick ticks all of its ponds and cages (and opens it), or tick them one by one. A line under the heading counts what is ticked.' },
      { find: { css: '.modal-content input[type=search]', nth: 0 }, label: 'Search box', desc: 'Find a fisherfolk by name or registration number, or a species, barangay, pond or cage. Filters has the Barangay filter, and Reset Filters clears it.' },
      { find: { text: 'Select every pond/cage shown', tag: 'label' }, label: 'Select every pond/cage shown', desc: 'Ticks everything the search and filters leave on the list, for example every pond of one barangay after a typhoon.' },
      { find: [{ text: 'Fingerlings Lost', tag: 'th', in: '.modal-content' }, { text: 'Total loss', tag: 'th', in: '.modal-content' }], label: 'Fingerlings Lost and Total loss', desc: 'For each ticked pond or cage: the fingerlings lost, or Total loss, which is the whole stocked count.' },
      { find: { text: 'DAMAGE NOT LINKED TO A STOCK', tag: 'h3', up: 1 }, label: 'Damage not linked to a stock', desc: 'For a fisherfolk whose pond, cage or equipment was damaged but who lost no stock: search by name or registration number and tick them. They need a pond or cage on record.' },
      { find: { text: 'Log Disaster', tag: 'button', exact: true, last: true }, label: 'Log Disaster', desc: 'Saves one disaster log for each fisherfolk affected, all together or not at all.' },
    ] }),
  A({ id: 'admin-fisheries-disaster-form', file: 'admin/fisheries-disaster-form.png', url: '/disaster?tab=fisheries', js: `${click('Log Disaster')}; ${wait(2500)}; const m=document.querySelector('.modal-content'); const put=(el,v)=>{ Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})) }; put(m.querySelector('input[type=search]'),'Danilo'); ${wait(1800)}; const t=m.querySelector('input[aria-label^="Select every pond/cage of"]'); if(t) t.click(); ${wait(1000)}; const f=m.querySelector('input[aria-label^="Fingerlings lost in"]'); if(f) put(f,'50'); ${wait(800)}`, after: 1500, height: 2100, title: 'Log Fisheries Disaster: after ticking', purpose: 'A stock is ticked, a count is typed, and the fisherfolk has a part of their own below.',
    callouts: [
      { find: { css: '.modal-content tbody tr:first-child input[type=checkbox]' }, label: 'Tick a cycle', desc: 'Ticking a cycle ticks all of its ponds and cages and opens it; clicking the cycle row opens or closes it without ticking. Each pond or cage also has its own tick, so one that was not hit can be left out.' },
      { find: { css: '.modal-content input[aria-label^="Fingerlings lost in"]', nth: 0 }, label: 'Fingerlings Lost', desc: 'The fingerlings lost in that pond or cage: a whole number, not more than were stocked. Leave it empty when the count is not known.' },
      { find: { css: '.modal-content input[aria-label$="is a total loss"]', nth: 1, closest: 'label' }, label: 'Total loss', desc: 'Marks the pond or cage as a total loss and fills in the whole stocked count. A stock becomes a Total Loss only when every pond or cage of it that is left is marked.' },
      { find: { css: '[data-testid=fisherfolk-panel]' }, label: 'Part of one fisherfolk', desc: 'Each fisherfolk who has something ticked gets a part of their own, with a summary line and the rows below. The arrow shows or hides it; the X removes the fisherfolk and un-ticks their ponds and cages.' },
      { find: { text: 'Equipment Damaged', tag: 'th', in: '.modal-content' }, label: 'Equipment Damaged', desc: 'Optional. Tick the pond, cage, feeding, water-quality or power equipment that was damaged; Feeds, Fingerlings and Other are in the list too.' },
      { find: { text: 'Volume Lost', tag: 'th', in: '.modal-content' }, label: 'Volume Lost (kg)', desc: 'Optional. The kg of fish lost, if known.' },
      { find: { text: 'Photo Documentation', tag: 'th', in: '.modal-content' }, label: 'Photo Documentation', desc: 'Optional photos of this fisherfolk (JPG, PNG or WEBP, up to 5 MB each, up to 10): Take Photo uses the camera, Add More Photos chooses files. They are saved only on this fisherfolk log.' },
      { find: { text: 'Log Disaster', tag: 'button', exact: true, last: true }, label: 'Log Disaster', desc: 'Saves one disaster log for each fisherfolk affected; with one fisherfolk the log opens so you can print or download it.' },
    ] }),
  // ───────────────────────────── Reports ─────────────────────────────
  A({ id: 'admin-reports', file: 'admin/reports.png', url: '/reports', height: 1400, title: 'Reports', purpose: 'One page for the official reports: choose a report, set its filters, choose who signs, then preview, print or download it.',
    callouts: [
      REPORT_TYPE,
      REPORT_SELECTED,
      REPORT_SIGNERS,
      ...REPORT_BUTTONS.slice(2),
      REPORT_PAPER,
    ] }),
  A({ id: 'admin-report-registered', file: 'admin/report-registered.png', url: '/reports?tab=registered', after: 1500, height: 1400, title: 'Report: Registered Farmers, Fisherfolk & Organizations', purpose: 'Registration records, ready to print.',
    callouts: [
      REPORT_TYPE,
      { find: { css: '#registered-kind' }, label: 'Report on', desc: 'Chooses what the report is about: Farmers, Fisherfolk, Farmers Organizations or Fisherfolk Organizations.' },
      { ...SEARCH_ROW('the person or organization to report on'), desc: 'Types a name or number to narrow the list. When the search leaves exactly one record, the report becomes that one record\'s individual report.' },
      { ...FILTERS_ROW, desc: 'Opens the filter row: Barangay and the Registered From / To dates.' },
      ...REPORT_BUTTONS,
      { ...REPORT_PAPER, desc: REPORT_PAPER.desc + ROW_CLICK },
    ] }),
  A({ id: 'admin-report-individual', file: 'admin/report-individual.png', url: '/reports?tab=registered', js: "const r=[...document.querySelectorAll('tr[role=button]')][0]; r&&r.click()", after: 3000, height: 1400, title: 'Report: an individual report', purpose: 'The report of one farmer, fisherfolk or organization.',
    callouts: [
      { find: { css: '[role=status]' }, label: 'Individual report', desc: 'Says whose report this is. It appears when you click a row of the list, or when your search leaves exactly one record.' },
      { find: { text: 'Show all records', tag: 'button' }, label: 'Show all records', desc: 'Goes back to the list of all the records that match the search and the filters. (When the search found the record, clear the search instead.)' },
      REPORT_SIGNERS,
      { find: { text: 'Print Report', tag: 'button', exact: true }, label: 'Print Report', desc: 'Prints this individual report as a PDF with the signature lines.' },
      { find: { text: 'Download Report', tag: 'button', exact: true }, label: 'Download Report', desc: 'Saves this individual report as a PDF file.' },
      { ...REPORT_PAPER, desc: 'The individual report as it will print: the details of the record, then its parcels and organizations (or members), with the signature lines.' },
    ] }),
  A({ id: 'admin-report-crop', file: 'admin/report-crop.png', url: '/reports?tab=harvested', after: 1500, height: 1400, title: 'Report: Crop Records Harvested', purpose: 'Harvested crops with their yield.',
    callouts: [
      REPORT_TYPE,
      { ...FILTERS_ROW, desc: 'Opens the filter row: the barangay, crop, season and the harvest period.' },
      ...REPORT_BUTTONS,
      { ...REPORT_PAPER, desc: `${REPORT_PAPER.desc} Its columns: Barangay, farmer, organization, crop, area planted and area harvested (ha), the estimated and actual harvest dates, and the estimated yield and actual yield (kg).` },
    ] }),
  A({ id: 'admin-report-fisheries-production', file: 'admin/report-fisheries-production.png', url: '/reports?tab=fisheries', after: 1500, height: 1400, title: 'Report: Fisheries Production Harvested', purpose: 'Harvested aquaculture production.',
    callouts: [
      REPORT_TYPE,
      { ...FILTERS_ROW, desc: 'Opens the filter row: barangay, species, season and the harvest period.' },
      ...REPORT_BUTTONS,
      { ...REPORT_PAPER, desc: `${REPORT_PAPER.desc} Its columns: Barangay, fisherfolk, organization, species, culture type, date stocked, harvest date, quantity (kg) and whether it is the final harvest of the cycle.` },
    ] }),
  A({ id: 'admin-report-fisheries-disaster', file: 'admin/report-fisheries-disaster.png', url: '/reports?tab=disaster_fisheries', after: 1500, height: 1400, title: 'Report: Fisheries Disaster Reports', purpose: 'Disasters of fisherfolk and their stocks.',
    callouts: [
      REPORT_TYPE,
      SEARCH_ROW('a log by fisherfolk, species, type or reference number'),
      { ...FILTERS_ROW, desc: 'Opens the filter row: barangay, disaster type, status and the period.' },
      ...REPORT_BUTTONS,
      { ...REPORT_PAPER, desc: `${REPORT_PAPER.desc} Its columns: Reference number, fisherfolk, barangay, stock or cycle, disaster type, date of occurrence, volume lost (kg), total loss, status and the date logged.` },
    ] }),
  A({ id: 'admin-report-org-assistance', file: 'admin/report-org-assistance.png', url: '/reports?tab=organization_assistance', after: 1500, height: 1400, title: 'Report: Organization Assistance', purpose: 'The assistance organizations gave to their members.',
    callouts: [
      REPORT_TYPE,
      { find: { css: '#assistance-kind' }, label: 'Report on', desc: 'Chooses Farmers Organizations or Fisherfolk Organizations.' },
      SEARCH_ROW('the organization'),
      FILTERS_ROW,
      ...REPORT_BUTTONS,
      { ...REPORT_PAPER, desc: `${REPORT_PAPER.desc}${ROW_CLICK} Its columns: Organization, date given, assistance, source agency, quantity, how many members received it, how many confirmed, and the status.` },
    ] }),

  // ───────────────────────────── Admin settings ─────────────────────────────
  A({ id: 'admin-crop-settings', file: 'admin/crop-settings.png', url: '/crop-settings', height: 1250, title: 'Admin > Crop Settings', purpose: 'The lists the crop forms use: crops, categories, seed sources, varieties, input types and equipment types.',
    callouts: [
      { find: [{ text: 'Crop Options', tag: 'button' }, { text: 'Categories', tag: 'button', exact: true }, { text: 'Seed Sources', tag: 'button' }, { text: 'Varieties', tag: 'button' }, { text: 'Input Types', tag: 'button' }, { text: 'Equipment Types', tag: 'button' }], label: 'Tabs', desc: 'Crop Options (the crops), Categories, Seed Sources, Varieties, Input Types (fertilizers, pesticides and so on) and Equipment Types (one list of machinery names: it is the Machinery dropdown of a farmer and the Equipment dropdown of a farmers organization, and it starts filled with the usual names). Each tab has its own table.' },
      SEARCH_ROW('a crop by name, category or subcategory'),
      { find: COLS, label: 'Columns', desc: 'Crop name, category, subcategory, growth duration in days (the expected harvest date is the date planted plus this), Planted As (Seed, Tree or Seed or Tree) and the yield per hectare in kg (the estimated yield is the area times this).' },
      { find: { css: 'tbody tr:first-child td:last-child button' }, label: 'Row menu', desc: 'The three dots of a row: Edit (opens the Edit Crop window, next picture) and Delete.' },
      { find: { text: 'Add Crop', tag: 'button', exact: true }, label: 'Add Crop', desc: 'The button is named after what it adds. A new row opens at the top of the table: fill it and press Save (or Cancel). The newest item is always first.' },
      { ...PAGER_ROW, find: PAGER },
    ] }),
  A({ id: 'admin-crop-settings-add', file: 'admin/crop-settings-add.png', url: '/crop-settings', js: click('Add Crop'), after: 1500, title: 'Adding a crop (inline row)', purpose: 'A new row opens at the top of the table.',
    callouts: [
      { find: { css: 'input[aria-label="New crop name"]' }, label: 'Crop name', desc: 'Required. The name of the crop.' },
      { find: [{ css: 'select[aria-label="Category"]' }, { css: 'select[aria-label="Subcategory"]' }], label: 'Category and Subcategory', desc: 'Optional. Choose from the lists kept on the Categories tab.' },
      { find: { css: 'input[aria-label="Growth duration in days"]' }, label: 'Growth duration (days)', desc: 'Required. How many days from planting to harvest.' },
      { find: { css: 'select[aria-label="Planted as"]' }, label: 'Planted As', desc: 'Seed, Tree, or Seed or Tree. It decides whether the crop forms ask for Qty of Seeds, Qty of Trees or both.' },
      { find: { css: 'input[aria-label="Yield per hectare in kg"]' }, label: 'Yield per hectare (kg)', desc: 'Optional. The usual yield per hectare; the estimated yield of a crop is its area times this.' },
      { find: { text: 'Save', tag: 'button', exact: true }, label: 'Save', desc: 'Saves the new crop at the top of the table.' },
      { find: { text: 'Cancel', tag: 'button', exact: true }, label: 'Cancel', desc: 'Discards the new row.' },
    ] }),
  A({ id: 'admin-crop-settings-edit', file: 'admin/crop-settings-edit.png', url: '/crop-settings', js: `${rowMenu}; ${wait(600)}; ${click('Edit')}`, after: 2500, height: 1900, title: 'Edit Crop window', purpose: 'Everything about one crop: its growth, units, stages and suggested activities.',
    callouts: [
      { find: [thl('Crop Name'), thl('Category'), thl('Subcategory')], label: 'Name, category and subcategory', desc: 'The crop name is required; the category and subcategory are optional.' },
      { find: [thl('Growth Duration'), thl('Planted As'), thl('Yield Per Hectare')], label: 'Growth, Planted As, Yield', desc: 'Growth duration in days and Planted As are required; the yield per hectare in kg is optional.' },
      { find: thl('Allowed Units of Measure'), label: 'Allowed Units of Measure', desc: 'The units a harvest of this crop may be counted in (for example Cavan (50kg)). Type a unit and press Add.' },
      { find: [thl('Vegetative'), thl('Flowering'), thl('Fruiting'), thl('Maturity')], label: 'Growth stages (days)', desc: 'Optional. The day each stage starts. The Log Activity window uses them to show the stage the crop is in.' },
      { find: { text: '+ Add Stage', tag: 'button' }, label: 'Add Stage', desc: 'Adds a stage with its suggested activity: the activity name, the day number, the priority (High, Medium or Low) and a recommendation text. These are the suggestions the Log Activity form fills in.' },
      { find: { text: 'Update Crop', tag: 'button' }, label: 'Update Crop', desc: 'Saves the changes.' },
    ] }),
  A({ id: 'admin-fisheries-settings', file: 'admin/fisheries-settings.png', url: '/fisheries-settings', title: 'Admin > Fisheries Settings', purpose: 'The lists the fisheries forms use.',
    callouts: [
      { find: [{ text: 'Species', tag: 'button', exact: true }, { text: 'Categories', tag: 'button', exact: true }, { text: 'Feed Types', tag: 'button' }, { text: 'Diseases', tag: 'button' }, { text: 'Fingerling Sources', tag: 'button' }, { text: 'Equipment Types', tag: 'button' }, { text: 'Fishing Gear', tag: 'button' }], label: 'Tabs', desc: 'Species, Categories, Feed Types (for the Feeding Log), Diseases (for the Health Log), Fingerling Sources (for Start Production Cycle), Equipment Types (the Equipment dropdown of fisherfolk organizations; it starts filled with the usual names) and Fishing Gear (for Log Catch).' },
      SEARCH_ROW('a species'),
      { find: COLS, label: 'Columns', desc: 'Species, category, environment, the culture duration in days (the target harvest), the survival rate in percent and the average weight in kg (used to estimate the harvest).' },
      { find: { css: 'tbody tr:first-child td:last-child button' }, label: 'Row menu', desc: 'Edit and Delete for the row.' },
      { find: { text: 'Add Species', tag: 'button', exact: true }, label: 'Add Species', desc: 'The button is named after what the tab holds. A new row opens at the top of the table: fill it and press Save.' },
    ] }),
  A({ id: 'admin-activity-settings', file: 'admin/activity-settings.png', url: '/activity-settings', height: 1250, title: 'Admin > Activity Settings', purpose: 'The activity types used in the crop and fisheries activity logs.',
    callouts: [
      { find: [{ text: 'Crop Activities', tag: 'button' }, { text: 'Fisheries Activities', tag: 'button' }], label: 'Crop / Fisheries Activities', desc: 'Switches between the activity types of crops (fertilizing, spraying and so on) and of fisheries.' },
      { find: { text: 'Activity Types', tag: 'h2', closest: H }, label: 'Activity Types', desc: 'The list the Activity box of Log Activity offers. The suggestions per crop are set in Crop Settings.' },
      { find: { css: 'tbody tr:first-child td:last-child button' }, label: 'Row menu', desc: 'Edit and Delete for the activity type.' },
      { find: { text: 'Add Activity Type', tag: 'button' }, label: 'Add Activity Type', desc: 'Opens a new row at the top: type the name and press Save.' },
    ] }),
  A({ id: 'admin-assistance-settings', file: 'admin/assistance-settings.png', url: '/assistance-settings', title: 'Admin > Assistance Settings', purpose: 'The source agencies and the assistance choices.',
    callouts: [
      { find: { text: 'Source Agencies', tag: 'h2', closest: H }, label: 'Source Agencies', desc: 'The agencies that give assistance. They are the choices of the Source Agency box when assistance is distributed or imported.' },
      { find: { css: 'tbody tr:first-child td:last-child button' }, label: 'Row menu', desc: 'Edit and Delete for the agency.' },
      { find: { text: 'Add Agency', tag: 'button' }, label: 'Add Agency', desc: 'Opens a new row at the top: type the agency name and press Save.' },
      { find: { text: 'Units by Assistance Type', tag: 'h2', closest: H }, label: 'Units by Assistance Type', desc: 'For each type of assistance that has a quantity box, the units its Unit box offers (Seeds: kg, sack, bag, bundle). Cash Assistance and Training have no unit.' },
      { find: { text: 'APPLICABLE UNITS', tag: 'th' }, label: 'Applicable Units', desc: 'The units offered for that type. The pencil opens a window to tick the units; at least one is needed.' },
    ] }),
  A({ id: 'admin-classification-settings', file: 'admin/classification-settings.png', url: '/classification-settings', title: 'Admin > Classification Settings', purpose: 'The parcel classifications.',
    callouts: [
      { find: { text: 'Parcel Classifications', tag: 'h2', closest: H }, label: 'Parcel Classifications', desc: 'The classifications you can tick on a farm parcel (Agrarian Reform Beneficiary, Organic Farm, Within Ancestral Domain and the others you add).' },
      { find: { css: 'tbody tr:first-child td:last-child button' }, label: 'Row menu', desc: 'Edit and Delete for the classification.' },
      { find: { text: 'Add Classification', tag: 'button' }, label: 'Add Classification', desc: 'Opens a new row at the top: type the name and press Save.' },
    ] }),
  A({ id: 'admin-harvest-unit-settings', file: 'admin/harvest-unit-settings.png', url: '/harvest-unit-settings', title: 'Admin > Harvest Unit Settings', purpose: 'How many kg one harvest unit weighs.',
    callouts: [
      { find: { text: 'Unit Weights', tag: 'h2', closest: H }, label: 'Unit Weights', desc: 'A harvest counted in sacks, cavans or another unit is saved in kilograms with these weights, so the totals and reports add up.' },
      { find: COLS, label: 'Columns', desc: 'The unit, the crops it applies to (one weight can be set for several crops at once; none chosen means every crop), the kg per unit and a note.' },
      { find: { css: 'tbody tr:first-child td:last-child button' }, label: 'Row menu', desc: 'Edit and Delete for the unit: they change or remove it for all of its crops.' },
      { find: { text: 'Add Unit', tag: 'button' }, label: 'Add Unit', desc: 'Opens a new row at the top: the unit, the crops (tick one or more, or none for every crop), the kg per unit and a note, then Save. A unit added here also appears in the unit list of the forms.' },
    ] }),

  // ───────────────────────────── Users, Activity Log, Backup, My Profile ─────────────────────────────
  A({ id: 'admin-users', file: 'admin/users.png', url: '/users', title: 'Admin > User Management', purpose: 'Creates and controls every account.',
    callouts: [
      { find: [{ text: 'Staff', tag: 'button', exact: true }, { text: 'Fisherfolk', tag: 'button', exact: true }, { text: 'Farmers', tag: 'button', exact: true }, { text: 'Organizations', tag: 'button', exact: true }], label: 'Account kinds', desc: 'Staff (Admin and Focal Person), Fisherfolk, Farmers and Organizations: one table for each kind of account.' },
      SEARCH_ROW('an account by name or email'),
      { ...FILTERS_ROW, desc: 'Opens the filter row: role and status.' },
      { find: { text: 'Create User', tag: 'button' }, label: 'Create User', desc: 'Opens Add New User: choose the role, fill in the name and contact details, then Add User.' },
      { find: COLS, label: 'Columns', desc: 'Name, email, role, status (Active or Inactive) and Actions.' },
      { find: { css: 'tbody tr:first-child td:last-child button' }, label: 'Actions menu', desc: 'Edit user changes the details and can turn the account off. Resend verification email sends the verification message again to an account that has not verified its email.' },
    ] }),
  A({ id: 'admin-audit-log', file: 'admin/audit-log.png', url: '/audit-log', height: 1900, title: 'Activity Log (Admin)', purpose: 'Who changed what, and when. Open it from the account menu at the top right.',
    callouts: [
      { find: FILTERS, label: 'Filters', desc: 'Opens the filter row (next picture).' },
      { find: COLS, label: 'Columns', desc: 'The date and time, the user, the action (Create, Update or Delete), the model (what kind of record) and a description of the change.' },
      { find: { text: 'Next', tag: 'button', exact: true, last: true }, label: 'Previous / Next', desc: 'Moves through the pages of the log, newest first.' },
    ] }),
  A({ id: 'admin-audit-log-filters', file: 'admin/audit-log-filters.png', url: '/audit-log', js: click('Filters'), after: 1500, title: 'Activity Log filters', purpose: 'Find one kind of change.',
    callouts: [
      { find: { text: 'Model', tag: 'label' }, label: 'Model', desc: 'Only one kind of record (Farmer, Farm Parcel, Fisherfolk, Beneficiary Record and the others).' },
      { find: { text: 'Action', tag: 'label' }, label: 'Action', desc: 'Only Create, Update or Delete.' },
      { find: [{ text: 'Date From', tag: 'label' }, { text: 'Date To', tag: 'label' }], label: 'Date From / To', desc: 'Only changes made in that period. On a phone each date is a row of its own.' },
    ] }),
  A({ id: 'admin-backup', file: 'admin/backup.png', url: '/backup', height: 1500, title: 'Admin > Backup & Restore', purpose: 'Makes a copy of the whole system and saves it to your computer, or puts one back.',
    callouts: [
      { find: { text: 'Download backup', tag: 'button' }, label: 'Download backup', desc: 'Opens Download Backup: type a name and the Location where you will keep the file (both can be left empty), then Start Backup. A backup is made only when you press this. When it is done, its file (.zip) is saved to your computer and is no longer kept online. While one runs, nothing else can be done on this page.' },
      { find: { text: 'Restore', tag: 'button', exact: true, nth: 0 }, label: 'Restore', desc: 'Opens the Restore Backup form (next picture): drop a backup file, see what it would change, then confirm with your password.' },
      { find: { css: '[data-testid=backup-group-farmers]' }, label: 'What a backup holds', desc: 'One card for each group of records, with how many there are now. A backup also holds every uploaded photo and file.' },
      { find: { text: 'Include the audit trail and notification history', tag: 'span', closest: 'label' }, label: 'Audit trail and notifications', desc: 'Optional. Tick it to put the activity log and the notifications in the file too. Left unticked the backup is smaller and quicker, and a restore of it keeps the activity log and notifications already in the system.' },
      { find: { text: 'Backup history', tag: 'h2', closest: H }, label: 'Backup history', desc: 'Every backup, newest first: its name, date, time, location (where you keep its file), kind (Manual, Before restore or Restore), who made it, size and status. Nothing is removed from this list. The three dots at the end of a row open its menu: Download saves the file while it is still online, Edit changes the name, the location and the remarks (not the date or the time), and Restore opens the Restore form.' },
    ] }),
  A({ id: 'admin-restore', file: 'admin/restore.png', url: '/backup', height: 1500, wait: 5000,
    js: `const API='http://127.0.0.1:8001/api/backups/'; const t=localStorage.getItem('accessToken'); const H={Authorization:'Bearer '+t,'Content-Type':'application/json'}; const mk=await (await fetch(API,{method:'POST',headers:H,body:JSON.stringify({name:'Shoot copy',include_audit:false})})).json(); let row=null; for(let i=0;i<14;i++){ await new Promise(r=>setTimeout(r,2000)); const l=await (await fetch(API,{headers:H})).json(); row=l.results.find(x=>x.id===mk.id); if(row&&row.status!=='running') break } const blob=await (await fetch(API+mk.id+'/download/',{headers:{Authorization:'Bearer '+t}})).blob(); [...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Restore').click(); await new Promise(r=>setTimeout(r,1000)); const dt=new DataTransfer(); dt.items.add(new File([blob], row.file_name, {type:'application/zip'})); const inp=document.querySelector('.modal-content input[type=file]'); inp.files=dt.files; inp.dispatchEvent(new Event('change',{bubbles:true})); await new Promise(r=>setTimeout(r,6000))`,
    after: 1000, title: 'Admin > Backup & Restore: Restore Backup', purpose: 'Drop a backup file, see what it would change, then confirm with your password.',
    callouts: [
      { find: { css: '.modal-content [class*="border-dashed"]' }, label: 'Drag the file here, or Browse files', desc: 'Drop the .zip file saved from this page, or press Browse files to choose it. Choose another file starts again. A backup made on another copy of the system is accepted too. Reading the file changes nothing.' },
      { find: { text: 'Backup', tag: 'h3', exact: true, up: 1 }, label: 'Which backup it is', desc: 'The name, when it was made and by whom, where it was kept, the file, and how many records and files it holds next to how many records the system holds now.' },
      { find: { css: 'table[aria-label="What this restore would change"]' }, label: 'What a restore does', desc: 'Group by group: the records in the backup, the records now, and what a restore does (records put back, records removed, no change). A group the file leaves out, such as the activity log of a backup made without the audit trail, is kept as it is.' },
      { find: { css: '#restore-password' }, label: 'Your password', desc: 'Required. It confirms that you are the one restoring.' },
      { find: { text: 'Restore', tag: 'button', exact: true, last: true }, label: 'Restore', desc: 'Makes a safety backup of how things are now and saves it to your computer, then puts the backup back: records, uploaded files, user accounts and passwords. While it runs, nothing else can be done on the page: keep it open.' },
    ] }),
  A({ id: 'admin-signatories', file: 'admin/signatories.png', url: '/signatories', title: 'Admin > Signatories', purpose: 'The names that can sign the reports.',
    callouts: [
      { find: { text: 'Add Signatory', tag: 'button' }, label: 'Add Signatory', desc: 'Adds a row at the top of the table: type the name and the position printed under it, choose the signing role (Prepared by, Checked by, Noted by or Approved by) and the order, then Save. A person who signs in two roles is added twice.' },
      { find: COLS, label: 'Columns', desc: 'Name, position, signing role, order and whether the name is Active. The order sorts the names inside their role. A name that is not Active is no longer offered in the Reports pages.' },
      { find: { css: 'tbody tr:first-child td:last-child button' }, label: 'Row menu', desc: 'Edit and Delete for the name. Delete does not change reports that were already printed.' },
    ] }),
  A({ id: 'admin-profile', file: 'admin/profile.png', url: '/profile', title: 'My Profile (staff)', purpose: 'Your own account.',
    callouts: [
      { find: { css: 'button[aria-label="Edit profile"], button[title="Edit profile"]' }, label: 'Edit profile', desc: 'The pencil at the top right changes your name, contact number and the other details of your account.' },
      { find: { css: 'button[aria-label="Upload a new photo"], button[title="Upload a new photo"]' }, label: 'Upload a new photo', desc: 'The camera button changes your profile photo (JPG, PNG or WEBP, up to 5 MB).' },
    ] }),
]
