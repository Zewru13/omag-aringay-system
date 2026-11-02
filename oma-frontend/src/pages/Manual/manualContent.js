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
      'The bell shows notices for you, such as a disaster that a farmer or fisherfolk reported or a change request waiting for review. Your name opens the account menu: your profile, the User Manual (this page), the Activity Log (Admin) and Logout.',
      'The Dashboard opens after sign-in. Its panels show the registered farmers and fisherfolk, the disasters over time (choose the From and To month), the season\'s yield against the target, how farmers and fisherfolk harvested against the estimate (choose the year), the overdue, due today and upcoming activities, the barangay activity status and the change requests waiting for review.',
      'In Pending Change Requests, Approve applies the change a farmer, fisherfolk or organization asked for (for example a new name or barangay) and Reject refuses it.',
      'My Profile (from the account menu) shows your own account: Edit profile changes your details and the camera button changes your photo.',
    ],
  },
  {
    id: 'register-farmer',
    title: 'Register a farmer',
    intro: 'Registration > Farmers is the list of everyone registered. Each farmer is registered once, with their RSBSA number, and has a profile with their machinery, farm parcels, crops and visits.',
    screens: [focal ? 'focal-farmers' : 'admin-farmers', 'admin-farmers-filters', 'admin-register-farmer', 'admin-farmer-profile'],
    steps: [
      'Open Registration > Farmers. Type in the search box (name, RSBSA number or barangay) and press Filters to narrow the list by gender, barangay, farmer type, senior citizens, ICC/IP members, PWD and the dates registered.',
      'Print Report and Download Report give the list exactly as filtered, as a printout or a PDF. Import Farmers registers many farmers from a spreadsheet, with a preview first.',
      'Press Register Farmer and fill in the personal information, the contact information and the government information (the RSBSA number is required and must be new). Tick PWD, 4Ps and ICC/IP if they apply; Senior Citizen is automatic from the birthdate.',
      'Optionally choose the farmer\'s organization and add machinery (Add machinery for each line, or Import machinery from a spreadsheet).',
      'Press Save Farmer to save, or Save Farmer & Add Farm Parcels to save and go straight to the table that records the farmer\'s parcels and crops.',
      'Click a farmer in the list to open the profile. There you can see the assistance history, make a PDF report, add or import farm parcels, edit the farmer, regenerate the farmer\'s password, add machinery, edit a parcel, open its crops, see the crop monitoring records by stage and record a farm visit.',
      DRAFT_NOTE,
    ],
  },
  {
    id: 'register-fisherfolk',
    title: 'Register a fisherfolk',
    intro: 'Registration > Fisherfolk works like Farmers, with the FishR number, the fisherfolk type and the activities, and a profile with stocking records and ponds.',
    screens: ['admin-fisherfolk', 'admin-register-fisherfolk', 'admin-fisherfolk-profile'],
    steps: [
      'Open Registration > Fisherfolk. Search, filter, print or download the list, or import fisherfolk from a spreadsheet, as for farmers.',
      'Press Register Fisherfolk. Fill in the personal, contact and government information (RSBSA number required; FishR number and PhilSys optional).',
      'Choose the Fisherfolk Type: Aquaculture (ponds and cages, with production cycles) or Capture (fishing trips and catch). Tick the activities they do (Aquaculture, Capture Fishery, Mariculture, Inland Fishery) and optionally choose their organization.',
      'Click a fisherfolk in the list to open the profile: the assistance history, the PDF report, Edit Profile and Regenerate Password.',
      'On the profile, Add Pond adds one pond or cage (name, barangay, area, water source, PCIC insurance) and Bulk Add Ponds adds several. The Stocking Records table lists the production cycles.',
    ],
  },
  {
    id: 'organization',
    title: 'Register an organization, its members, equipment and officers',
    intro: 'Organizations > Farmers Organizations (or Fisherfolk Organizations) holds each organization with its members, officers and equipment.',
    screens: ['admin-organizations', 'admin-org-menu', 'admin-add-organization', 'admin-add-members', 'admin-edit-organization', 'admin-org-detail', 'admin-org-equipment', 'admin-org-confirmed', 'admin-assign-officer', 'admin-fisherfolk-orgs'],
    steps: [
      'Open Organizations. Search, filter, print or download the list, or Import Organizations from a spreadsheet.',
      'The three-dot menu of a row has Edit organization, View organization profile and Add assistance (it opens the Assistance page with that organization already chosen).',
      'Press Add Organization. Fill in the name, barangay, the dates organized and registered, the registration number and agency, the email, the contact person (one full-name box) and the contact number.',
      'In the Equipment section, Add equipment adds a line (the equipment, how many units, the date acquired and remarks), or attach a file with Import equipment (Download template gives its columns). New equipment starts as Good.',
      'In the Members section press Add Members: a table lists the registered farmers who are not members yet. Search, tick the people, choose each one\'s position (Member or an officer position) and press Add selected. Import members attaches a spreadsheet instead. Everything is saved when you press Add Organization.',
      'Edit organization opens the same form, with a Members section to add more members later.',
      'View organization profile opens the organization page. Members lists the members (Add Member, Import Members). Equipment Inventory lists the equipment (Add Equipment, Import Equipment, Remove). Confirmed for Members is the record of what the organization confirmed for its members.',
      'Organization Officers shows the officers. Assign Officer gives a position to a member; if the position is held, end that term first. Officer History lists the earlier officers.',
      'Regenerate Password makes a new random password for the organization\'s login account and shows it once.',
    ],
  },
  {
    id: 'parcels',
    title: 'Add farm parcels and crops',
    intro: 'Crop Management > Crop Records lists every parcel. Open a parcel to see the crops planted on it. Parcels and crops are added in tables.',
    screens: ['admin-crop-records', 'admin-parcel-menu', 'admin-add-parcels', 'admin-add-crops', 'admin-add-crops-right', 'admin-edit-parcel'],
    steps: [
      'Open Crop Management > Crop Records. Search by farmer, RSBSA number or parcel number; Filters has barangay, PCIC insured, Planted From / To and Group by. Print Report and Download Report give the records as filtered.',
      'The arrow at the start of a parcel row shows or hides its crops. Import Farm Parcels adds the parcels of all farmers from one spreadsheet.',
      'Add Farm Parcel opens a table: choose the farmer, then fill one row per parcel (parcel number, barangay, area, land ownership, tax declaration, farm type, cropping schedule). Add Parcel adds another row; under a parcel, Add crop records what is planted on it and Import crops reads its crops from a spreadsheet.',
      'Land Ownership is something you choose (Owner, Tenant or Lessee); a Tenant or Lessee parcel also needs the land owner\'s name. The crops on a parcel together can never be larger than its area (a double or triple cropping parcel may hold two or three times its area).',
      'The three-dot menu of a parcel has Add crops, Force harvest, Print report and Edit parcel. Add crops opens the crop table for that parcel: the crop type, date planted, area, season, variety, seed source, quantity of seeds (or trees), PCIC insurance (with a photo of the form) and the parcel.',
      'Submit Parcel or Submit Record saves everything in the table together, or nothing if one row has a problem. ' + DRAFT_NOTE,
    ],
  },
  {
    id: 'harvest',
    title: 'Monitor crops, record activities, harvest or report a disaster',
    intro: 'Crop Management > Crop Monitoring follows each crop from planting to harvest.',
    screens: ['admin-crop-monitoring', 'admin-crop-filters', 'admin-crop-menu', 'admin-crop-details', 'admin-record-activity', 'admin-record-harvest', 'admin-report-crop-disaster', 'admin-force-harvest'],
    steps: [
      'Open Crop Monitoring. It opens on the crops that are Planted. Search, then open Filters: group by, crop, status, PCIC, season, year and the date planted. Print Report and Download Report follow the filters.',
      'The statuses are: Planted; Near Harvest (within 7 days of the expected date: Due Harvest while still ahead, Ready for Harvest from the harvest date, Overdue after 7 days); Harvested; and Total Loss.',
      'The PCIC Insured box of a crop is ticked when it has insurance. The three-dot menu has Record Activity, View Crop Details, Record Harvest, Force Harvest and Report Disaster.',
      'Record Activity logs one activity (the activity, the date, the plant condition and recommendations). Get Suggestions shows what is recommended; Activity History lists the activities already logged.',
      'Record Harvest opens once half of the crop\'s growing time has passed; before that it says Not Yet Available. Enter the harvested date, the area harvested, the unit of measure and the quantity. A harvest more than 7 days after the expected date asks for a reason.',
      'Report Disaster reports damage on one crop: the type, the date, the area affected, the damage and the loss, and photos. Tick Total loss if the crop is completely destroyed: it moves to Total Loss.',
      'Force Harvest harvests crops that are not ready, because of something coming (a typhoon, drought and so on): choose the date and the reason, tick the crops, type each one\'s area and its quantity with its unit (the kg shows under the box), then Review Force Harvest, check the totals and confirm.',
    ],
  },
  {
    id: 'fisheries-monitoring',
    title: 'Fisheries: Aquaculture Monitoring and Capture Monitoring',
    intro: 'Fisheries Management has Aquaculture Monitoring (production cycles of ponds and cages) and Capture Monitoring (fishing trips and catch).',
    screens: ['admin-aquaculture', 'admin-aquaculture-filters', 'admin-aquaculture-menu', 'admin-start-cycle', 'admin-cycle-details', 'admin-capture', 'admin-capture-log', 'admin-capture-timeline'],
    steps: [
      'Open Aquaculture Monitoring. Search, open Filters (pond or cage name, status, species, season, year, Stocked From / To), print or download the list.',
      'Start Production Cycle opens the form: the fisherfolk, organization, culture phase, species, culture system, water source, fingerling source, pond location, ownership, stocking date, target harvest date and the number of ponds. Each pond or cage then gets its size, fingerlings and PCIC insurance.',
      'The harvest button of a row is grayed out until at least half of the expected time has passed. The three-dot menu has View Details, Edit, View Cycle Details & Logs and Force Harvest.',
      'In View Cycle Details & Logs, Cycle Info shows the ponds, the Feeding Log records the feed given and the Health Log records disease and treatment.',
      'Open Capture Monitoring for fishing trips. The cards show the total catch, the estimated value and the active fisherfolk. Log Catch records a trip: the fisherfolk, the dates, the fishing ground, the gear and a line for each species (volume and value). Historical Timeline shows the catch season by season.',
    ],
  },
  {
    id: 'forecasting',
    title: 'Forecasting and yield analysis',
    intro: 'Forecasting looks ahead at the harvest expected from the planted crops and the production cycles, and looks back at how the actual harvest compared.',
    screens: ['admin-crop-forecast', 'admin-forecast-details', 'admin-yield-analysis', 'admin-fisheries-forecast'],
    steps: [
      'Open Forecasting > Crop Forecasting. Forecast lists each planted crop with the area, the estimated yield (area times the crop\'s yield per hectare) and the expected harvest date. All crops / By farmer chooses how it is grouped.',
      'View opens the forecast details of a crop, where you can write remarks and notes and press Save remarks.',
      'Yield analysis compares the estimate with the actual harvest. Analysis lists each harvested crop; By farmer, By barangay and By crop type add the figures up. The variance shows how far the actual is above or below the estimate, with the activities and the possible factors (such as disasters). Preview PDF and Download Excel give the analysis as a file.',
      'Fisheries Forecasting does the same for production cycles: by stocking, by fisherfolk, by barangay and by species.',
    ],
  },
  {
    id: 'assistance',
    title: 'Give assistance',
    intro: 'Assistance > Crop Assistance (or Fisheries Assistance) records help given to farmers, fisherfolk and organizations.',
    screens: ['admin-crop-assistance', 'admin-assistance-members', 'admin-assistance-filters', 'admin-assistance-import', 'admin-distribute', 'admin-distribute-farmers', 'admin-fisheries-assistance'],
    steps: [
      'Open Assistance. All Records lists every distribution; Needs Follow-up lists the recipients who reported that they did not receive it. Filters has the barangay and the year.',
      'Click a row to open the members who benefited. Their Actions menu has View, Edit (while it is pending or awaiting confirmation), Mark Resolved (for a case reported as not received) and Confirm for Member.',
      'Distribute to Organizations gives one assistance to the members of the organizations you tick; Distribute Farmer Assistance (Fisherfolk Assistance on the fisheries page) gives it to the individuals you tick.',
      'Choose the assistance type (Fertilizer, Seeds, Equipment, Cash Assistance, Training or Other), the source agencies, the quantity with its unit and the date. A later date schedules it: it stays Pending until then.',
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
      'Open Disaster > Crop Disaster. The table lists the farmers who have disaster logs. Filters has the barangay, type, status, year and the date it occurred (From and To). Print Report and Download Report give the table as a report.',
      'Click a farmer to open their disasters, then one to see its log with Print Disaster Log and Download Disaster Log. The Actions menu of a farmer gives View Report, Print and Download.',
      'Press Log Disaster to report one disaster on many parcels and crops at once: fill the event once (type, date, damage, loss, photos), tick the parcels and crops that were hit, and tick Total loss where a crop was destroyed. Report Disaster saves one log for each farmer and crop.',
      'In Disaster > Fisheries Disaster, press Log Disaster. Step 1: search for the fisherfolk and click their name. Step 2: choose the stock or stocks that were hit (or Not linked to a stock), the date and the type, then the volume lost, the equipment damaged, a description and photos.',
      'Press Log Disaster to save. The log of that fisherfolk opens so you can print or download it. To report another fisherfolk, start again.',
    ],
  },
  {
    id: 'reports',
    title: 'Reports',
    intro: 'Reports has the official reports. Open one, set its filters, then Preview PDF, Print or Download Excel.',
    screens: ['admin-reports', 'admin-report-registered', 'admin-report-crop', 'admin-report-fisheries-production', 'admin-report-fisheries-disaster', 'admin-report-org-assistance'],
    steps: [
      'Open Reports and choose a report: Registered Farmers, Fisherfolk & Organizations; Crop Records Harvested; Fisheries Production Harvested; Fisheries Disaster Reports; Crop / Parcel Disaster Reports; Organization Assistance.',
      'Set what to report and the filters (barangay, dates, crop or species and so on). The registered and the assistance reports can cover all records or one person or organization, which you search for.',
      'Preview PDF shows the report as a PDF to read; Print gives the same PDF ready to print; Download Excel saves its rows as a spreadsheet.',
      'On the farmers, fisherfolk, organizations, crop and fisheries tables, set the filters first: Print Report and Download Report give exactly the rows the table shows.',
    ],
  },
  {
    id: 'settings',
    title: 'Settings (Admin)',
    adminOnly: true,
    intro: 'The Admin menu holds the lists the forms use. Only an Admin can change them.',
    screens: ['admin-crop-settings', 'admin-crop-settings-add', 'admin-crop-settings-edit', 'admin-fisheries-settings', 'admin-activity-settings', 'admin-assistance-settings', 'admin-classification-settings', 'admin-harvest-unit-settings'],
    steps: [
      'Crop Settings has tabs for the crops (growth days, Planted As, yield per hectare), the categories, the seed sources, the varieties, the input types and the equipment types.',
      'The button under the table is named after what it adds (Add Crop, Add Variety...). A new row opens at the top: fill it and press Save. The newest item is always first. The three dots of a row have Edit and Delete.',
      'Edit Crop sets the allowed units of measure, the growth stages and the suggested activities (the activity, the day, the priority and the recommendation) that Get Suggestions shows.',
      'Fisheries Settings has the species, categories, feed types, diseases, fingerling sources, equipment types and fishing gear. Activity Settings has the crop and fisheries activity types. Assistance Settings has the source agencies.',
      'Classification Settings has the parcel classifications. Harvest Unit Settings says how many kg one harvest unit weighs, so a harvest counted in sacks or cavans is saved in kg; a unit added there also appears in the unit lists.',
    ],
  },
  {
    id: 'users',
    title: 'User accounts, Activity Log and Backup (Admin)',
    adminOnly: true,
    intro: 'User Management creates and controls the accounts. The Activity Log shows who changed what. Backup keeps a copy of the whole system.',
    screens: ['admin-users', 'admin-audit-log', 'admin-audit-log-filters', 'admin-backup'],
    steps: [
      'Open Admin > User Management. The buttons at the top choose the kind of account: Staff, Fisherfolk, Farmers or Organizations. Search, or open Filters.',
      'Create User opens Add New User: choose the role, then Next. The Actions menu of an account has Edit user and Resend verification email.',
      'Open the Activity Log from the account menu. Filters has the model, the action (Create, Update or Delete) and the date range. Each row says who changed what and when.',
      'Open Admin > Backup and press Back up now to make one file with every record and uploaded file. It runs in the background and the list updates by itself; the system also makes one every night.',
      'When a backup says Done, press Download and keep the file somewhere safe: it holds personal records and is not encrypted. The latest 14 backups are kept. Delete removes one.',
    ],
  },
]

