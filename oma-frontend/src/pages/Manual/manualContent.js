// The User Manual, in the style of an annotated screen guide: for each kind of account a few guides, each with numbered instructions and annotated pictures.
// Every picture has numbered orange boxes burned in, and a table under it ("[1] Search box: ...") says what each number is. The pictures and their tables are made
// by scripts/manual/shoot.mjs from the sample data, and the tables are written to manualScreens.js; this file only says which screens a guide shows and the words
// around them. Plain data, so it can be tested without a screen (tests/manualContent.test.mjs checks every screen exists and has its picture).
//   audience: 'admin' | 'focal' | 'farmer' | 'fisherfolk' | 'org'
// A Focal Person sees the Admin screens except the Dashboard and the farmers list, which have a picture of their own (the sidebar differs).
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

// ── Staff guides (Admin and Focal Person share them; `adminOnly` ones are left out for a Focal Person)
const STAFF_GUIDES = (focal) => [
  {
    id: 'start',
    title: 'Getting started',
    intro: 'Sign in with the account the office gave you. The Dashboard is the first screen: it shows the totals of the municipality and charts of crops, fisheries and disasters.',
    screens: ['login', focal ? 'focal-dashboard' : 'admin-dashboard'],
    steps: [
      'Open the system in your browser and sign in with your username (or email) and password. The first time, you are asked to choose a new password.',
      'The sidebar on the left lists everything you can open. Press the three-line button at the top to hide or show it.',
      'Your name at the top right opens your account menu: your profile, Help, this User Manual and Sign out. The bell shows notifications, such as a disaster a farmer reported.',
    ],
  },
  {
    id: 'register-farmer',
    title: 'Register a farmer or fisherfolk',
    intro: 'Registration > Farmers (or Fisherfolk) is the list of everyone registered. Each person is registered once, with their RSBSA number.',
    screens: [focal ? 'focal-farmers' : 'admin-farmers', 'admin-register-farmer'],
    steps: [
      'Open Registration > Farmers. Use the search box and Filters (barangay, sex, farmer type, registered dates) to find people.',
      'Print Report and Download Report give the list exactly as filtered, as a printout or a PDF.',
      'Press Register Farmer and fill in the personal details, the address and the RSBSA number. Fields marked * are required.',
      'To add the farm parcels and crops at the same time, press Save Farmer & Add Farm Parcels. You go to a table where each row is a parcel, then come back to the farmer\'s profile.',
      'Fisherfolk are registered the same way under Registration > Fisherfolk, with their fisherfolk type.',
    ],
  },
  {
    id: 'organization',
    title: 'Register an organization and add its members',
    intro: 'Organizations > Farmers\' Organizations (or Fisherfolk Organizations) holds each organization with its members, officers and equipment.',
    screens: ['admin-organizations', 'admin-add-organization', 'admin-add-members'],
    steps: [
      'Open Organizations. The three-dot menu of a row has Edit organization, View organization profile and Add assistance (it opens the assistance page with that organization already chosen).',
      'Press Add Organization. Fill in the name, barangay, dates, registration number and agency, the email, the contact person (one full-name box) and the contact number.',
      'In the Members section press Add Members. A table lists the registered farmers who are not members yet: search, tick the people and choose each one\'s position (Member or an officer position), then press Add selected. You can also attach a members file with Import members.',
      'Equipment can be added line by line, or attached as a file with Import equipment. When you press Add Organization the members are added, and any attached file opens in its Import window so you can check it first.',
      'The same Members section is in the Edit Organization form, to add more members later.',
    ],
  },
  {
    id: 'parcels',
    title: 'Add farm parcels and crops',
    intro: 'Crop Management > Crop Records lists every parcel; open a parcel to see the crops planted on it.',
    screens: ['admin-crop-records'],
    steps: [
      'Open Crop Management > Crop Records. Press the arrow of a parcel to see its crops.',
      'Add Farm Parcel adds a parcel for a farmer. The three-dot menu of a parcel has Add crops, Edit parcel, Print report and more.',
      'A parcel needs its number, barangay, area, land ownership and classification. A crop needs the crop, the variety, the date planted, the area planted and where its seeds came from. A crop cannot be larger than its parcel.',
      'Print Report and Download Report above the table give the records as filtered (use Filters first).',
    ],
  },
  {
    id: 'harvest',
    title: 'Monitor crops, record a harvest or force a harvest',
    intro: 'Crop Management > Crop Monitoring follows each crop from planting to harvest.',
    screens: ['admin-crop-monitoring', 'admin-crop-menu', 'admin-force-harvest'],
    steps: [
      'Open Crop Monitoring. The table shows each crop with its dates and status. Use Filters for status, barangay, farmer and the date planted.',
      'The three-dot menu of a row has Record Activity, View Crop Details, Record Harvest, Force Harvest and Report Disaster.',
      'Record Harvest opens once half of the crop\'s growing time has passed (from the planting date to the expected harvest date). Before that it shows "Not Yet Available". A harvest more than 7 days after the expected date asks for a reason.',
      'Force Harvest is for crops that are not ready yet but must be harvested because of something coming, such as a typhoon. Choose the date and the reason, tick the crops, type each one\'s area and its quantity in the Qty / Unit box, choosing the unit it was counted in. The kg it comes to shows under the box.',
      'Press Review Force Harvest, check the tables and the total harvest, then confirm.',
    ],
  },
  {
    id: 'assistance',
    title: 'Give assistance',
    intro: 'Assistance > Crop Assistance (or Fisheries Assistance) records help given to farmers, fisherfolk and organizations.',
    screens: ['admin-distribute'],
    steps: [
      'Open Assistance. Distribute to Organizations gives one assistance to the members of the organizations you choose; Distribute Farmer Assistance gives it to chosen people.',
      'Choose the assistance type (Fertilizer, Seeds, Equipment, Cash Assistance, Training or Other), the source agencies, the quantity with its unit, the date and a description.',
      'Then choose who receives it and press Review Distribution. Check the list, then confirm.',
      'A distribution can be scheduled for a later date: it stays Pending until that date arrives.',
    ],
  },
  {
    id: 'disaster',
    title: 'Report a disaster',
    intro: 'Disaster > Crop Disaster and Fisheries Disaster keep the disaster logs.',
    screens: ['admin-disaster', 'admin-log-fisheries-disaster', 'admin-fisheries-disaster-form'],
    steps: [
      'Open Disaster > Crop Disaster. The table lists the farmers who have disaster logs. Filters include the date it occurred (From and To).',
      'Print Report and Download Report give the table as a report. The Actions menu of a farmer gives that farmer\'s own report.',
      'Press Log Disaster to report one disaster on many parcels and crops at once: fill the event once, tick the parcels and crops that were hit and type the area affected of each.',
      'In Disaster > Fisheries Disaster, press Log Disaster. Step 1: search for the fisherfolk and click their name. Step 2: choose the stock or stocks that were hit, the date and the type of disaster, then add the volume lost, the equipment damaged, a description and photos.',
      'Press Log Disaster to save. The log of that fisherfolk opens so you can print or download it. To report another fisherfolk, start again.',
    ],
  },
  {
    id: 'reports',
    title: 'Print and download reports',
    intro: 'Reports has the official reports; most tables also have Print Report and Download Report buttons.',
    screens: ['admin-reports'],
    steps: [
      'Open Reports and choose a report.',
      'Set its filters and period, then Print, Preview PDF or Download.',
      'On the farmers, fisherfolk, organizations, crop and fisheries tables, set the filters first: Print Report and Download Report give exactly the rows the table shows.',
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    adminOnly: true,
    intro: 'The Admin menu holds the lists the forms use. Only an Admin can change them.',
    screens: ['admin-crop-settings'],
    steps: [
      'Crop Settings holds the crops (growth days, yield, planted as seed or tree), categories, seed sources, varieties, input types and equipment types. Fisheries Settings holds species, categories, feed types, diseases, fingerling sources, equipment types and fishing gear.',
      'To add an item press the button under the table, named after what it adds (Add Crop, Add Variety...). A new row opens at the top: fill it and press Save. The newest item is always first.',
      'Use Edit in a row\'s menu to change an item.',
      'Harvest Unit Settings sets how many kg one harvest unit weighs, so a harvest counted in sacks or cavans is saved in kg.',
    ],
  },
  {
    id: 'users',
    title: 'Manage user accounts and backups',
    adminOnly: true,
    intro: 'User Management creates and controls the accounts of staff, farmers, fisherfolk and organizations. Backup keeps a copy of the whole system.',
    screens: ['admin-users', 'admin-backup'],
    steps: [
      'Open Admin > User Management to create an account, reset a password or turn an account off.',
      'Open Admin > Backup and press Back up now to make one file with every record and uploaded file. It runs in the background and the list updates by itself.',
      'When it says Done, press Download and keep the file somewhere safe: it holds personal records and is not encrypted.',
      'The latest 14 backups are kept in the system. Delete removes one.',
    ],
  },
]

const PHONE_NOTE = 'There is nothing to install. Open the same web address in the browser of your phone and sign in; the screens fit the phone, and the menu moves to the bottom.'

// ── Farmer, Fisherfolk and Organization accounts
const FARMER_GUIDES = [
  {
    id: 'start', title: 'Getting started',
    intro: 'Sign in with the account the office gave you. Your Home shows your farm parcels, your crops and your harvests.',
    screens: ['login', 'farmer-home'],
    steps: [
      'Sign in with your username (or email) and password. The first time you are asked to choose a new password.',
      'Home shows how many farm parcels and active crops you have, your total area and your harvests this month, with charts of your crops, harvests and disasters.',
      'The menu opens Crop Monitoring, Forecasting, Disaster and Assistance. Your crops appear once the office registers them; if something is missing or wrong, tell the office.',
    ],
  },
  {
    id: 'profile', title: 'Your profile',
    intro: 'Your profile shows what the office has on record about you.',
    screens: ['farmer-profile'],
    steps: [
      'Open your name at the top right, then your profile.',
      'The icons beside each detail tell you how it can change: a pencil changes it at once, the arrows send a request that the office checks first, and a padlock means it cannot be changed here.',
      'Use the camera button on your picture to change your photo. Use Change Password, if you want a new password.',
    ],
  },
  {
    id: 'crops', title: 'Follow your crops',
    intro: 'Crop Monitoring lists your farm parcels and the crops on them, with their dates and status.',
    screens: ['farmer-crops'],
    steps: [
      'Open Crop Monitoring. Each row is one of your farm parcels.',
      'Press the arrow at the end of a row to see the crops planted on it, when each was planted and when it is expected to be harvested.',
      'Print Report and Download Report give your list as a printout or a PDF.',
    ],
  },
  {
    id: 'disaster', title: 'Report a disaster',
    intro: 'If a typhoon, flood, drought or pest hurts your crops, report it so the office knows.',
    screens: ['farmer-disaster'],
    steps: [
      'Open Disaster. Step 1: tick every crop that was hit. You fill in the disaster only once for all of them.',
      'Press Continue. Step 2: choose the type of disaster and the date, describe the damage and add photos of it.',
      'Send the report. The office is notified. Disaster history lists your earlier reports and whether each is Active or Recovered.',
    ],
  },
  {
    id: 'assistance', title: 'Assistance you received',
    intro: 'Assistance lists the help the office or its partners gave you.',
    screens: ['farmer-assistance'],
    steps: [
      'Open Assistance to see what was given to you, when, and by whom.',
      'When something is marked as given to you, confirm that you received it if you are asked to.',
    ],
  },
  {
    id: 'phone', title: 'Using the system on a phone',
    intro: 'The same account works on a phone. These pictures were taken at phone size.',
    phone: true,
    screens: ['login-phone', 'farmer-p-home', 'farmer-p-crops', 'farmer-p-disaster', 'farmer-p-assistance'],
    steps: [
      PHONE_NOTE,
      'The menu along the bottom has Home, Monitoring, Disaster, Forecasting and Assistance. Tap one to open it.',
      'The bell and your initials at the top open your notifications and your account (profile, Help, this manual and Sign out).',
      'Tables become cards on a phone. Tap a card to open it; use the search box to find one.',
      'To report a disaster in the field, open Disaster, tick the crops that were hit, and add photos with the phone camera.',
    ],
  },
]

const FISHERFOLK_GUIDES = [
  {
    id: 'start', title: 'Getting started',
    intro: 'Sign in with the account the office gave you. You land on your aquaculture records: your production cycles, ponds, cages and stocks.',
    screens: ['login', 'fisherfolk-stocks'],
    steps: [
      'Sign in with your username (or email) and password. The first time you are asked to choose a new password.',
      'On a larger screen you land on Aquaculture Monitoring. On a phone, Home shows a summary of your cycles first.',
      'The menu opens Home, Aquaculture Monitoring, Forecasting, Disaster and Assistance.',
    ],
  },
  {
    id: 'profile', title: 'Your profile',
    intro: 'Your profile shows what the office has on record about you.',
    screens: ['fisherfolk-profile'],
    steps: [
      'Open your name at the top right, then your profile.',
      'The icons beside each detail tell you how it can change: a pencil changes it at once, the arrows send a request that the office checks first, and a padlock means it cannot be changed here.',
      'Use the camera button on your picture to change your photo.',
    ],
  },
  {
    id: 'stocks', title: 'Your stocks, ponds and cages',
    intro: 'Aquaculture Monitoring lists your production cycles and stocks.',
    screens: ['fisherfolk-stocks'],
    steps: [
      'Open Aquaculture Monitoring. Each row is a stock: its species, where it is raised, the date stocked and the expected harvest.',
      'Press Start Production Cycle to begin a new cycle: choose the species and the pond or cage, the date stocked, the number of fingerlings and where they came from.',
      'Open the menu of a row to see its details, record activities or report a disaster.',
    ],
  },
  {
    id: 'disaster', title: 'Report a disaster',
    intro: 'Report a typhoon, flood, fish kill or other disaster that hurt your ponds or cages.',
    screens: ['fisherfolk-disaster'],
    steps: [
      'Open Disaster to see your reports and to log a new one.',
      'Choose the stocks that were hit and type the fingerlings lost for each pond or cage (or tick Total loss).',
      'Add the equipment damaged, a description and photos, then send the report. The office is notified.',
    ],
  },
  {
    id: 'assistance', title: 'Assistance you received',
    intro: 'Assistance lists the help given to you.',
    screens: ['fisherfolk-assistance'],
    steps: ['Open Assistance to see what was given to you, when, and by whom.'],
  },
  {
    id: 'phone', title: 'Using the system on a phone',
    intro: 'The same account works on a phone. These pictures were taken at phone size.',
    phone: true,
    screens: ['login-phone', 'fisherfolk-p-home', 'fisherfolk-p-stocks', 'fisherfolk-p-disaster', 'fisherfolk-p-assistance'],
    steps: [
      PHONE_NOTE,
      'The menu along the bottom has Home, Monitoring, Disaster, Forecasting and Assistance. Tap one to open it.',
      'Home shows your active cycles, ponds and cages, harvested cycles and open disasters.',
      'Tables become cards on a phone. Tap a card to open the stock.',
      'To report a disaster by the pond, open Disaster, choose the stocks that were hit, type the fingerlings lost and add photos with the phone camera.',
    ],
  },
]

const ORG_GUIDES = [
  {
    id: 'start', title: 'Getting started',
    intro: 'Sign in with the organization\'s account. The Home shows your organization at a glance.',
    screens: ['login', 'org-home'],
    steps: [
      'Sign in with the username and password the office gave your organization. The first time you are asked to choose a new password.',
      'The Home shows your organization, its members and recent assistance.',
      'The menu opens Home, My Organization and Assistance. Equipment is a tab inside My Organization.',
    ],
  },
  {
    id: 'organization', title: 'My Organization: members and officers',
    intro: 'My Organization shows your organization\'s members and officers.',
    screens: ['org-members', 'org-officers'],
    steps: [
      'Open My Organization. The tabs are Members, Equipment, Borrowed, Officers and Confirmed for Members.',
      'Members lists everyone in the organization. Add Member adds a registered farmer; Import Members adds many from a spreadsheet.',
      'Officers lists the president, secretary, treasurer and the other officers.',
      'To change the registration details of the organization, tell the office: Admin and Focal Person staff edit them.',
    ],
  },
  {
    id: 'equipment', title: 'Equipment',
    intro: 'The Equipment tab lists what the organization owns and who borrowed it.',
    screens: ['org-equipment'],
    steps: [
      'Open My Organization, then the Equipment tab. Each item shows its units, their condition and how many are on loan.',
      'Add Equipment adds an item; Import Equipment adds many from a spreadsheet.',
      'Only units in Good condition can be lent. Tap the item, choose Lend, pick the member, the number of units and an optional return-by date.',
      'Members with an account can also ask to borrow from their own Borrow Equipment page. Their requests appear on the Borrowed tab, where you approve or reject them.',
      'When the units come back, open the loan on the Borrowed tab, choose Mark returned and say what condition they are in.',
    ],
  },
  {
    id: 'assistance', title: 'Assistance',
    intro: 'Assistance lets the organization give assistance to its members and see what was given.',
    screens: ['org-assistance'],
    steps: [
      'Open Assistance to see what the organization has given out and received.',
      'Use Distribute to All Members to give the same assistance to the members you choose, in one step.',
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
      'In My Organization, swipe the tabs sideways to reach Members, Equipment, Borrowed and Officers.',
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

// The words before the guides: what the manual covers, how to read the pictures, and what to keep in mind about them.
export function manualIntro(audience, { systemTitle = 'OMAg Aringay' } = {}) {
  const label = AUDIENCES.find((a) => a.id === audience)?.label || ''
  const guides = manualFor(audience)
  const hasPhone = guides.some((g) => g.phone)
  return {
    lead: `This guide walks through the ${systemTitle} system screen by screen in annotated pictures, for the ${label} account. It is organized by the jobs you do in the system:`,
    contents: guides.map((g, i) => ({ n: i + 1, title: g.title, about: g.intro })),
    howToRead: 'Each picture has numbered orange boxes. The table under the picture explains each number: what that part of the screen is and what it does. The first time, work through the numbers in order. The numbered steps above a picture say what to do, in the order to do it.',
    notes: [
      'The names, crops, fisherfolk, organizations and amounts shown are sample data for illustration. They do not represent real farmers, fisherfolk or organizations.',
      'Counts, totals and charts on your system will differ from the pictures.',
      ...(hasPhone ? ['The pictures marked as a phone view were taken at phone size; the same screens fit larger screens too.'] : []),
      'A menu or button you do not see in a picture is not part of your account: each kind of account sees only its own screens.',
      'Every picture was captured from the October 2026 version of the system.',
    ],
  }
}

// Every picture a manual shows, for the test that checks the files exist.
export const allImages = () => AUDIENCES.flatMap(({ id }) => manualFor(id).flatMap((g) => g.screens.map((s) => s.image)))
