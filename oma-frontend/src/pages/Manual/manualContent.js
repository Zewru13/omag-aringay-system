// The User Manual, in the style of an annotated screen guide: for each kind of account a set of guides, each with numbered instructions and annotated pictures.
// Every picture has numbered orange boxes burned in, and a table under it ("[1] Search box: ...") says what each number is, so every button and field of a
// screen is explained. The pictures and their tables are made by scripts/manual (shoot.mjs reads parts/*.mjs) and written to manualScreens.js; this file only
// says which screens a guide shows and the words around them. Plain data, so it can be tested without a screen (tests/manualContent.test.mjs checks every
// screen exists and has its picture).
//   audience: 'admin' | 'focal' | 'farmer' | 'fisherfolk' | 'org'
// A Focal Person sees the Admin screens except the Menu, Dashboard and the farmers list, which have a picture of their own (the sidebar differs).
import SCREENS from './manualScreens.js'

export const AUDIENCES = [
  { id: 'admin', label: 'Admin' },
  { id: 'focal', label: 'Focal Person' },
  { id: 'farmer', label: 'Farmer' },
  { id: 'fisherfolk', label: 'Fisherfolk' },
  { id: 'org', label: 'Organization' },
]

// Which manual an account gets: `role` is ADMIN | EVALUATOR | CITIZEN; the citizen kinds come from who the account is linked to.
export function audienceFor({ role, isFarmer, isFisherfolk, isOrg }) {
  if (role === 'ADMIN') return 'admin'
  if (role === 'EVALUATOR') return 'focal'
  if (isOrg) return 'org'
  if (isFisherfolk) return 'fisherfolk'
  if (isFarmer) return 'farmer'
  return 'admin'
}

const DRAFT_NOTE = 'A form keeps an unsaved draft: if you leave it and come back, your entries are restored with a yellow notice, and Discard draft clears them.'