const PHONE_NOTE = 'There is nothing to install. Open the same web address in the browser of your phone and sign in; the screens fit the phone, and the menu moves to the bottom.'

// ── Farmer, Fisherfolk and Organization accounts
const FARMER_GUIDES = [
  {
    id: 'start', title: 'Getting started and Home',
    intro: 'Sign in with the account the office gave you. Your Home shows your farm parcels, your crops and your harvests.',
    screens: ['login', 'farmer-home'],
    steps: [
      'Sign in with your username (or email) and password. The first time you are asked to choose a new password. There is no self-registration: the office creates your account.',
      'The menu on the left has Home, Crop Monitoring, Forecasting, Disaster and Assistance (and Equipment when you belong to an organization). The three-line button hides or shows it.',
      'Home shows your farm parcels, active crops, total area and harvests this month, with three charts: your crops by stage, your harvest against the estimate and your disasters by type.',
      'When a crop has an activity due or overdue, a notice says so and View opens it. Each crop card has Open crop (its details) and Report disaster, and shows the next recommended activity.',
      'The bell shows your notices. Your name opens the account menu: your profile, the User Manual and Log out. Your crops appear once the office registers them; if something is missing or wrong, tell the office.',
    ],
  },
  {
    id: 'profile', title: 'Your profile',
    intro: 'Your profile shows what the office has on record about you.',
    screens: ['farmer-profile'],
    steps: [
      'Open your name at the top right, then My Profile.',
      'The icons beside a detail tell you how it can change: a pencil changes it at once (your contact number), the arrows send a request that the office approves first (your name and barangay), and a padlock means it cannot be changed here (the RSBSA number and the reference information).',
      'Request a Change asks the office to change a locked detail; they check it first. Use the camera button on your picture to change your photo.',
      'Change Password is optional: press Edit to set a new password. Log out signs you out. Borrow equipment appears when you belong to an organization.',
    ],
  },
  {
    id: 'crops', title: 'Follow your crops',
    intro: 'Crop Monitoring lists your farm parcels and the crops on them, with their dates and status.',
    screens: ['farmer-crops'],
    steps: [
      'Open Crop Monitoring. Each row is one of your farm parcels. Search by crop or barangay, or open Filters. Print Report and Download Report give your list.',
      'The arrow at the end of a row opens the crops planted on that parcel: the crop, variety, organization, barangay, date planted, expected harvest, how many activities were logged, PCIC insurance and the status.',
      'The three-dot menu of a crop has Record Activity, View Crop Details, Record Harvest and Report Disaster.',
      'Record Activity logs what you did on the crop (the activity, the date, the plant condition and notes); Get Suggestions shows what is recommended next.',
      'Record Harvest opens once at least half of the crop\'s growing time has passed: enter the date, the area harvested, the unit and the quantity.',
    ],
  },
  {
    id: 'forecast', title: 'Forecasting',
    intro: 'Forecasting shows the harvest expected from your crops.',
    screens: ['farmer-forecast'],
    steps: [
      'Open Forecasting. Forecast lists your planted crops with the area, the estimated yield in kg, the expected harvest date and the status.',
      'View opens the forecast details of a crop. Yield analysis compares the estimate with the actual harvest of the crops you already harvested.',
    ],
  },
  {
    id: 'disaster', title: 'Report a disaster',
    intro: 'If a typhoon, flood, drought or pest hurts your crops, report it so the office knows.',
    screens: ['farmer-disaster', 'farmer-disaster-history'],
    steps: [
      'Open Disaster. Step 1: tick every crop that was hit (Select all ticks them all). You fill in the disaster only once for all of them. Press Continue.',
      'Step 2: choose the type of disaster and the date, describe the damage and add photos of it. Send the report; the office is notified.',
      'Disaster history lists your earlier reports with the reference number, crop, type, date, area affected, status (Active until the crop recovers, then Recovered) and a View button for each.',
    ],
  },
  {
    id: 'assistance', title: 'Assistance you received',
    intro: 'Assistance lists the help the office or its partners gave you.',
    screens: ['farmer-assistance'],
    steps: [
      'Open Assistance. History is what you received; Upcoming is what is scheduled for a later date; Needs Follow-up is what you reported as not received.',
      'Open an assistance to see its source agency, quantity and status. When it asks you, confirm that you received it, or say that you did not so the office can look into it.',
    ],
  },
  {
    id: 'equipment', title: 'Borrow equipment',
    intro: 'If you belong to an organization that lends equipment, the Equipment page lets you ask to borrow it.',
    screens: ['farmer-equipment'],
    steps: [
      'Open Equipment. Available to borrow lists your organization\'s equipment that can be lent now. Search or open Filters.',
      'Click an item to ask to borrow it: choose how many units and the return date. The organization approves or rejects your request.',
      'My loans lists what you asked for or borrowed, with its status.',
    ],
  },
  {
    id: 'phone', title: 'Using the system on a phone',
    intro: 'The same account works on a phone. These pictures were taken at phone size.',
    phone: true,
    screens: ['login-phone', 'farmer-p-home', 'farmer-p-menu', 'farmer-p-crops', 'farmer-p-disaster', 'farmer-p-forecast', 'farmer-p-assistance', 'farmer-p-profile'],
    steps: [
      PHONE_NOTE,
      'The menu along the bottom has Home, Monitoring, Disaster, Forecasting and Assistance. Tap one to open it.',
      'The bell and your initials at the top open your notifications and your account menu (My Profile, User Manual and Log out).',
      'Tables become cards on a phone. Tap a parcel to open its crops; use the search box and Filters to find one.',
      'To report a disaster in the field, open Disaster, tick the crops that were hit, press Continue and add photos with the phone camera.',
    ],
  },
]

