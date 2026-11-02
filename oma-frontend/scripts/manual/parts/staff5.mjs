// Staff screens, part 5: the Fisheries Disaster page, Reports, the Admin settings, User Management, the Activity Log, Backup and My Profile.
import { A, F, click, clickIncl, wait, rowMenu, SEARCH, FILTERS, PRINT, DOWNLOAD, COLS, ROW1, PAGER, PAGER_ROW, FILTERS_ROW, PRINT_ROW, DOWNLOAD_ROW, SEARCH_ROW } from './common.mjs'

const H = '[class*="rounded-xl"]'
const field = (label, tag = 'label') => ({ text: label, tag, up: 1 })
const openReport = (name) => `const a=[...document.querySelectorAll('a')].find(x=>x.textContent.includes(${JSON.stringify(name)})); a&&a.click(); ${wait(3000)}`
const REPORT_BUTTONS = [
  { find: { text: 'Print', tag: 'button', exact: true }, label: 'Print', desc: 'Opens the report as the same PDF as the preview, ready to print.' },
  { find: { text: 'Preview PDF', tag: 'button' }, label: 'Preview PDF', desc: 'Shows the report as a PDF to read on screen. The document is titled with the period covered.' },
  { find: { text: 'Download Excel', tag: 'button' }, label: 'Download Excel', desc: 'Saves the rows of the report as an Excel file.' },
]
const REPORT_BACK = { find: { text: 'Back to Reports', tag: 'a' }, label: 'Back to Reports', desc: 'Returns to the list of reports.' }
const MORE = (what) => ({ find: { css: 'tbody tr', nth: 0 }, label: 'Preview table', desc: `The ${what} exactly as it will print, one row per record. It follows the filters.` })