// ── Staff guides (Admin and Focal Person share them; `adminOnly` ones are left out for a Focal Person)
const STAFF_GUIDES = (focal) => [
  {
    id: 'start',
    title: 'Getting started: sign in, the menu and the Dashboard',
    intro: 'Sign in with the account the office gave you. The menu on the left and the bar along the top are on every page. The Dashboard shows the totals of the municipality and what needs attention today.',
    screens: ['login', focal ? 'focal-layout' : 'admin-layout', focal ? 'focal-dashboard' : 'admin-dashboard', 'admin-profile'],
    steps: [
      'Open the system in your browser and sign in with your username (or email) and password. The first time, you are asked to choose a new password. There is no self-registration: the Admin creates every account.',
      'The menu on the left lists everything you can open. The groups open and close when you press them. Press the three-line button at the top to hide or show the menu.',
      'The bell shows notices for you, such as a disaster that a farmer or fisherfolk reported or a change request waiting for review. Your name opens the account menu: your profile, Help (the quick guide and the common questions), the User Manual (this page), the Activity Log (Admin) and Logout.',
      'The Dashboard opens after sign-in. Its panels show the registered farmers and fisherfolk, the disasters over time (choose the From and To month), the season\'s yield against the target, how farmers and fisherfolk harvested against the estimate (choose the year), the overdue, due today and upcoming activities, the barangay activity status and the change requests waiting for review.',
      'In Pending Change Requests, Approve applies the change a farmer, fisherfolk or organization asked for (for example a new name or barangay) and Reject refuses it.',
      'My Profile (from the account menu) shows your own account: Edit profile changes your details and the camera button changes your photo.',
    ],
  },
  {
    id: 'register-farmer',
    title: 'Register a farmer',
    intro: 'Registration > Farmers is the list of everyone registered. Each farmer is registered once, with their RSBSA number, and has a profile with their machinery, farm parcels, crops and visits.',
    screens: [focal ? 'focal-farmers' : 'admin-farmers', 'admin-farmers-filters', 'admin-register-farmer', 'admin-farmer-profile', 'admin-farmer-parcels', 'admin-farmer-crop-details', 'admin-farmer-crops'],
    steps: [
      'Open Registration > Farmers. Type in the search box (name, RSBSA number or barangay) and press Filters to narrow the list by gender, barangay, farmer type, senior citizens, ICC/IP members, PWD and the dates registered.',
      'For a printout or a PDF of the list, choose the Registered report in Reports. Import Farmers registers many farmers from a spreadsheet, with a preview first.',
      'Press Register Farmer and fill in the personal information, the contact information and the government information (the RSBSA number is required and must be new). Tick PWD, 4Ps and ICC/IP if they apply; Senior Citizen is automatic from the birthdate.',
      'Optionally choose the farmer\'s organization: click the box and type part of its name, the list narrows as you type, then pick it (or Not a member). Add machinery for each line, or Import machinery from a spreadsheet; the machinery names come from Crop Settings > Equipment Types.',
      'Press Save Farmer to save, or Save Farmer & Add Farm Parcels to save and go straight to the table that records the farmer\'s parcels and crops.',
      'Click a farmer in the list to open the profile. At the top are the farmer\'s name, RSBSA number, place and classification chips, with four icons (rest the pointer on one to read its name): View Assistance History (its Print Report and Download Report give that farmer\'s history as a PDF), Generate Report (a PDF profile), Edit Farmer and Set Up Account or Regenerate Password. Below are the personal information, the contact and address, and the organizations the farmer belongs to.',
      'Machinery, Farm Parcels, Crop Monitoring Records and Visit History are four cards with a count and a View button. View opens the table in a window. In Farm Parcels, Import Farm Parcels reads the parcels from a spreadsheet and Add Farm Parcel (at the bottom) records new ones; the three-dot button of a parcel has Edit and Details, and Details shows its Crops Grown and its Crop Monitoring Records, each with its own three-dot button. View details of a crop grown shows everything about it, planting by planting, up to its harvest, without the activities. In Crop Monitoring Records choose a stage, open the Legend to see what each colour means, and use View details or Open in Crop Monitoring on a crop. In Visit History, Record Farm Visit writes a new visit.',
      DRAFT_NOTE,
    ],
  },
  {
    id: 'register-fisherfolk',
    title: 'Register a fisherfolk',
    intro: 'Registration > Fisherfolk works like Farmers, with the FishR number and the activities, and a profile with stocking records and ponds. Every fisherfolk is registered as Aquaculture.',
    screens: ['admin-fisherfolk', 'admin-register-fisherfolk', 'admin-fisherfolk-profile', 'admin-fisherfolk-ponds'],
    steps: [
      'Open Registration > Fisherfolk. Search, filter, print or download the list, or import fisherfolk from a spreadsheet, as for farmers.',
      'Press Register Fisherfolk. Fill in the personal, contact and government information (RSBSA number required; FishR number and PhilSys optional).',
      'There is no type to choose: every fisherfolk is registered as Aquaculture (ponds and cages, with production cycles). Tick the activities they do (Aquaculture, Capture Fishery, Mariculture, Inland Fishery) and optionally choose their organization (click the box and type part of its name to find it).',
      'Click a fisherfolk in the list to open the profile. At the top are the name, RSBSA number, type and place, with chips for the classifications, the vessel and a disaster, and four icons: the assistance history (with Print Report and Download Report), the PDF report, Edit Profile and Set Up Account or Regenerate Password. Below are the personal information, the contact and address, the registration numbers (RSBSA, Fish-R, Boat-R, PhilSys), the organizations and the aquaculture or capture record.',
      'Stocking Records and Ponds are two cards with a count and a View button. View opens the table in a window. In Ponds, Add Pond adds one pond or cage (name, barangay, area, water source, PCIC insurance with up to 5 photos of the form) and Bulk Add Ponds adds several. Stocking Records lists the production cycles.',
    ],
  },
  {
    id: 'organization',
    title: 'Register an organization, its members, equipment and officers',
    intro: 'Organizations > Farmers Organizations (or Fisherfolk Organizations) holds each organization with its members, officers and equipment.',
    screens: ['admin-organizations', 'admin-org-menu', 'admin-add-organization', 'admin-add-members', 'admin-edit-organization', 'admin-org-detail', 'admin-org-members', 'admin-org-equipment', 'admin-org-confirmed', 'admin-org-officers', 'admin-assign-officer', 'admin-fisherfolk-orgs'],
    steps: [
      'Open Organizations. Search, filter, print or download the list, or Import Organizations from a spreadsheet.',
      'The three-dot menu of a row has Edit organization, View organization profile and Add assistance (it opens the Assistance page with that organization already chosen).',
      'Press Add Organization. Fill in the name, barangay, the dates organized and registered, the registration number and agency, the email, the contact person (one full-name box) and the contact number.',
      'In the Equipment section, Add equipment adds a line (the equipment, how many units, the date acquired and remarks), or attach a file with Import equipment (Download template gives its columns). New equipment starts as Good.',
      'In the Members section press Add Members: a table lists the registered farmers who are not members yet. Search, tick the people, choose each one\'s position (Member or an officer position; a position that is already taken is grayed out) and press Add selected. Import members attaches a spreadsheet instead. Everything is saved when you press Add Organization.',
      'Edit organization opens the same form, with a Members section to add more members later.',
      'View organization profile opens the organization page. At the top are the name, registration number, address, date registered and agency, with an icon that makes a new random password for the organization\'s login account (shown once). Below are the Organization Details and the Contact.',
      'Members, Equipment Inventory, Confirmed for Members and Officers are four cards; View opens each in a window. Members lists the members (Add Member, Import Members, Set as main). Equipment Inventory lists the equipment (Add Equipment, Import Equipment, Remove). Confirmed for Members is a table with a row for each assistance the organization confirmed: click a row to see who was confirmed, and use its menu to print or download the report of the whole assistance or of one member.',
      'In Officers, Assign Officer gives a position to a member: positions that are held are grayed out, and a member who already holds a position cannot be given another, so end that term first (End Term Early). Officer History lists the earlier officers.',
    ],
  },
  {
    id: 'parcels',
    title: 'Add farm parcels and crops',
    intro: 'Crop Management > Crop Records lists every parcel. Open a parcel to see the crops planted on it. Parcels and crops are added in tables.',
    screens: ['admin-crop-records', 'admin-crop-records-grouped', 'admin-parcel-menu', 'admin-add-parcels', 'admin-add-crops', 'admin-add-crops-right', 'admin-edit-parcel'],
    steps: [
      'Open Crop Management > Crop Records. Search by farmer, RSBSA number or parcel number; Filters has barangay, PCIC insurance (PCIC Insured or PCIC Uninsured), Planted From / To and Group by (Farmer or Land ownership). A filter works as soon as you pick it, and Reset Filters at the bottom of the row clears them all. Each group row has columns like the table: a farmer group shows the RSBSA No., Barangay, Contact No., parcels, area and crops; an ownership group shows how many farmers it holds, with the parcels, area and crops. A parcel is printed from its three-dot menu.',
      'The arrow at the start of a parcel row shows or hides its crops. Import Farm Parcels adds the parcels of all farmers from one spreadsheet.',
      'Add Farm Parcel opens a table: choose the farmer, then fill one row per parcel (parcel number, barangay, area, land ownership, tax declaration, farm type, cropping schedule). Add Parcel adds another row; under a parcel, Add crop records what is planted on it and Import crops reads its crops from a spreadsheet.',
      'Land Ownership is something you choose (Owner, Tenant or Lessee); a Tenant or Lessee parcel also needs the land owner\'s name. The crops on a parcel together can never be larger than its area (a double or triple cropping parcel may hold two or three times its area).',
      'The three-dot menu of a parcel has Add crops, Force harvest, Print report and Edit parcel. Add crops opens the crop table for that parcel: the crop type, date planted, area, season (filled in from the date planted: Wet from June to November, Dry from December to May), variety, seed source, quantity of seeds (or trees), PCIC insurance (with up to 5 photos of the form) and the parcel.',
      'Submit Parcel or Submit Record saves everything in the table together, or nothing if one row has a problem. ' + DRAFT_NOTE,
    ],
  },
  {
    id: 'harvest',
    title: 'Monitor crops, record activities, harvest or report a disaster',
    intro: 'Crop Management > Crop Monitoring follows each crop from planting to harvest.',
    screens: ['admin-crop-monitoring', 'admin-crop-filters', 'admin-crop-monitoring-grouped', 'admin-crop-menu', 'admin-crop-details', 'admin-record-activity', 'admin-record-harvest', 'admin-report-crop-disaster', 'admin-force-harvest'],
    steps: [
      'Open Crop Monitoring. It opens on the crops that are Planted. Search, then open Filters: group by, crop, status (Every Status shows all of them), PCIC insurance, season, year and the date planted. A filter works as soon as you pick it; Reset Filters brings back the Planted crops and clears the rest. Grouped by crop, a row shows how many farmers grow it, the records, the area planted and how many are near harvest; grouped by farmer, a row shows the RSBSA No., Barangay and Contact No. as well.',
      'The statuses are: Planted; Near Harvest (within 7 days of the expected date: Due Harvest while still ahead, Ready for Harvest from the harvest date, Overdue after 7 days); Harvested; and Total Loss.',
      'The PCIC Insured round check of a crop is green when it has insurance and an empty circle when it has none; View form beside it opens the uploaded PCIC form in a window inside the system. The wheat button beside the three-dot menu is Record Harvest. The three-dot menu has Log Activity, Crop Details, Force Harvest and Report Disaster.',
      'Log Activity opens a table form to log one activity: the schedule of the crop fills it in: the activity that is due now (or the earliest overdue one), its recommendations and, for Fertilizer Application, the Type of Fertilizer from the list in Crop Settings (Input Types). Change anything you like. Add the date and the plant condition, then press Save. Activity History below the form lists the activities already logged.',
      'Record Harvest (the wheat button beside the three-dot menu) opens once half of the crop\'s growing time has passed; before that, and for a crop that is already harvested or a total loss, it is grayed out (hold the pointer on it to see why). The window names the crop. Enter the harvested date, the area harvested, the unit of measure (every crop starts on kg) and the quantity. A harvest more than 7 days after the expected date asks for a reason.',
      'Report Disaster reports damage on one crop: the type, the date, the area affected, the damage and the loss, and photos. Tick Total loss if the crop is completely destroyed: it moves to Total Loss.',
      'Force Harvest harvests crops that are not ready, because of something coming (a typhoon, drought and so on): choose the date and the reason, tick the crops, type each one\'s area and its quantity with its unit (the kg shows under the box), then Review Force Harvest, check the totals and confirm.',
    ],
  },
  {
    id: 'fisheries-monitoring',
    title: 'Fisheries: Aquaculture Records, Aquaculture Monitoring and Capture Monitoring',
    intro: 'Fisheries Management has Aquaculture Records (every production cycle, and where a new one is started), Aquaculture Monitoring (watching the production cycles of ponds and cages) and Capture Monitoring (fishing trips and catch).',
    screens: ['admin-aquaculture', 'admin-aquaculture-filters', 'admin-aquaculture-menu', 'admin-start-cycle', 'admin-cycle-details', 'admin-capture', 'admin-capture-log', 'admin-capture-timeline'],
    steps: [
      'Open Aquaculture Records to see the production cycles in one table: Ownership, Cycle, Species, Fisherfolk, Barangay, Pond/Cage Location, Culture Type, Organization, Date Stocked and PCIC Insured (a round check when the cycle is insured). Search for a fisherfolk, RSBSA number, species or barangay, or open Filters (Ownership, Cycle, Species, Barangay, Culture Type, Organization, Date Stocked From / To and PCIC insurance: PCIC Insured or PCIC Uninsured). A filter works as soon as you pick it, and Reset Filters clears them all. Start Production Cycle is the button beside the search: new cycles are started here, not in Aquaculture Monitoring, and they appear in both pages.',
      'Open Aquaculture Monitoring. Search, or open Filters (pond or cage name, status, species, PCIC insurance: PCIC Insured or PCIC Uninsured, season, year, Stocked From / To). A filter works as soon as you pick it, and Reset Filters clears them all. The PCIC insurance of a cycle is recorded once for the whole cycle: Aquaculture Records shows it as a round check, and Cycle Details lists each pond or cage with it; View form there opens the uploaded PCIC form in a window inside the system (page by page, with zoom) and Close brings you back. Click a row to open its ponds or cages: the unit, fingerlings, dimensions, area and the estimated and actual harvest of each. A new cycle is started in Aquaculture Records. A small red alert icon beside a cycle\'s status means a disaster is still active on it; a green check means it recovered.',
      'In Aquaculture Records, Start Production Cycle opens the form in five tables: Fisherfolk Information, Culture Details, Stocking Information, Ownership and Pond/Cage Details. In Fisherfolk Information, choosing the fisherfolk fills in the Organization by itself from the organizations they were added to as a member; with none it stays blank, and with several you choose the right one. Beside the number of ponds is PCIC Insured, once for the whole cycle: tick it and upload the photo of the insurance form. Each pond or cage then gets its size and fingerlings.',
      'The harvest button of a row is grayed out until at least half of the expected time has passed. The three-dot menu has View Details, Edit, Activity Logs and Force Harvest. Activity Logs lists every Feeding Log and Health Log saved for the cycle (date, activity, pond or cage and details), with All, Feeding Log and Health Log buttons to filter it.',
      'In an opened row, the Log Activity button offers a Feeding Log and a Health Log. Each opens as a table: the Feeding Log has the date, feed type and notes and the feed in kg of each pond or cage (the total adds up); the Health Log has a row for each pond or cage to tick, with its observation, mortality count and treatment. Save adds the log to that cycle and its ponds or cages.',
      'Open Capture Monitoring for fishing trips. The cards show the total catch, the estimated value and the active fisherfolk. Log Catch records a trip: the fisherfolk, the dates, the fishing ground, the gear and a line for each species (volume and value). Historical Timeline shows the catch season by season.',
    ],
  },
  {
    id: 'forecasting',
    title: 'Forecasting and yield analysis',
    intro: 'Forecasting looks ahead at the harvest expected from the planted crops and the production cycles, and looks back at how the actual harvest compared.',
    screens: ['admin-crop-forecast', 'admin-forecast-details', 'admin-yield-analysis', 'admin-fisheries-forecast'],
    steps: [
      'Open Forecasting > Crop Forecasting. Forecast lists each crop with the area, the estimated yield (area times the crop\'s yield per hectare), the Act. Yield (kg) once it is harvested (with a badge such as +20% above or 30% less than the estimate), the expected harvest date and the Actual Harvest Date with an Early, On-Time or Late badge (a dash until the crop is harvested). Growing crops come first, then the harvested ones. The filter row has the crop (All crops), the barangay, Group by, Status (Planted, Near Harvest, Overdue or Harvested) and a Date Planted From and To. Group by farmer lists the crops under each farmer; a farmer row shows the RSBSA No., Barangay and Contact No. with the records, harvested and average variance.',
      'View opens the forecast details of a crop, where you can write remarks and notes and press Save remarks.',
      'Yield analysis compares the estimate with the actual harvest. It lists each harvested crop and adds the figures up at the top. The filter row has the crop, barangay, season, Group by farmer and a Date Planted From and To. The variance shows how far the actual is above or below the estimate, with the activities and the possible factors (such as disasters). Preview PDF and Download Excel give the analysis as a file.',
      'Fisheries Forecasting does the same for production cycles. Its filters are the species, the barangay, Group by fisherfolk (a row shows the RSBSA No., Barangay and Contact No.), Status (Stocked, Near Harvest, Late or Harvested) and a Date Stocked From and To.',
    ],
  },
  {
    id: 'assistance',
    title: 'Give assistance',
    intro: 'Assistance > Crop Assistance (or Fisheries Assistance) records help given to farmers, fisherfolk and organizations.',
    screens: ['admin-crop-assistance', 'admin-assistance-history', 'admin-assistance-members', 'admin-assistance-filters', 'admin-assistance-import', 'admin-distribute', 'admin-distribute-farmers', 'admin-fisheries-assistance'],
    steps: [
      'Open Assistance. Current lists the assistance that is scheduled, awaiting confirmation or needs follow-up (the recipients who reported that they did not receive it); History lists what was received and confirmed, or resolved. On History, Print Report and Download Report give the list as filtered; the three dots of a row print or download that one distribution. Filters has the barangay and the year.',
      'Click a row to open the members who benefited. Their Actions menu has View, Edit (while it is pending or awaiting confirmation), Mark Resolved (for a case reported as not received) and Confirm for Member.',
      'Distribute to Organizations gives one assistance to the members of the organizations you tick; Distribute Farmer Assistance (Fisherfolk Assistance on the fisheries page) gives it to the individuals you tick.',
      'Choose the assistance type (Fertilizer, Seeds, Equipment, Cash Assistance, Training or Other), the source agencies (required; choose Others to type one that is not in the list), the quantity with its unit (required; the units offered depend on the type, for example Seeds offers kg, sack, bag and bundle) and the date. Choosing Training also asks for the days and the type of training, picked from the list in Assistance Settings. A later date schedules it: it stays Pending until then. Add Another Assistance adds a block for a second type, a third and so on (five at most), each with its own details, while the date and description are shared; the review and the result then show a section for each.',
      'Tick the recipients (the ticks are kept across pages) and press Review Distribution. The review saves nothing: it shows who would be blocked (a person who got the same type from another organization in the last 30 days) and lets you untick people. Confirm and Distribute saves it, and the result has Print Report.',
      'Import File brings assistance records in from a spreadsheet, with a preview first; Undo a recent import reverses a wrong one.',
    ],
  },
  {
    id: 'disaster',
    title: 'Disasters',
    intro: 'Disaster > Crop Disaster and Fisheries Disaster keep the disaster logs.',
    screens: ['admin-disaster', 'admin-disaster-filters', 'admin-disaster-detail', 'admin-log-crop-disaster', 'admin-fisheries-disaster', 'admin-log-fisheries-disaster', 'admin-fisheries-disaster-form'],
    steps: [
      'Open Disaster > Crop Disaster. The table lists the farmers who have disaster logs. Filters has the barangay, type, status, year and the date it occurred (From and To). The disaster report is made in Reports > Disaster.',
      'Click a farmer to open their disasters, then one to see its log with Print Disaster Log and Download Disaster Log. The Actions menu of a farmer gives View Report, Print and Download.',
      'Press Log Disaster to report one disaster on many parcels and crops at once: fill the event once (type, date, damage, loss), tick the parcels and crops that were hit, and tick Total loss where a crop was destroyed. A table of Photo documentation per farmer then lists every farmer you ticked, one row each: add that farmer\'s own photos in their row (they are saved only on that farmer\'s crops, and un-ticking all of a farmer\'s crops removes their photos). Report Disaster saves one log for each farmer and crop.',
      'In Disaster > Fisheries Disaster, press Log Disaster to report one disaster on many ponds and cages at once, the way Crop Disaster does for parcels. Fill in the disaster once: the date, the type and a description. Then tick what was hit in the table, which has one row for each active cycle: click a cycle to open it and see all of its ponds and cages. Search by fisherfolk name, registration number, species, barangay, pond or cage, or open Filters to choose a barangay; Select every pond/cage shown ticks the whole list. Tick a cycle to tick all of its ponds and cages, or tick them one by one, and give each the fingerlings lost, or tick Total loss (the whole stocked count). Every fisherfolk who has something ticked gets a part of their own below the table: the equipment damaged, the volume lost and their own photos (up to 10, with previews you can remove, saved only on their own log). A fisherfolk whose pond, cage or equipment was damaged but who lost no stock is added by name under Damage not linked to a stock.',
      'Press Log Disaster to save: one disaster log is made for each fisherfolk, all together or not at all, and each fisherfolk is notified. With one fisherfolk their log opens so you can print or download it; with several you find the new logs in the table. A stock becomes a Total Loss only when every pond or cage of it that is still growing is marked Total loss. Someone added under Damage not linked to a stock needs a pond or cage on record: with none they cannot be logged, so remove them from the list.',
    ],
  },
  {
    id: 'reports',
    title: 'Reports',
    intro: 'Reports is one page for the official reports. Choose the report in the Report type box, set its filters, choose who signs it, then Print Report or Download Report.',
    screens: ['admin-reports', 'admin-report-registered', 'admin-report-individual', 'admin-report-crop', 'admin-report-fisheries-production', 'admin-report-fisheries-disaster', 'admin-report-org-assistance'],
    steps: [
      'Open Reports. In the Report type box choose a report: Registered Farmers, Fisherfolk & Organizations; Crop Records Harvested; Fisheries Production Harvested; Aquaculture Records; Fisheries Disaster Reports; Crop / Parcel Disaster Reports; Organization Assistance. The filters under it change with the report.',
      'Set what to report and the filters (barangay, dates, crop or species and so on). The Registered report has a Report on box (Farmers, Fisherfolk and the organizations) and a search bar. The Organization Assistance report has one too: Farmers Organizations, Fisherfolk Organizations, Individual Farmers and Individual Fisherfolk. The organization reports list each distribution and then every member who received it, by name; the individual ones list the assistance given directly to people, not through an organization. The Selected report box repeats the report, the period and the filters you set.',
      'To report on just one farmer, fisherfolk or organization, search for it or click its row in the print-ready preview. When the search leaves exactly one record, or when you click a row, the report becomes that one record\'s individual report and a bar above says so; Show all records goes back to the list (if the search found it, clear the search).',
      'The Signatories block above the buttons shows who signs each line. Press Enter Signatories to open a table with a row for Prepared by (your own name to start with), Checked by, Noted by and Approved by: pick a saved signer or type a name, and fill in the Position / Designation, which starts as Administrator or Focal Person for your own line and can be changed. A line you leave without a name is not printed. The signers print at the foot of the report. What you enter is for this printout only; the saved signers come from Admin > Signatories.',
      'The print-ready preview under the buttons shows the report as it will print, with the letterhead, the tables and the signature lines, and it changes as you change the filters or the signers.',
      'Print Report prints the report and Download Report saves it as a PDF. Both are the report you see in the preview, with the signature lines.',
      'The farmers, fisherfolk, organizations, crop and fisheries lists have no report button of their own: choose their report here and set its filters.',
    ],
  },
  {
    id: 'settings',
    title: 'Settings (Admin)',
    adminOnly: true,
    intro: 'The Admin menu holds the lists the forms use. Only an Admin can change them.',
    screens: ['admin-crop-settings', 'admin-crop-settings-add', 'admin-crop-settings-edit', 'admin-fisheries-settings', 'admin-activity-settings', 'admin-assistance-settings', 'admin-classification-settings', 'admin-harvest-unit-settings'],
    steps: [
      'Crop Settings has tabs for the crops (growth days, Planted As, yield per hectare), the categories, the seed sources, the varieties, the input types and the equipment types (the one list of machinery names behind a farmer\'s Machinery and a farmers organization\'s Equipment; it starts filled with the usual names).',
      'The button under the table is named after what it adds (Add Crop, Add Variety...). A new row opens at the top: fill it and press Save. The newest item is always first. The three dots of a row have Edit and Delete.',
      'Edit Crop sets the allowed units of measure, the growth stages and the suggested activities (the activity, the day, the priority and the recommendation) that Log Activity fills in.',
      'Fisheries Settings has the species, categories, feed types, diseases, fingerling sources, equipment types and fishing gear. Activity Settings has the crop and fisheries activity types. Assistance Settings has the source agencies and the Assistance Types table: the units each assistance offers, the types of training (open the Training row), and Add Assistance for a type of your own.',
      'Classification Settings has the parcel classifications. Harvest Unit Settings says how many kg one harvest unit weighs, so a harvest counted in sacks or cavans is saved in kg; one weight can be set for several crops at once (none chosen means every crop), and a unit added there also appears in the unit lists. Assistance Settings also lists, for each type of assistance, the units its Unit box offers.',
    ],
  },
  {
    id: 'users',
    title: 'User accounts, Activity Log, Signatories and Backup & Restore (Admin)',
    adminOnly: true,
    intro: 'User Management creates and controls the accounts. The Activity Log shows who changed what. Signatories keeps the names that sign the reports. Backup & Restore makes a copy of the whole system and can put one back.',
    screens: ['admin-users', 'admin-audit-log', 'admin-audit-log-filters', 'admin-signatories', 'admin-backup', 'admin-restore'],
    steps: [
      'Open Admin > User Management. The buttons at the top choose the kind of account: Staff, Fisherfolk, Farmers or Organizations. Search, or open Filters.',
      'Create User opens Add New User: choose the role, fill in the name and contact details, then Add User. The Actions menu of an account has Edit user and Resend verification email.',
      'Open the Activity Log from the account menu. Filters has the model, the action (Create, Update or Delete) and the date range. Each row says who changed what and when.',
      'Open Admin > Signatories to keep the names that sign the reports. Add Signatory under the table adds a row at the top of it: type the name, the position printed under it, choose the signing role (Prepared by, Checked by, Noted by or Approved by), then Save; turn off Active to stop offering a name. The Reports pages offer these names in their Enter Signatories table.',
      'Open Admin > Backup & Restore. The cards show what a backup holds and how many records there are now. Tick Include the audit trail and notification history only when you want the activity log and the notifications in the file too: it makes a much larger, slower backup. Press Download backup, type a name and the Location where you will keep the file (both can be left empty), then Start Backup. A backup is made only when you press this button. While it runs, nothing else can be done on the page: keep it open.',
      'When the backup is done its file (.zip) is saved to your computer and is no longer kept online. Keep it somewhere safe: it holds personal records and is not encrypted. If the file is still shown as waiting, press Download in the row menu.',
      'Backup history keeps every backup with its name, date, time and location; nothing is removed from it. Edit in the row menu changes the name, the location and the remarks.',
      'Restore opens a form: drag the backup file onto it, or press Browse files. The form names the backup the file is and shows, group by group, how many records the file holds next to how many the system holds now: nothing is written yet. A backup made on another computer or copy of the system is accepted too, as long as it is a genuine backup of this system. Then type your password and press Restore: a safety backup of how things are now is made and saved first, and then the records, files, accounts and passwords go back to that backup. Do it when nobody else is using the system. Restore in a history row opens the same form.',
    ],
  },
]