const FISHERFOLK_GUIDES = [
  {
    id: 'start', title: 'Getting started',
    intro: 'Sign in with the account the office gave you. You land on your aquaculture records: your production cycles, ponds and cages.',
    screens: ['login', 'fisherfolk-stocks'],
    steps: [
      'Sign in with your username (or email) and password. The first time you are asked to choose a new password.',
      'On a larger screen you land on Aquaculture Monitoring. On a phone, Home shows a summary of your cycles first.',
      'The menu has Home, Aquaculture Monitoring, Forecasting, Disaster and Assistance. The bell shows your notices; your name opens your profile, the User Manual and Log out.',
    ],
  },
  {
    id: 'profile', title: 'Your profile',
    intro: 'Your profile shows what the office has on record about you.',
    screens: ['fisherfolk-profile'],
    steps: [
      'Open your name at the top right, then My Profile.',
      'The icons beside a detail tell you how it can change: a pencil changes it at once, the arrows send a request that the office checks first, and a padlock means it cannot be changed here.',
      'Use the camera button on your picture to change your photo. Change Password is optional.',
    ],
  },
  {
    id: 'stocks', title: 'Your stocks, ponds and cages',
    intro: 'Aquaculture Monitoring lists your production cycles and stocks.',
    screens: ['fisherfolk-stocks', 'fisherfolk-start-cycle'],
    steps: [
      'Open Aquaculture Monitoring. Each row is a production cycle: its species, culture type, date stocked, expected and actual harvest, pond location and status.',
      'Click a row to open its ponds or cages: the unit, fingerlings, dimensions, area, estimated and actual harvest and the date harvested.',
      'Press Start Production Cycle to begin a new cycle: choose the culture phase, species, culture system, water and fingerling source, pond location, ownership, the stocking and target harvest dates and the number of ponds, then give each pond its size, fingerlings and PCIC insurance.',
      'The harvest button is grayed out until half of the expected time has passed. The three dots open the menu: view details, edit, view cycle details & logs (the Feeding Log and the Health Log) and force harvest.',
    ],
  },
  {
    id: 'forecast', title: 'Forecasting',
    intro: 'Forecasting shows the harvest expected from your production cycles.',
    screens: ['fisherfolk-forecast'],
    steps: [
      'Open Forecasting. Forecast lists each cycle with the fingerlings, the estimated harvest yield, the actual harvest and the estimated and actual harvest dates.',
      'Yield analysis compares the estimate with the actual harvest.',
    ],
  },
  {
    id: 'disaster', title: 'Report a disaster',
    intro: 'Report a typhoon, flood, fish kill or other disaster that hurt your ponds, cages or stocks.',
    screens: ['fisherfolk-disaster'],
    steps: [
      'Open Disaster. Choose the stocks that were hit (or Not linked to a stock, for pond, cage or equipment damage only).',
      'Give the date and the type of disaster, the volume lost if you know it, the equipment damaged, a description and photos (Take Photo or Add More Photos).',
      'Press Log Disaster. The office is notified. Disaster history lists your earlier reports and whether each is Active or Recovered.',
    ],
  },
  {
    id: 'assistance', title: 'Assistance you received',
    intro: 'Assistance lists the help given to you.',
    screens: ['fisherfolk-assistance'],
    steps: [
      'Open Assistance. All Records is everything you received; Needs Follow-up is what you reported as not received.',
      'Open an assistance to see its details and to confirm that you received it when it asks you to.',
    ],
  },
  {
    id: 'phone', title: 'Using the system on a phone',
    intro: 'The same account works on a phone. These pictures were taken at phone size.',
    phone: true,
    screens: ['login-phone', 'fisherfolk-p-home', 'fisherfolk-p-stocks', 'fisherfolk-p-disaster', 'fisherfolk-p-forecast', 'fisherfolk-p-assistance'],
    steps: [
      PHONE_NOTE,
      'The menu along the bottom has Home, Monitoring, Disaster, Forecasting and Assistance. Tap one to open it.',
      'Home shows your active cycles, ponds and cages, harvested cycles and open disasters, with Open cycle and Report disaster buttons.',
      'Tables become cards on a phone. Tap a card to open the stock.',
      'To report a disaster by the pond, open Disaster, choose the stocks that were hit and add photos with the phone camera.',
    ],
  },
]

