// Staff screens, part 4: Fisheries Management (Aquaculture and Capture Monitoring), Forecasting and Assistance.
import { A, click, clickIncl, wait, rowMenu, SEARCH, FILTERS, PRINT, DOWNLOAD, COLS, ROW1, PAGER, PAGER_ROW, FILTERS_ROW, PRINT_ROW, DOWNLOAD_ROW, SEARCH_ROW } from './common.mjs'

const H = '[class*="rounded-xl"]'
const field = (label, tag = 'label') => ({ text: label, tag, up: 1 })
const lastRowMenu = (item) => `const r=document.querySelector('tbody tr'); const bs=r.querySelectorAll('button'); bs[bs.length-1].click(); ${wait(700)}; ${item ? `const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(item)}); b&&b.click()` : ''}`
const DOTS = { css: 'tbody tr:first-child td:last-child button', nth: 0 }
const ASSIST_TABS = [
  { find: [{ text: 'Current', tag: 'button', exact: true }, { text: 'History', tag: 'button', exact: true }], label: 'Current / History', desc: 'Current lists the assistance that is scheduled, awaiting confirmation or needs follow-up (the recipients who reported that they did not receive it, so the office can look into each one). History lists what was received and confirmed, or resolved. On History, Print Report and Download Report give the list as filtered, and the three dots of a row print or download that one distribution.' },
  { find: { text: 'Import File', tag: 'button' }, label: 'Import File', desc: 'Brings in assistance records from a spreadsheet (xlsx, xls or csv). Download the Excel template, fill it in, choose it, then Preview Import to check it before saving. Undo a recent import reverses a recent import you made by mistake.' },
]