const PHONE_NOTE = 'There is nothing to install. Open the same web address in the browser of your phone and sign in; the screens fit the phone, and the menu moves to the bottom.'

// ── Farmer, Fisherfolk and Organization accounts
// Every one of these accounts has the same menu: Home, then its own lists, then More (the rest of its pages, and Log out). On a phone the
// same five entries run along the bottom.
const MENU_STEP = (entries) => `The menu has five entries: ${entries} and More. On a computer it is on the left; on a phone it runs along the bottom. More opens the other pages of your account, Help, the User Manual (this page) and Log out.`

const FARMER_GUIDES = [
  {
    id: 'start', title: 'Getting started and Home',
    intro: 'Sign in with the account the office gave you. Home starts with what needs you today.',
    screens: ['login', 'farmer-home', 'farmer-more'],
    steps: [
      'Sign in with your username (or email) and password. The first time you are asked to choose a new password. There is no self-registration: the office creates your account.',
      MENU_STEP('Home, Crops, Assistance, Disasters'),
      'Home lists the things waiting for you, the most urgent first: an activity that is overdue or due, assistance to answer, a crop you can harvest, equipment due back. Press the button on a line to do it there.',
      'When nothing waits, Home says Nothing needs you today. Under the list are your crops in the field and three figures.',
      'If a part of Home could not be read, a red notice says which part and Try again reloads it. A dash in a figure means the same.',
    ],
  },
  {
    id: 'crops', title: 'Your crops',
    intro: 'Crops lists every crop the office registered for you, in sections.',
    screens: ['farmer-crops', 'farmer-crop-details'],
    steps: [
      'Open Crops. The sections are Growing, Ready to harvest, Harvested and Lost. Search by crop or place, and pick a year when your crops span more than one.',
      'Each row leads with what to do next: Log activity while the crop grows, Record harvest once it is ready and allowed.',
      'Log activity opens already filled in from the crop\'s schedule (the activity that is due, its recommendations, the fertilizer type). Change anything, then Save.',
      'Details shows the crop, its parcel and dates, its activities, disasters and remarks. Its buttons: Log Activity, Record Harvest, Force Harvest (for a crop still growing, when a storm or flood is coming) and Report Disaster (not for a harvested crop).',
    ],
  },
  {
    id: 'assistance', title: 'Assistance you received',
    intro: 'Assistance lists the help the office or your organization recorded for you.',
    screens: ['farmer-assistance'],
    steps: [
      'Open Assistance. Waiting for you comes first, then Being followed up (you said it did not arrive), Scheduled (a later date) and History.',
      'Answer with Received or Not received. Received can carry proof photos and a note; Not received asks for the reason.',
    ],
  },
  {
    id: 'disaster', title: 'Report a disaster',
    intro: 'If a typhoon, flood, drought or pest hurts your crops, report it so the office knows.',
    screens: ['farmer-disasters', 'farmer-report-disaster'],
    steps: [
      'Open Disasters. Your reports are listed, Ongoing first, then Recovered.',
      'Report a disaster opens a window: tick every crop that was hit and press Continue. The second window takes the type, the date, the damage and photos once for all of those crops.',
      'Mark recovered closes an ongoing report; describe how the crop came back. Details shows the report as saved, with Print and Download.',
    ],
  },
  {
    id: 'forecast', title: 'Forecast',
    intro: 'Forecast, under More, shows when your crops should be ready.',
    screens: ['farmer-forecast'],
    steps: [
      'Open More, then Forecast. Growing crops come first, with the expected harvest date, the days left and the estimated yield.',
      'Harvested crops show the actual day and yield, and a badge with the difference from the estimate. Yield analysis explains the difference with the activities that were missed.',
    ],
  },
  {
    id: 'equipment', title: 'Borrow equipment',
    intro: 'When you belong to an organization that lends equipment, Borrow equipment is under More.',
    screens: ['farmer-equipment'],
    steps: [
      'Open More, then Borrow equipment. Pick an item to ask for some units and a return date; the organization approves or rejects it.',
      'My loans lists your requests and loans. Cancel request takes a request back; I returned it tells the organization the units are back.',
    ],
  },
  {
    id: 'profile', title: 'Your profile',
    intro: 'My profile, under More, shows what the office has on record about you.',
    screens: ['farmer-profile'],
    steps: [
      'Open More, then My profile. Change photo replaces your picture at once.',
      'Each detail has a button: Edit for your contact number, Request change for your name or barangay, or a padlock for what only the office can correct.',
      'Your change requests lists what you asked for and the answer. Change password and Log out are at the bottom.',
    ],
  },
  {
    id: 'phone', title: 'Using the system on a phone',
    intro: 'The same account works on a phone. These pictures were taken at phone size.',
    phone: true,
    screens: ['login-phone', 'farmer-p-home', 'farmer-p-crops', 'farmer-p-assistance', 'farmer-p-more'],
    steps: [
      PHONE_NOTE,
      'The bottom menu has Home, Crops, Assistance, Disasters and More. The bell at the top lists your notices.',
      'Lists become cards, with their buttons large enough to press with a thumb.',
      'To report a disaster in the field, open Disasters, press Report a disaster and add photos with the phone camera.',
    ],
  },
]