const ORG_GUIDES = [
  {
    id: 'start', title: 'Getting started and Home',
    intro: 'Sign in with the organization\'s account. The Home shows your organization at a glance.',
    screens: ['login', 'org-home'],
    steps: [
      'Sign in with the username and password the office gave your organization. The first time you are asked to choose a new password.',
      'The menu opens Home, My Organization and Assistance. Equipment is a tab inside My Organization.',
      'Home shows your members by status, the assistance reported this year by month and by type, and shortcuts: Distribute assistance, Members, Officers, Equipment, Borrowed equipment and Confirm for members.',
      'When members have no working account of their own, a notice says how many are waiting for a confirmation: Confirm for Members opens them.',
    ],
  },
  {
    id: 'organization', title: 'My Organization: members, officers and confirmations',
    intro: 'My Organization has your members, equipment, borrowed items, officers and what you confirmed.',
    screens: ['org-members', 'org-add-member', 'org-officers', 'org-confirmed'],
    steps: [
      'Open My Organization. The tabs are Members, Equipment, Borrowed, Officers and Confirmed for Members.',
      'Members lists everyone in the organization. Search or open Filters. Add Member adds a registered farmer (search the farmer and give the date joined); Import Members adds many from a spreadsheet.',
      'Officers lists the president, vice president, secretary, treasurer, auditor, board members and the others. Assign Officer gives a position to a member; if it is held, end that term first (open the officer, End term early, give the reason). Officer History lists the earlier officers.',
      'Confirmed for Members is the record of what you confirmed for your members, with the proof photos. These confirmations are final.',
      'To change the registration details of the organization, ask the office, or use Request change on your profile.',
    ],
  },
  {
    id: 'equipment', title: 'Equipment',
    intro: 'The Equipment tab lists what the organization owns and who borrowed it.',
    screens: ['org-equipment', 'org-borrowed', 'org-lend'],
    steps: [
      'Open My Organization, then the Equipment tab. Each item shows its units, their condition and how many are on loan. Search, or open Filters (condition and availability).',
      'Add Equipment adds an item; Import Equipment adds many from a spreadsheet. Open an item to Lend it, Change condition (Needs Repair, Not Operational, Broken or Lost) or Repair units that were fixed.',
      'Only units in Good condition can be lent. Lend equipment (on the Borrowed tab) records that members borrowed equipment: the date, the equipment, and a tick and a number of units for each member. Lend another equipment adds a different equipment.',
      'Members with an account can also ask to borrow from their own Equipment page. Their requests appear on the Borrowed tab: Approve or Reject each one.',
      'When the units come back, open the borrower, choose Mark returned and say what happened: Returned, Damaged or Not returned (recorded as Lost). Returned lists everything that came back.',
    ],
  },
  {
    id: 'assistance', title: 'Assistance',
    intro: 'Assistance lets the organization give assistance to its members and see what was given.',
    screens: ['org-assistance', 'org-confirm-members'],
    steps: [
      'Open Assistance. History lists what the organization gave to its members. Search a member, or open Filters.',
      'Distribute to All Members gives the same assistance to every member in one step. Distribute to Individual gives it to the members you tick. Choose the type, source agency, quantity, date and description, then Review and confirm.',
      'Confirm for Members lists members who cannot confirm for themselves (they have no working account). Tick them, or Select all, and press Confirm for members: add the proof photos. These confirmations are final and need no staff approval.',
    ],
  },
  {
    id: 'profile', title: 'My Profile',
    intro: 'Your organization\'s own details.',
    screens: ['org-profile'],
    steps: [
      'Open your name at the top right, then My Profile.',
      'The registration number, agency and dates are locked: contact the office to correct them. The name, barangay, street address, email and contact person change by Request change, which the office reviews. Change logo changes the logo.',
      'Contact Number has Edit: it changes at once. Account password is shared by everyone who uses the account, so tell your officers before you change it. Change Requests lists what you asked for and its status.',
    ],
  },
  {
    id: 'phone', title: 'Using the system on a phone',
    intro: 'The same account works on a phone. These pictures were taken at phone size.',
    phone: true,
    screens: ['login-phone', 'org-p-home', 'org-p-members', 'org-p-assistance'],
    steps: [
      PHONE_NOTE,
      'The menu along the bottom has Home, Organization and Assistance. Tap one to open it.',
      'In My Organization, swipe the tabs sideways to reach Members, Equipment, Borrowed, Officers and Confirmed for Members.',
      'Tables become cards on a phone. Tap a member or an item to open it.',
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