export const STAFF4 = [
  // ───────────────────────────── Aquaculture Monitoring ─────────────────────────────
  A({ id: 'admin-aquaculture', file: 'admin/aquaculture.png', url: '/fisheries-monitoring?tab=stocking', width: 2000, js: "document.querySelector('tbody tr').click()", after: 2500, title: 'Fisheries Management > Aquaculture Monitoring', purpose: 'Follows every production cycle of ponds and cages, from stocking to harvest.',
    callouts: [
      { find: { text: 'Start Production Cycle', tag: 'button' }, label: 'Start Production Cycle', desc: 'Opens the form that starts a new production cycle for a fisherfolk (next picture but one).' },
      SEARCH_ROW('a cycle by fisherfolk name, RSBSA number, species or barangay'),
      { ...FILTERS_ROW, desc: 'Opens the filter row: pond or cage name, status, species, season, year and the Stocked From / To dates.' },
      PRINT_ROW, DOWNLOAD_ROW,
      { find: COLS, label: 'Columns', desc: 'Ownership (Tenant, Lease or Owner), species, fisherfolk, culture type (pond or cage), cycle number, date stocked, expected harvest, estimated and actual harvest (kg), organization, pond location, status and Actions.' },
      { find: { text: 'PCIC INSURED', tag: 'th' }, label: 'PCIC Insured', desc: 'Click a row to open its ponds or cages. Each pond or cage has its own round check: green with a white check when it is insured, an empty circle when it is not. The insurance is changed in the cycle\'s Edit form.' },
      { find: { css: 'tbody tr:first-child td:last-child button', nth: 0 }, label: 'Harvest / Actions', desc: 'The harvest button of a row is grayed out until at least half of the expected time has passed. The three dots next to it open the menu of the cycle.' },
      { ...PAGER_ROW, find: PAGER },
    ] }),
  A({ id: 'admin-aquaculture-filters', file: 'admin/aquaculture-filters.png', url: '/fisheries-monitoring?tab=stocking', js: click('Filters'), after: 1200, title: 'Aquaculture Monitoring filters', purpose: 'Narrow the cycles; Print Report and Download Report follow the filters.',
    callouts: [
      { find: { css: 'input[type=search]', nth: 1 }, label: 'Pond or cage name', desc: 'Type part of the pond or cage name.' },
      { find: { css: 'select', nth: 0 }, label: 'Status', desc: 'Stocked, Near Harvest, Late, Harvested, Total Loss or All Status.' },
      { find: { css: 'select', nth: 1 }, label: 'Species', desc: 'Only one species (bangus, tilapia, dalag, hito, shrimp and so on).' },
      { find: { css: 'select', nth: 2 }, label: 'Season', desc: 'Dry Season or Wet Season.' },
      { find: { css: 'select', nth: 3 }, label: 'Year', desc: 'The year the cycle was stocked.' },
      { find: [{ text: 'Stocked From', tag: 'label' }, { text: 'Stocked To', tag: 'label' }], label: 'Stocked From / To', desc: 'The first and last date stocked. Either can be left empty.' },
    ] }),
  A({ id: 'admin-aquaculture-menu', file: 'admin/aquaculture-menu.png', url: '/fisheries-monitoring?tab=stocking', width: 2000, js: lastRowMenu(), after: 800, title: 'The menu of a production cycle', purpose: 'The actions of one cycle.',
    callouts: [
      { find: { text: 'View Details', tag: 'button' }, label: 'View Details', desc: 'Shows the cycle\'s details: fisherfolk, species, dates, ponds, fingerlings, estimated and actual harvest.' },
      { find: { text: 'Edit', tag: 'button', exact: true }, label: 'Edit', desc: 'Changes the cycle (dates, ownership, the number of fingerlings, PCIC insurance of each pond or cage).' },
      { find: { text: 'Cycle & Logs', tag: 'button' }, label: 'Cycle & Logs', desc: 'Opens the cycle with its Feeding Log and Health Log, where the daily work is recorded.' },
      { find: { text: 'Force Harvest', tag: 'button' }, label: 'Force Harvest', desc: 'Harvests the cycle before it is ready, for a reason such as an upcoming typhoon.' },
    ] }),
  A({ id: 'admin-start-cycle', file: 'admin/start-cycle.png', url: '/fisheries-monitoring?tab=stocking', js: click('Start Production Cycle'), after: 2500, height: 1500, title: 'Start Production Cycle form', purpose: 'Starts a new production cycle for a fisherfolk.',
    callouts: [
      { find: { text: 'Fisherfolk', tag: 'label', up: 1 }, label: 'Fisherfolk', desc: 'Required. Search by name or registration number and choose the fisherfolk (Aquaculture type).' },
      { find: { text: 'Organization', tag: 'label', up: 1 }, label: 'Organization', desc: 'Optional. The organization the production counts for, if the fisherfolk belongs to one.' },
      { find: { text: 'Culture Phase', tag: 'label', up: 1 }, label: 'Culture Phase', desc: 'Required: Nursery, Stocking, Grow-out and the other phases.' },
      { find: [{ text: 'Species Farmed', tag: 'label', up: 1 }, { text: 'Culture System', tag: 'label', up: 1 }], label: 'Species and Culture System', desc: 'Required. The species (the list is in Fisheries Settings) and Fishpond or Fishcage.' },
      { find: [{ text: 'Water Source', tag: 'label', up: 1 }, { text: 'Fingerling Source', tag: 'label', up: 1 }], label: 'Water and fingerling source', desc: 'Required. River, spring, rain-fed, deep well or other; and where the fingerlings came from (BFAR, own production, private hatchery... from Fisheries Settings).' },
      { find: [{ text: 'Pond Location', tag: 'label', up: 1 }, { text: 'Ownership', tag: 'label', up: 1 }], label: 'Pond location and ownership', desc: 'Required. The barangay of the pond or cage, and whether it is Tenant, Lease or Owner.' },
      { find: [{ text: 'Stocking Date', tag: 'label', up: 1 }, { text: 'Season', tag: 'label', up: 1 }, { text: 'Target Harvest Date', tag: 'label', up: 1 }], label: 'Stocking date, season, target harvest', desc: 'Required. The day the fingerlings were stocked; the season is detected from it; and the date the harvest is planned. The harvest button opens once half of this time has passed.' },
      { find: { text: 'Number of Ponds', tag: 'label', up: 1 }, label: 'Number of Ponds', desc: 'Required. How many ponds or cages are in this cycle. A line for each opens below, to give its size, fingerlings and whether it has PCIC insurance.' },
      { find: { text: 'Start Cycle', tag: 'button' }, label: 'Start Cycle', desc: 'Saves the production cycle with its ponds.' },
    ] }),
  A({ id: 'admin-cycle-details', file: 'admin/cycle-details.png', url: '/fisheries-monitoring?tab=stocking', js: lastRowMenu('Cycle & Logs'), after: 3500, height: 1000, title: 'Cycle details and logs', purpose: 'One cycle, with its feeding and health logs.',
    callouts: [
      { find: { text: 'Cycle Info', tag: 'button' }, label: 'Cycle Info', desc: 'The cycle\'s details and its ponds: pond, size, fingerlings and the PCIC Insured round check.' },
      { find: { text: 'Feeding Log', tag: 'button' }, label: 'Feeding Log', desc: 'The feed given: the date, the feed type (from Fisheries Settings) and the amount. Add a log from here.' },
      { find: { text: 'Health Log', tag: 'button' }, label: 'Health Log', desc: 'Disease and treatment records of the cycle: the date, the disease (from Fisheries Settings) and what was done.' },
      { find: { text: 'Edit', tag: 'button', exact: true }, label: 'Edit', desc: 'Changes the cycle\'s details.' },
      { find: { css: 'thead', last: true }, label: 'Ponds table', desc: 'Each pond or cage of the cycle with its size, the fingerlings stocked and the PCIC Insured round check.' },
    ] }),

  // ───────────────────────────── Capture Monitoring ─────────────────────────────
  A({ id: 'admin-capture', file: 'admin/capture.png', url: '/fisheries-monitoring?tab=capture', title: 'Fisheries Management > Capture Monitoring', purpose: 'Fishing trips and what was caught, for capture fisherfolk.',
    callouts: [
      { ...FILTERS_ROW, desc: 'Opens the filter row: barangay, fisherfolk type, fishing ground, gear and the Trip From / To dates.' },
      PRINT_ROW, DOWNLOAD_ROW,
      { find: { text: 'Total Catch', tag: 'p, span, div', up: 2 }, label: 'Totals', desc: 'Total catch in kg and the number of trips, the estimated market value, and how many different fisherfolk went fishing, for the trips listed (the filters apply).' },
      { find: { text: 'Historical Timeline', tag: 'button' }, label: 'Historical Timeline', desc: 'A table of the catch season by season and year by year (next picture).' },
      { find: { text: 'Log Catch', tag: 'button' }, label: 'Log Catch', desc: 'Records one fishing trip and its catch (picture after next).' },
      { find: COLS, label: 'Columns', desc: 'Fisherfolk, type, trip date, fishing ground, gear, catch in kg, the top species, hours at sea and Actions.' },
      { find: DOTS, label: 'Actions menu', desc: 'View Details shows the trip; Edit changes it.' },
    ] }),
  A({ id: 'admin-capture-log', file: 'admin/capture-log.png', url: '/fisheries-monitoring?tab=capture', js: click('Log Catch'), after: 2500, height: 1100, title: 'Log Fishing Trip / Catch form', purpose: 'Records one fishing trip.',
    callouts: [
      { find: { text: 'Fisherfolk', tag: 'label', up: 1 }, label: 'Fisherfolk', desc: 'Required. Search by name or RSBSA number: only Capture or Inland Fishery fisherfolk are listed.' },
      { find: [{ text: 'Trip Date', tag: 'label', up: 1 }, { text: 'Return Date', tag: 'label', up: 1 }], label: 'Trip Date and Return Date', desc: 'The trip date is required; the return date is optional. The hours at sea come from them.' },
      { find: [{ text: 'Fishing Ground', tag: 'label', up: 1 }, { text: 'Gear Used', tag: 'label', up: 1 }], label: 'Fishing Ground and Gear Used', desc: 'Required. Choose from the lists (the gear list is in Fisheries Settings > Fishing Gear).' },
      { find: [{ text: 'Species Name', tag: 'label', up: 1 }, { text: 'Volume', tag: 'label', up: 1 }, { text: 'Est. Value', tag: 'label', up: 1 }], label: 'Catch lines', desc: 'One line per species: the species, the volume in kg and optionally the estimated value in pesos.' },
      { find: { text: '+ Add Species', tag: 'button' }, label: 'Add Species', desc: 'Adds another species line. The remove button of a line deletes it.' },
      { find: { text: 'Remarks', tag: 'label', up: 1 }, label: 'Remarks', desc: 'Optional notes about the trip.' },
      { find: { text: 'Save Log', tag: 'button' }, label: 'Save Log', desc: 'Saves the trip and its catch.' },
    ] }),
  A({ id: 'admin-capture-timeline', file: 'admin/capture-timeline.png', url: '/fisheries-monitoring?tab=capture', js: click('Historical Timeline'), after: 2500, title: 'Fisheries Historical Timeline', purpose: 'The catch season by season.',
    callouts: [
      { find: { text: 'Barangay', tag: 'label', up: 1 }, label: 'Barangay', desc: 'Only one barangay, or All Barangays.' },
      { find: { text: 'Fisherfolk Type', tag: 'label', up: 1 }, label: 'Fisherfolk Type', desc: 'All Types, Capture or Aquaculture.' },
      { find: { css: 'table', last: true }, label: 'Timeline table', desc: 'For each season and year: the total catch in kg, the number of trips and how many fisherfolk were active.' },
    ] }),

  // ───────────────────────────── Forecasting ─────────────────────────────
  A({ id: 'admin-crop-forecast', file: 'admin/crop-forecast.png', url: '/forecasting', title: 'Forecasting > Crop Forecasting', purpose: 'The harvest expected from the crops that are planted.',
    callouts: [
      { find: [{ text: 'Forecast', tag: 'button', exact: true }, { text: 'Yield analysis', tag: 'button' }], label: 'Forecast / Yield analysis', desc: 'Forecast looks ahead at the crops that are planted. Yield analysis looks back, comparing the estimate with the actual harvest (next pictures).' },
      SEARCH_ROW('a crop by farmer, RSBSA number, crop or organization'),
      { ...FILTERS_ROW, desc: 'Opens the filter row: crop, barangay, status, season and year.' },
      { find: [{ text: 'All crops', tag: 'button' }, { text: 'By farmer', tag: 'button' }], label: 'All crops / By farmer', desc: 'All crops lists each crop. By farmer groups them under each farmer: a row shows the farmer\'s RSBSA No., Barangay and Contact No., how many records there are, how many are harvested and the average variance.' },
      { find: COLS, label: 'Columns', desc: 'Crop, farmer, area planted, the estimated yield in kg (area times the crop\'s yield per hectare), the expected harvest date, the status and Details.' },
      { find: { text: 'View', tag: 'button', exact: true, nth: 0 }, label: 'View', desc: 'Opens the forecast details of the crop, with a box for your remarks and notes.' },
      { ...PAGER_ROW, find: PAGER },
    ] }),
  A({ id: 'admin-forecast-details', file: 'admin/forecast-details.png', url: '/forecasting', js: "const b=[...document.querySelectorAll('table button')].find(x=>x.textContent.trim()==='View'); b&&b.click()", after: 2500, height: 1000, title: 'Forecast Details window', purpose: 'The forecast of one crop.',
    callouts: [
      { find: { text: 'Forecast Details', tag: 'h2' }, label: 'Forecast details', desc: 'The crop, farmer, parcel, area, date planted, expected harvest date and the estimated yield, with how the estimate was worked out.' },
      { find: { text: 'Remarks', tag: 'label', up: 1 }, label: 'Remarks & notes', desc: 'Write observations about the forecast, for example why a harvest may be lower.' },
      { find: { text: 'Save remarks', tag: 'button' }, label: 'Save remarks', desc: 'Saves the note on the forecast.' },
    ] }),
  A({ id: 'admin-yield-analysis', file: 'admin/yield-analysis.png', url: '/forecasting', js: click('Yield analysis'), after: 3500, title: 'Crop Forecasting > Yield analysis', purpose: 'How the actual harvest compared with the estimate.',
    callouts: [
      { find: { text: 'Yield analysis', tag: 'button' }, label: 'Yield analysis', desc: 'Compares the estimate made at planting with the actual harvest.' },
      SEARCH_ROW('by crop, farmer or barangay'),
      FILTERS_ROW,
      { find: { text: 'Preview PDF', tag: 'button' }, label: 'Preview PDF', desc: 'Shows the analysis as a PDF to read, print or save.' },
      { find: { text: 'Download Excel', tag: 'button' }, label: 'Download Excel', desc: 'Saves the analysis as an Excel file.' },
      { find: [{ text: 'Analysis', tag: 'button', exact: true }, { text: 'By farmer', tag: 'button' }, { text: 'By barangay', tag: 'button' }, { text: 'By crop type', tag: 'button' }], label: 'Views', desc: 'Analysis lists each harvested crop. By farmer, By barangay and By crop type add up the same figures under each heading.' },
      { find: COLS, label: 'Columns', desc: 'Crop, farmer, barangay, estimated and actual yield (kg), the variance (how far the actual is above or below the estimate), the activities recorded and the possible factors (such as disasters) that may explain the difference.' },
    ] }),
  A({ id: 'admin-fisheries-forecast', file: 'admin/fisheries-forecast.png', url: '/fisheries-forecasting', title: 'Forecasting > Fisheries Forecasting', purpose: 'The harvest expected from the production cycles.',
    callouts: [
      { find: [{ text: 'Forecast', tag: 'button', exact: true }, { text: 'Yield analysis', tag: 'button' }], label: 'Forecast / Yield analysis', desc: 'Forecast looks ahead at the cycles; Yield analysis compares the estimate with the actual harvest, by fisherfolk, barangay or species.' },
      SEARCH_ROW('a cycle by fisherfolk, species or barangay'),
      FILTERS_ROW,
      { find: [{ text: 'All stockings', tag: 'button' }, { text: 'By fisherfolk', tag: 'button' }], label: 'All stockings / By fisherfolk', desc: 'All stockings lists each cycle; By fisherfolk groups them under each fisherfolk: a row shows their RSBSA No., Barangay and Contact No., how many records there are, how many are harvested and the average variance.' },
      { find: COLS, label: 'Columns', desc: 'Species, fisherfolk, culture type, date stocked, fingerlings, the estimated harvest yield (kg), the actual harvest, the estimated and actual harvest dates and the status.' },
      { ...PAGER_ROW, find: PAGER },
    ] }),

  // ───────────────────────────── Assistance ─────────────────────────────
  A({ id: 'admin-crop-assistance', file: 'admin/crop-assistance.png', url: '/crop-assistance', title: 'Assistance > Crop Assistance', purpose: 'Help given to farmers and farmers organizations. Fisheries Assistance works the same way.',
    callouts: [
      ...ASSIST_TABS,
      { find: { text: 'Distribute to Organizations', tag: 'button' }, label: 'Distribute to Organizations', desc: 'Gives one assistance to the members of the organizations you tick (next pictures).' },
      { find: { text: 'Distribute Farmer Assistance', tag: 'button' }, label: 'Distribute Farmer Assistance', desc: 'Gives one assistance to the individual farmers you tick.' },
      { find: FILTERS, label: 'Filters', desc: 'Opens the filter row: barangay and year.' },
      { find: COLS, label: 'Columns', desc: 'Date given, who it was given to (the organization, or the names of the farmers when it went to selected people), assistance type, source agency, quantity and status.' },
      { find: ROW1, label: 'A distribution row', desc: 'Click a row to drop down the members who benefited, with their barangay and status.' },
      { ...PAGER_ROW, find: PAGER },
    ] }),
  A({ id: 'admin-assistance-history', file: 'admin/assistance-history.png', url: '/crop-assistance', js: click('History'), after: 2500, title: 'Assistance History', purpose: 'The assistance that was received and confirmed, or resolved, with a report you can print or download.',
    callouts: [
      ...ASSIST_TABS,
      { find: PRINT, label: 'Print Report', desc: 'Opens the History list as a report with the signature lines, ready to print. It follows the filters.' },
      { find: DOWNLOAD, label: 'Download Report', desc: 'Saves the same report as a PDF file.' },
      { find: COLS, label: 'Columns', desc: 'Date given, who it was given to, assistance type, source agency, quantity and status.' },
      { find: { css: 'tbody tr:first-child td:last-child button', nth: 0 }, label: 'Row menu', desc: 'The three dots of a distribution: Print Report and Download Report give a report of that one distribution, with the people who received it.' },
      { ...PAGER_ROW, find: PAGER },
    ] }),
  A({ id: 'admin-assistance-members', file: 'admin/assistance-members.png', url: '/crop-assistance', js: "const r=document.querySelector('tbody tr'); r&&r.click()", after: 2000, title: 'The members of a distribution', purpose: 'Who received it, and what you can do for each.',
    callouts: [
      { find: { text: 'NAME', tag: 'th' }, label: 'Member columns', desc: 'Each member who benefited, with the barangay and the status of that person\'s own record.' },
      { find: { css: 'tbody td:last-child button', last: true }, label: 'Actions menu', desc: 'View shows the record. Edit changes it while it is still pending or awaiting confirmation. Mark Resolved closes a case that was reported as not received. Confirm for Member / Confirm Received records that the help was received.' },
    ] }),
  A({ id: 'admin-assistance-filters', file: 'admin/assistance-filters.png', url: '/crop-assistance', js: click('Filters'), after: 1200, title: 'Assistance filters', purpose: 'Narrow the distributions.',
    callouts: [
      { find: { css: 'select', nth: 0 }, label: 'Barangay', desc: 'Only the distributions to people of one barangay.' },
      { find: { css: 'select', nth: 1 }, label: 'Year', desc: 'The year the assistance was given.' },
    ] }),
  A({ id: 'admin-assistance-import', file: 'admin/assistance-import.png', url: '/crop-assistance', js: click('Import File'), after: 2000, title: 'Import Crop Assistance window', purpose: 'Brings in assistance records from a spreadsheet.',
    callouts: [
      { find: { text: 'Download the Excel template', tag: 'button' }, label: 'Download the Excel template', desc: 'The file with the columns to fill in.' },
      { find: { text: 'Click to choose', tag: 'label, span, div', up: 1 }, label: 'Choose a file', desc: 'Choose the filled-in .xlsx, .xls or .csv file.' },
      { find: { text: 'Undo a recent import', tag: 'button' }, label: 'Undo a recent import', desc: 'Lists your recent imports and reverses the one you pick, if you imported the wrong file.' },
      { find: { text: 'Preview Import', tag: 'button' }, label: 'Preview Import', desc: 'Reads the file and shows what would be saved, with any row that has a problem, before anything is saved.' },
    ] }),
  A({ id: 'admin-distribute', file: 'admin/distribute.png', url: '/crop-assistance', js: click('Distribute to Organizations'), after: 2500, height: 1300, title: 'Distribute to Organizations window', purpose: 'Gives one assistance to the members of several organizations.',
    callouts: [
      { find: { text: 'Assistance Type', tag: 'label', up: 1 }, label: 'Assistance Type', desc: 'Required. Fertilizer, Seeds, Equipment, Cash Assistance, Training or Other (the list is in Assistance Settings). The fields below change with the type: cash asks for an amount, training for the days.' },
      { find: { text: 'Source Agency', tag: 'label', up: 1 }, label: 'Source Agency', desc: 'Required. The agencies that provided it (you can choose several). Choose Others to type an agency that is not in the list.' },
      { find: { text: 'Quantity per Recipient', tag: 'label', up: 1 }, label: 'Quantity per Recipient', desc: 'Required. The quantity each recipient gets, and its unit. The units offered depend on the assistance type (Seeds offers kg, sack, bag and bundle, for example); an Admin sets them in Assistance Settings.' },
      { find: { text: 'Distribution Date', tag: 'label', up: 1 }, label: 'Distribution Date', desc: 'Required. Today or a later date. A later date schedules the distribution: it stays Pending until then.' },
      { find: { text: 'Description', tag: 'label', up: 1 }, label: 'Description', desc: 'Optional notes about the assistance.' },
      { find: { css: 'input[type=search]', last: true }, label: 'Search organizations', desc: 'Find an organization by name.' },
      { find: { css: 'table input[type=checkbox]', nth: 0 }, label: 'Tick boxes', desc: 'Tick each organization to give it the assistance, or the top box to tick every organization on the page. Your ticks are kept across pages. The table shows the barangay and the number of members.' },
      { find: { text: 'Review Distribution', tag: 'button' }, label: 'Review Distribution', desc: 'Checks with the server what would happen and saves nothing: it shows who would be blocked (a person who got the same type from another organization in the last 30 days), lets you untick people, then Confirm and Distribute saves it. The result has Print Report.' },
    ] }),
  A({ id: 'admin-distribute-farmers', file: 'admin/distribute-farmers.png', url: '/crop-assistance', js: click('Distribute Farmer Assistance'), after: 2500, height: 1300, title: 'Distribute Farmer Assistance window', purpose: 'Gives one assistance to the individual farmers you choose.',
    callouts: [
      { find: { text: 'Assistance Type', tag: 'label', up: 1 }, label: 'Same details', desc: 'Assistance type, source agency, quantity and unit, distribution date and description: exactly as in Distribute to Organizations.' },
      { find: { css: 'input[type=search]', last: true }, label: 'Search farmers', desc: 'Find a farmer by name or RSBSA number.' },
      { find: { css: 'table input[type=checkbox]', nth: 0 }, label: 'Tick boxes', desc: 'Tick each farmer to receive it, or the top box for every farmer on the page. The table shows name, RSBSA number and barangay.' },
      { find: { text: 'Review Distribution', tag: 'button' }, label: 'Review Distribution', desc: 'Shows the check of who is allowed before anything is saved.' },
    ] }),
  A({ id: 'admin-fisheries-assistance', file: 'admin/fisheries-assistance.png', url: '/fisheries-assistance', title: 'Assistance > Fisheries Assistance', purpose: 'The same page for fisherfolk and fisherfolk organizations.',
    callouts: [
      ...ASSIST_TABS,
      { find: { text: 'Distribute to Organizations', tag: 'button' }, label: 'Distribute to Organizations', desc: 'Gives one assistance to the members of the fisherfolk organizations you tick.' },
      { find: { text: 'Distribute Fisherfolk Assistance', tag: 'button' }, label: 'Distribute Fisherfolk Assistance', desc: 'Gives one assistance to the individual fisherfolk you tick.' },
      SEARCH_ROW('a fisherfolk by name or RSBSA number'),
      FILTERS_ROW,
    ] }),
]