const FISHERFOLK_GUIDES = [
  {
    id: 'start', title: 'Getting started and Home',
    intro: 'Sign in with the account the office gave you. Home starts with what needs you today.',
    screens: ['login', 'fisherfolk-home'],
    steps: [
      'Sign in with your username (or email) and password. The first time you are asked to choose a new password.',
      MENU_STEP('Home, Cycles, Assistance, Disasters'),
      'Home lists the things waiting for you: assistance to answer, a cycle you can harvest, equipment due back. Press the button on a line to do it there.',
      'Under the list are your cycles in the water and three figures: active cycles, ponds and cages, and harvested cycles.',
    ],
  },
  {
    id: 'cycles', title: 'Your cycles, ponds and cages',
    intro: 'Cycles lists every production cycle of yours, in sections.',
    screens: ['fisherfolk-cycles', 'fisherfolk-log-choice', 'fisherfolk-cycle-details'],
    steps: [
      'Open Cycles. The sections are Growing, Ready to harvest, Harvested and Lost. A red triangle beside a status means a disaster is still open on that cycle.',
      'Start a cycle opens the form for a new cycle: the culture phase, species, culture system, water and fingerling source, place, ownership, dates and each pond or cage.',
      'Log activity asks which log first, then opens the Feeding Log or the Health Log for that cycle\'s ponds and cages.',
      'Record harvest leads the row once half of the culture time has passed, or sooner when a Health Log asked for a force harvest.',
      'Details shows the cycle with its ponds and cages. Its buttons are Activity logs, Edit, Print, Harvest details (once harvested) and Force harvest for an emergency.',
    ],
  },
  {
    id: 'assistance', title: 'Assistance you received',
    intro: 'Assistance lists the help recorded for you.',
    screens: ['fisherfolk-assistance'],
    steps: [
      'Open Assistance. Waiting for you comes first, then Being followed up, Scheduled and History.',
      'Answer with Received or Not received. Received can carry a photo of what you got.',
    ],
  },
  {
    id: 'disaster', title: 'Report a disaster',
    intro: 'Report a typhoon, flood, fish kill or other disaster that hurt your ponds, cages or stocks.',
    screens: ['fisherfolk-disasters'],
    steps: [
      'Open Disasters. Your reports are listed, Ongoing first.',
      'Report a disaster opens the form: the date and type, the ponds or cages hit with the fingerlings lost in each, equipment damage, a description and photos. A report about equipment only is Not linked to a stock.',
      'Mark recovered closes a report with a note on how you recovered. Details shows it as saved, with Print and Download.',
    ],
  },
  {
    id: 'forecast', title: 'Forecast',
    intro: 'Forecast, under More, shows when your cycles should be ready.',
    screens: ['fisherfolk-forecast'],
    steps: [
      'Open More, then Forecast. Growing cycles come first, with the expected harvest, the days left and the estimated harvest in kg.',
      'Harvested cycles show what came out and the difference from the estimate. Yield analysis names the feeding and health logs behind it: possible factors, not proven causes.',
    ],
  },
  {
    id: 'profile', title: 'Your profile',
    intro: 'My profile, under More, shows what the office has on record about you.',
    screens: ['fisherfolk-profile'],
    steps: [
      'Open More, then My profile. Change photo replaces your picture at once.',
      'Edit changes your contact number. Request change asks the office to change your name or barangay. A padlock marks what only the office can correct.',
    ],
  },
  {
    id: 'phone', title: 'Using the system on a phone',
    intro: 'The same account works on a phone. These pictures were taken at phone size.',
    phone: true,
    screens: ['login-phone', 'fisherfolk-p-home', 'fisherfolk-p-cycles', 'fisherfolk-p-disasters'],
    steps: [
      PHONE_NOTE,
      'The bottom menu has Home, Cycles, Assistance, Disasters and More.',
      'Each cycle is a card with Log activity (or Record harvest) and Details.',
      'To report a disaster by the pond, open Disasters and add photos with the phone camera.',
    ],
  },
]