export const STAFF5 = [
  // ───────────────────────────── Fisheries Disaster ─────────────────────────────
  A({ id: 'admin-fisheries-disaster', file: 'admin/fisheries-disaster.png', url: '/disaster?tab=fisheries', title: 'Disaster > Fisheries Disaster', purpose: 'The disaster logs of ponds, cages and stocks, by fisherfolk.',
    callouts: [
      SEARCH_ROW('a log by fisherfolk, species, disaster type or reference number'),
      { ...FILTERS_ROW, desc: 'Opens the filter row: barangay, disaster type, status, year and the date it occurred (From and To).' },
      PRINT_ROW, DOWNLOAD_ROW,
      { find: { text: 'Log Disaster', tag: 'button', exact: true }, label: 'Log Disaster', desc: 'Reports a disaster for one fisherfolk (the next two pictures).' },
      { find: { css: 'main button[aria-expanded]', nth: 0 }, label: 'A fisherfolk row', desc: 'One row per fisherfolk with disasters, how many are active. Click it to open their disasters; click one to see its log.' },
      { find: { css: 'button[aria-label="Actions"], button[title="Actions"], main button[aria-haspopup]', nth: 0 }, label: 'Actions', desc: 'View Report (their disasters, with Print Report and Download Report inside), Print and Download (the same PDF straight away).' },
    ] }),
  A({ id: 'admin-log-fisheries-disaster', file: 'admin/log-fisheries-disaster.png', url: '/disaster?tab=fisheries', js: click('Log Disaster'), after: 1500, title: 'Log Fisheries Disaster: choose the fisherfolk', purpose: 'Step 1: find the fisherfolk whose pond, cage or stock was hit.',
    callouts: [
      { find: { text: 'Log Fisheries Disaster', tag: 'h2' }, label: 'Window title', desc: 'Step 1 of 3. A disaster is logged for one fisherfolk at a time. The X (or Cancel) closes the window.' },
      { find: { css: 'input[placeholder^="Search fisherfolk by"]' }, label: 'Search box', desc: 'Type the fisherfolk\'s name. The matches appear under the box.' },
      { find: { css: '[data-testid=person-results]' }, label: 'Matches', desc: 'Click the fisherfolk to continue. Someone with no pond, cage or stock on record cannot be chosen.' },
    ] }),
  A({ id: 'admin-fisheries-disaster-form', file: 'admin/fisheries-disaster-form.png', url: '/disaster?tab=fisheries', js: `${click('Log Disaster')}; ${wait(1200)}; const i=document.querySelector('input[placeholder^="Search fisherfolk by"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Pablo'); i.dispatchEvent(new Event('input',{bubbles:true})); ${wait(2000)}; const pb=document.querySelector('[data-testid=person-results] button'); if(pb) pb.click()`, after: 3500, height: 1100, title: 'Log Fisheries Disaster: the form', purpose: 'Step 2: the stock that was hit, the disaster and the damage.',
    callouts: [
      { find: { text: 'Affected Stock', tag: 'label', up: 1 }, label: 'Affected Stock', desc: 'Required. One or more stocks: tick the affected stocks in the list (a search box finds them by species, cycle or location). Or Not linked to a stock, for pond, cage or equipment damage only.' },
      { find: { text: 'Date of Occurrence', tag: 'label', up: 1 }, label: 'Date of Occurrence', desc: 'Required. The day the disaster happened.' },
      { find: { text: 'Disaster Type', tag: 'label', up: 1 }, label: 'Disaster Type', desc: 'Required: Typhoon, Flooding, Storm Surge, El Niño, Drought, Red Tide, Fish Kill or Other.' },
      { find: { text: 'Volume Lost', tag: 'label', up: 1 }, label: 'Volume Lost (kg)', desc: 'Optional. The kg of fish lost, if known.' },
      { find: { text: 'Equipment Damaged', tag: 'label', up: 1 }, label: 'Equipment Damaged', desc: 'Optional. Tick the pond, cage, feeding, water-quality or power equipment that was damaged; Feeds, Fingerlings and Other are in the list too.' },
      { find: { text: 'Description of Damage', tag: 'label', up: 1 }, label: 'Description of Damage', desc: 'Optional notes about the damage to the stock, pond or cage and equipment.' },
      { find: [{ text: 'Take Photo', tag: 'button' }, { text: 'Add More Photos', tag: 'button' }], label: 'Photos', desc: 'Take Photo uses the camera; Add More Photos chooses files (JPG, PNG or WEBP, up to 5 MB each, up to 10).' },
      { find: { text: 'Log Disaster', tag: 'button', exact: true, last: true }, label: 'Log Disaster', desc: 'Saves the disaster log of this fisherfolk; the log opens so you can print or download it.' },
    ] }),

  // ───────────────────────────── Reports ─────────────────────────────
  A({ id: 'admin-reports', file: 'admin/reports.png', url: '/reports', title: 'Reports', purpose: 'The official reports, ready to preview, print or download.',
    callouts: [
      { find: { text: 'Registered Farmers, Fisherfolk & Organizations', closest: 'a' }, label: 'Registered Farmers, Fisherfolk & Organizations', desc: 'Registration records for farmers, fisherfolk and both kinds of organization: all of them, or one record, filtered by barangay and date registered.' },
      { find: { text: 'Crop Records Harvested', closest: 'a' }, label: 'Crop Records Harvested', desc: 'Harvested crop records with their yield, by farmer, crop, barangay and season.' },
      { find: { text: 'Fisheries Production Harvested', closest: 'a' }, label: 'Fisheries Production Harvested', desc: 'Harvested aquaculture production, by fisherfolk, species, barangay and season.' },
      { find: { text: 'Fisheries Disaster Reports', closest: 'a' }, label: 'Fisheries Disaster Reports', desc: 'Disasters logged against fisherfolk and their stocks, with the volume lost and the recovery status.' },
      { find: { text: 'Crop / Parcel Disaster Reports', closest: 'a' }, label: 'Crop / Parcel Disaster Reports', desc: 'Disasters logged against crops and farm parcels, with the area affected and the recovery status.' },
      { find: { text: 'Organization Assistance', exact: true, closest: 'a' }, label: 'Organization Assistance', desc: 'The assistance organizations gave to their members, for one organization or all, with who received it.' },
    ] }),
  A({ id: 'admin-report-registered', file: 'admin/report-registered.png', url: '/reports', js: openReport('Registered Farmers'), after: 1500, title: 'Report: Registered Farmers, Fisherfolk & Organizations', purpose: 'Registration records, ready to print.',
    callouts: [
      REPORT_BACK,
      { find: [{ text: 'Farmers', tag: 'button', exact: true }, { text: 'Fisherfolk', tag: 'button', exact: true }, { text: 'Farmers Organizations', tag: 'button' }, { text: 'Fisherfolk Organizations', tag: 'button' }], label: 'What to report', desc: 'Choose Farmers, Fisherfolk, Farmers Organizations or Fisherfolk Organizations.' },
      { find: [{ text: 'All records (bulk)', tag: 'button' }, { text: 'One farmer', tag: 'button' }], label: 'All records / One record', desc: 'All records (bulk) reports everyone that matches the filters. One farmer (or fisherfolk, organization) searches one person and reports only that record.' },
      SEARCH_ROW('the person or organization to report on'),
      { ...FILTERS_ROW, desc: 'Opens the filter row: Barangay and the Registered From / To dates.' },
      ...REPORT_BUTTONS,
      MORE('registration records'),
    ] }),
  A({ id: 'admin-report-crop', file: 'admin/report-crop.png', url: '/reports', js: openReport('Crop Records Harvested'), after: 1500, title: 'Report: Crop Records Harvested', purpose: 'Harvested crops with their yield.',
    callouts: [
      REPORT_BACK,
      { ...FILTERS_ROW, desc: 'Opens the filter row: the barangay, crop, season and the harvest period.' },
      ...REPORT_BUTTONS,
      { find: COLS, label: 'Columns', desc: 'Barangay, farmer, organization, crop, area planted and area harvested (ha), the estimated and actual harvest dates, and the estimated yield and actual yield (kg).' },
    ] }),
  A({ id: 'admin-report-fisheries-production', file: 'admin/report-fisheries-production.png', url: '/reports', js: openReport('Fisheries Production Harvested'), after: 1500, title: 'Report: Fisheries Production Harvested', purpose: 'Harvested aquaculture production.',
    callouts: [
      REPORT_BACK,
      { ...FILTERS_ROW, desc: 'Opens the filter row: barangay, species, season and the harvest period.' },
      ...REPORT_BUTTONS,
      { find: COLS, label: 'Columns', desc: 'Barangay, fisherfolk, organization, species, culture type, date stocked, harvest date, quantity (kg) and whether it is the final harvest of the cycle.' },
    ] }),
  A({ id: 'admin-report-fisheries-disaster', file: 'admin/report-fisheries-disaster.png', url: '/reports', js: openReport('Fisheries Disaster Reports'), after: 1500, title: 'Report: Fisheries Disaster Reports', purpose: 'Disasters of fisherfolk and their stocks.',
    callouts: [
      REPORT_BACK,
      SEARCH_ROW('a log by fisherfolk, species, type or reference number'),
      { ...FILTERS_ROW, desc: 'Opens the filter row: barangay, disaster type, status and the period.' },
      ...REPORT_BUTTONS,
      { find: COLS, label: 'Columns', desc: 'Reference number, fisherfolk, barangay, stock or cycle, disaster type, date of occurrence, volume lost (kg), total loss, status and the date logged.' },
    ] }),
  A({ id: 'admin-report-org-assistance', file: 'admin/report-org-assistance.png', url: '/reports', js: openReport('Organization Assistance'), after: 1500, title: 'Report: Organization Assistance', purpose: 'The assistance organizations gave to their members.',
    callouts: [
      REPORT_BACK,
      { find: [{ text: 'Farmers Organizations', tag: 'button' }, { text: 'Fisherfolk Organizations', tag: 'button' }], label: 'Kind of organization', desc: 'Choose Farmers Organizations or Fisherfolk Organizations.' },
      { find: [{ text: 'All organizations', tag: 'button' }, { text: 'One organization', tag: 'button' }], label: 'All / One organization', desc: 'All organizations reports every distribution; One organization searches one and reports only its own.' },
      SEARCH_ROW('the organization'),
      FILTERS_ROW,
      ...REPORT_BUTTONS,
      { find: COLS, label: 'Columns', desc: 'Organization, date given, assistance, source agency, quantity, how many members received it, how many confirmed, and the status.' },
    ] }),

  // ───────────────────────────── Admin settings ─────────────────────────────
  A({ id: 'admin-crop-settings', file: 'admin/crop-settings.png', url: '/crop-settings', title: 'Admin > Crop Settings', purpose: 'The lists the crop forms use: crops, categories, seed sources, varieties, input types and equipment types.',
    callouts: [
      { find: [{ text: 'Crop Options', tag: 'button' }, { text: 'Categories', tag: 'button', exact: true }, { text: 'Seed Sources', tag: 'button' }, { text: 'Varieties', tag: 'button' }, { text: 'Input Types', tag: 'button' }, { text: 'Equipment Types', tag: 'button' }], label: 'Tabs', desc: 'Crop Options (the crops), Categories, Seed Sources, Varieties, Input Types (fertilizers, pesticides and so on) and Equipment Types (the machinery names used for farmers and farmers organizations). Each tab has its own table.' },
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
      { find: [field('Crop Name'), field('Category'), field('Subcategory')], label: 'Name, category and subcategory', desc: 'The crop name is required; the category and subcategory are optional.' },
      { find: [field('Growth Duration'), field('Planted As'), field('Yield Per Hectare')], label: 'Growth, Planted As, Yield', desc: 'Growth duration in days and Planted As are required; the yield per hectare in kg is optional.' },
      { find: { text: 'Allowed Units of Measure', tag: 'label', up: 1 }, label: 'Allowed Units of Measure', desc: 'The units a harvest of this crop may be counted in (for example Cavan (50kg)). Type a unit and press Add.' },
      { find: [field('Vegetative'), field('Flowering'), field('Fruiting'), field('Maturity')], label: 'Growth stages (days)', desc: 'Optional. The day each stage starts. The Record Activity window uses them to show the stage the crop is in.' },
      { find: { text: '+ Add Stage', tag: 'button' }, label: 'Add Stage', desc: 'Adds a stage with its suggested activity: the activity name, the day number, the priority (High, Medium or Low) and a recommendation text. These are the suggestions Get Suggestions shows.' },
      { find: { text: 'Update Crop', tag: 'button' }, label: 'Update Crop', desc: 'Saves the changes.' },
    ] }),
  A({ id: 'admin-fisheries-settings', file: 'admin/fisheries-settings.png', url: '/fisheries-settings', title: 'Admin > Fisheries Settings', purpose: 'The lists the fisheries forms use.',
    callouts: [
      { find: [{ text: 'Species', tag: 'button', exact: true }, { text: 'Categories', tag: 'button', exact: true }, { text: 'Feed Types', tag: 'button' }, { text: 'Diseases', tag: 'button' }, { text: 'Fingerling Sources', tag: 'button' }, { text: 'Equipment Types', tag: 'button' }, { text: 'Fishing Gear', tag: 'button' }], label: 'Tabs', desc: 'Species, Categories, Feed Types (for the Feeding Log), Diseases (for the Health Log), Fingerling Sources (for Start Production Cycle), Equipment Types (for fisherfolk organizations) and Fishing Gear (for Log Catch).' },
      SEARCH_ROW('a species'),
      { find: COLS, label: 'Columns', desc: 'Species, category, environment, the culture duration in days (the target harvest), the survival rate in percent and the average weight in kg (used to estimate the harvest).' },
      { find: { css: 'tbody tr:first-child td:last-child button' }, label: 'Row menu', desc: 'Edit and Delete for the row.' },
      { find: { text: 'Add Species', tag: 'button', exact: true }, label: 'Add Species', desc: 'The button is named after what the tab holds. A new row opens at the top of the table: fill it and press Save.' },
    ] }),
  A({ id: 'admin-activity-settings', file: 'admin/activity-settings.png', url: '/activity-settings', title: 'Admin > Activity Settings', purpose: 'The activity types used in the crop and fisheries activity logs.',
    callouts: [
      { find: [{ text: 'Crop Activities', tag: 'button' }, { text: 'Fisheries Activities', tag: 'button' }], label: 'Crop / Fisheries Activities', desc: 'Switches between the activity types of crops (fertilizing, spraying and so on) and of fisheries.' },
      { find: { text: 'Activity Types', tag: 'h2', closest: H }, label: 'Activity Types', desc: 'The list the Activity box of Record Activity offers. The suggestions per crop are set in Crop Settings.' },
      { find: { css: 'tbody tr:first-child td:last-child button' }, label: 'Row menu', desc: 'Edit and Delete for the activity type.' },
      { find: { text: 'Add Activity Type', tag: 'button' }, label: 'Add Activity Type', desc: 'Opens a new row at the top: type the name and press Save.' },
    ] }),
  A({ id: 'admin-assistance-settings', file: 'admin/assistance-settings.png', url: '/assistance-settings', title: 'Admin > Assistance Settings', purpose: 'The source agencies and the assistance choices.',
    callouts: [
      { find: { text: 'Source Agencies', tag: 'h2', closest: H }, label: 'Source Agencies', desc: 'The agencies that give assistance. They are the choices of the Source Agency box when assistance is distributed or imported.' },
      { find: { css: 'tbody tr:first-child td:last-child button' }, label: 'Row menu', desc: 'Edit and Delete for the agency.' },
      { find: { text: 'Add Agency', tag: 'button' }, label: 'Add Agency', desc: 'Opens a new row at the top: type the agency name and press Save.' },
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
      { find: COLS, label: 'Columns', desc: 'The unit, the crop it applies to (a unit can have a different weight for each crop), the kg per unit and a note.' },
      { find: { css: 'tbody tr:first-child td:last-child button' }, label: 'Row menu', desc: 'Edit and Delete for the unit.' },
      { find: { text: 'Add Unit', tag: 'button' }, label: 'Add Unit', desc: 'Opens a new row at the top: the unit, the crop, the kg per unit and a note, then Save. A unit added here also appears in the unit list of the forms.' },
    ] }),

  // ───────────────────────────── Users, Activity Log, Backup, My Profile ─────────────────────────────
  A({ id: 'admin-users', file: 'admin/users.png', url: '/users', title: 'Admin > User Management', purpose: 'Creates and controls every account.',
    callouts: [
      { find: [{ text: 'Staff', tag: 'button', exact: true }, { text: 'Fisherfolk', tag: 'button', exact: true }, { text: 'Farmers', tag: 'button', exact: true }, { text: 'Organizations', tag: 'button', exact: true }], label: 'Account kinds', desc: 'Staff (Admin and Focal Person), Fisherfolk, Farmers and Organizations: one table for each kind of account.' },
      SEARCH_ROW('an account by name or email'),
      { ...FILTERS_ROW, desc: 'Opens the filter row: role and status.' },
      { find: { text: 'Create User', tag: 'button' }, label: 'Create User', desc: 'Opens Add New User: choose the role, then Next to fill in the details of the new staff account.' },
      { find: COLS, label: 'Columns', desc: 'Name, email, role, status (Active or Inactive) and Actions.' },
      { find: { css: 'tbody tr:first-child td:last-child button' }, label: 'Actions menu', desc: 'Edit user changes the details and can turn the account off. Resend verification email sends the verification message again to an account that has not verified its email.' },
    ] }),
  A({ id: 'admin-audit-log', file: 'admin/audit-log.png', url: '/audit-log', title: 'Activity Log (Admin)', purpose: 'Who changed what, and when. Open it from the account menu at the top right.',
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
  A({ id: 'admin-backup', file: 'admin/backup.png', url: '/backup', title: 'Admin > Backup', purpose: 'Makes and downloads a copy of the whole system.',
    callouts: [
      { find: { text: 'Back up now', tag: 'button' }, label: 'Back up now', desc: 'Starts a backup in the background (a few minutes). The list updates by itself. The system also makes one every night by itself.' },
      { find: { text: 'Backups', tag: 'h2', closest: H }, label: 'Backups list', desc: 'Each backup with its date, who made it (or Scheduled for the nightly one), its size and its status: Running, Done or Failed. The latest 14 are kept.' },
      { find: { text: 'Download', tag: 'button', exact: true }, label: 'Download', desc: 'Saves the backup file (a .zip with the database and the uploaded files) to your computer. It holds personal records and is not encrypted: keep it somewhere safe.' },
      { find: { text: 'Delete', tag: 'button', exact: true }, label: 'Delete', desc: 'Removes a backup and its file after you confirm.' },
    ] }),
  A({ id: 'admin-profile', file: 'admin/profile.png', url: '/profile', title: 'My Profile (staff)', purpose: 'Your own account.',
    callouts: [
      { find: { css: 'button[aria-label="Edit profile"], button[title="Edit profile"]' }, label: 'Edit profile', desc: 'The pencil at the top right changes your name, contact number and the other details of your account.' },
      { find: { css: 'button[aria-label="Upload a new photo"], button[title="Upload a new photo"]' }, label: 'Upload a new photo', desc: 'The camera button changes your profile photo (JPG, PNG or WEBP, up to 5 MB).' },
    ] }),
]