const ORG_GUIDES = [
  {
    id: 'start', title: 'Getting started and Home',
    intro: 'Sign in with the organization\'s account. Home starts with what needs the organization today.',
    screens: ['login', 'org-home'],
    steps: [
      'Sign in with the username and password the office gave your organization. The first time you are asked to choose a new password.',
      MENU_STEP('Home, Members, Assistance, Equipment'),
      'Home lists what waits for the organization, one line per kind with a count: members waiting for a confirmation, borrow requests, overdue loans. Each opens the list where you act.',
      'Under it are three figures: active members, equipment on loan and borrow requests.',
    ],
  },
  {
    id: 'members', title: 'Members and officers',
    intro: 'Members lists everyone in the organization; Officers, under More, who holds each position.',
    screens: ['org-members', 'org-add-member', 'org-officers'],
    steps: [
      'Open Members. Active members come first, then those no longer active. Search by name, RSBSA number or position.',
      'Add member finds a registered farmer or fisherfolk by name; choose the position and the date joined. Import adds many from a spreadsheet.',
      'Open More, then Officers. Assign officer gives a free position to an active member: one position per person. End term early frees a position, with the reason. Officer history lists everyone who held one.',
    ],
  },
  {
    id: 'equipment', title: 'Equipment and loans',
    intro: 'Equipment has two tabs: Items (what you own) and Loans (what is lent).',
    screens: ['org-equipment', 'org-item-details', 'org-loans'],
    steps: [
      'Open Equipment. Items lists each kind of equipment with its units, condition, units out and units free. Add equipment adds one; Import adds many.',
      'Details on an item lists its units by condition. Each condition has Change condition, Record repair, Lend, History and Remove (an item with loans or repairs on record cannot be removed).',
      'Lend equipment, at the top, records several members borrowing one item together. Only units in Good condition can be lent.',
      'Loans lists Requests (Approve or Reject), On loan (Mark returned, with what happened: returned, damaged or never returned) and Returned. The number on the tab is how many requests wait.',
    ],
  },
  {
    id: 'assistance', title: 'Assistance',
    intro: 'Assistance records what the organization gave its members.',
    screens: ['org-assistance', 'org-distribute-choice', 'org-confirm-members'],
    steps: [
      'Open Assistance. To do lists assistance still waiting; History lists what was received or settled, with Print Report.',
      'Distribute assistance asks first: one member or all members. Then fill in the type, the source agency, the quantity and the date, review it and confirm. A future date schedules it.',
      'Confirm for members lists members without a working account whose assistance waits. Tick them (or Select all), press the confirm button and add at least two proof photos. Already confirmed is a table of the assistance you confirmed, one row each: click a row to see which members were confirmed and their photos, and print or download the report of the whole assistance or of one member. It is final.',
    ],
  },
  {
    id: 'profile', title: 'Organization profile',
    intro: 'Organization profile, under More, holds your organization\'s own details.',
    screens: ['org-profile'],
    steps: [
      'Open More, then Organization profile. Change logo replaces the logo at once; Edit changes the contact number at once.',
      'Request change sends a new name, barangay, street address, email or contact person to the office. The row waits until both the Admin and the Focal Person approve it, and says who already did.',
      'The registration number, agency and dates are fixed. The password is shared by everyone using the account, so tell your officers before changing it.',
    ],
  },
  {
    id: 'phone', title: 'Using the system on a phone',
    intro: 'The same account works on a phone. These pictures were taken at phone size.',
    phone: true,
    screens: ['login-phone', 'org-p-home', 'org-p-members', 'org-p-equipment'],
    steps: [
      PHONE_NOTE,
      'The bottom menu has Home, Members, Assistance, Equipment and More.',
      'Each member, item and loan is a card; Approve, Reject and Mark returned are on the card itself.',
    ],
  },
]

const GUIDES = {
  admin: () => STAFF_GUIDES(false),
  focal: () => STAFF_GUIDES(true).filter((g) => !g.adminOnly),
  farmer: () => FARMER_GUIDES,
  fisherfolk: () => FISHERFOLK_GUIDES,
  org: () => ORG_GUIDES,
}

// The guides of one kind of account, each with its screens (picture + legend) filled in from the screenshot tool's file.
export function manualFor(audience) {
  const make = GUIDES[audience]
  if (!make) return []
  return make().map((g) => ({ ...g, screens: g.screens.map((id) => (SCREENS[id] ? { id, ...SCREENS[id] } : null)).filter(Boolean) }))
}

// The ids a guide names but that have no picture (the test fails on any).
export function missingScreens() {
  return AUDIENCES.flatMap(({ id }) => GUIDES[id]().flatMap((g) => g.screens.filter((s) => !SCREENS[s]).map((s) => `${id}/${g.id}/${s}`)))
}

// The words before the guides: what the manual covers, how to read the pictures, and what to keep in mind about them.
export function manualIntro(audience, { systemTitle = 'OMAg Aringay' } = {}) {
  const label = AUDIENCES.find((a) => a.id === audience)?.label || ''
  const guides = manualFor(audience)
  const hasPhone = guides.some((g) => g.phone)
  return {
    lead: `This guide walks through the ${systemTitle} system screen by screen in annotated pictures, for the ${label} account. It is organized by the jobs you do in the system:`,
    contents: guides.map((g, i) => ({ n: i + 1, title: g.title, about: g.intro })),
    howToRead: 'Each picture has numbered orange boxes. The list under the picture explains each number: what that part of the screen is and what it does, so every button and field is covered. The first time, work through the numbers in order. The numbered steps above the pictures say what to do, in the order to do it.',
    notes: [
      'The names, crops, fisherfolk, organizations and amounts shown are sample data for illustration. They do not represent real farmers, fisherfolk or organizations.',
      'Counts, totals and charts on your system will differ from the pictures.',
      'A table that is wider than the screen is shown in two pictures, or in a wide picture: the last columns are at its right edge.',
      ...(hasPhone ? ['The pictures marked as a phone view were taken at phone size; the same screens fit larger screens too.'] : []),
      'A menu or button you do not see in a picture is not part of your account: each kind of account sees only its own screens.',
      'Every picture was captured from the November 2026 version of the system.',
    ],
  }
}

// Every picture a manual shows, for the test that checks the files exist.
export const allImages = () => AUDIENCES.flatMap(({ id }) => manualFor(id).flatMap((g) => g.screens.map((s) => s.image)))
