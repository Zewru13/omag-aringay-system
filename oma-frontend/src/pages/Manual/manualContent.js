// The User Manual: step-by-step guides with screenshots, one set for each kind of account. Plain data, so it can be tested without a screen:
// every image named here must exist under public/manual/ (tests/manualContent.test.mjs checks that), and manualFor(audience) is what a page shows.
//   audience: 'admin' | 'focal' | 'farmer' | 'fisherfolk' | 'org'
// The screenshots were taken at 1280 x 800 on sample data (names and figures in them are not real people). A Focal Person sees the Admin screenshots
// except the Dashboard and the farmers list, which have a screenshot of their own (the sidebar differs).

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

const img = (file, caption) => ({ file: `/manual/${file}`, caption })

// ── Staff guides (Admin and Focal Person share them; `adminOnly` ones are left out for a Focal Person)
const STAFF_GUIDES = (dir) => [
  {
    id: 'start',
    title: 'Getting started',
    intro: 'Sign in with the account the office gave you. The Dashboard is the first screen: it shows the totals of the municipality and charts of crops, fisheries and disasters.',
    steps: [
      { text: 'Open the system in your browser and sign in with your username and password. The first time, you are asked to choose a new password.' },
      { text: 'The sidebar on the left lists everything you can open: Registration, Organizations, Crop Management, Fisheries Management, Forecasting, Assistance, Disaster and Reports. Press the three-line button at the top to hide or show it.', image: img(`${dir}/dashboard.png`, 'The Dashboard and the sidebar') },
      { text: 'Your name at the top right opens your account and Sign out. The bell shows notifications, such as a disaster a farmer reported.' },
    ],
  },
  {
    id: 'register-farmer',
    title: 'Register a farmer or fisherfolk',
    intro: 'Registration > Farmers (or Fisherfolk) is the list of everyone registered. Each person is registered once, with their RSBSA number.',
    steps: [
      { text: 'Open Registration > Farmers. Use the search box and Filters (barangay, sex, registered dates...) to find people. Print Report and Download Report give the list as filtered.', image: img(`${dir}/farmers.png`, 'The farmers list') },
      { text: 'Press Register Farmer and fill in the personal details, the address and the RSBSA number. Fields marked * are required.', image: img(`admin/register-farmer.png`, 'The Register Farmer form') },
      { text: 'To add the farm parcels and crops at the same time, press Save Farmer & Add Farm Parcels: you go to a table where each row is a parcel, then come back to the farmer\'s profile.' },
      { text: 'Fisherfolk are registered the same way under Registration > Fisherfolk (with their fisherfolk type).' },
    ],
  },
  {
    id: 'organization',
    title: 'Register an organization and add its members',
    intro: 'Organizations > Farmers\' Organizations (or Fisherfolk Organizations) holds each organization with its members, officers and equipment.',
    steps: [
      { text: 'Open Organizations. The ⋮ menu of a row has Edit organization, View organization profile and Add assistance (it opens the assistance page with that organization already chosen).', image: img(`admin/organizations.png`, 'The organizations list') },
      { text: 'Press Add Organization. Fill in the name, barangay, dates, registration number and agency, the email, the contact person (one full-name box) and the contact number.', image: img(`admin/add-organization.png`, 'The Add New Organization form') },
      { text: 'In the Members section press Add Members. A table lists the registered farmers who are not members yet: search, tick the people and choose each one\'s position (Member or an officer position), then press Add selected. You can also attach a members file with Import members.', image: img(`admin/add-members.png`, 'Choosing the members to add') },
      { text: 'Equipment can be added line by line, or attached as a file with Import equipment. When you press Add Organization the members are added, and any attached file opens in its Import window so you can check it first.' },
      { text: 'The same Members section is in the Edit Organization form, to add more members later.' },
    ],
  },
  {
    id: 'parcels',
    title: 'Add farm parcels and crops',
    intro: 'Crop Management > Crop Records lists every parcel; open a parcel to see the crops planted on it.',
    steps: [
      { text: 'Open Crop Management > Crop Records. Press the arrow of a parcel to see its crops. Add Farm Parcel adds a parcel for a farmer; the parcel\'s ⋮ menu has Add crops, Edit parcel, Print report and more.', image: img(`admin/crop-records.png`, 'Crop Records with a parcel opened') },
      { text: 'A parcel needs its number, barangay, area, land ownership and classification. A crop needs the crop, the variety, the date planted, the area planted and where its seeds came from. A crop cannot be larger than its parcel.' },
      { text: 'Print Report and Download Report above the table give the records as filtered (use Filters first).' },
    ],
  },
  {
    id: 'harvest',
    title: 'Monitor crops, record a harvest or force a harvest',
    intro: 'Crop Management > Crop Monitoring follows each crop from planting to harvest.',
    steps: [
      { text: 'Open Crop Monitoring. The table shows each crop with its dates and status. Use Filters for status, barangay, farmer and the date planted.', image: img(`admin/crop-monitoring.png`, 'Crop Monitoring') },
      { text: 'The ⋮ menu of a row has Record Activity, View Crop Details, Record Harvest, Force Harvest and Report Disaster.', image: img(`admin/crop-row-menu.png`, 'The menu of a crop') },
      { text: 'Record Harvest opens once half of the crop\'s growing time has passed (from the planting date to the expected harvest date). Before that it shows "Not Yet Available". A harvest more than 7 days after the expected date asks for a reason.' },
      { text: 'Force Harvest is for crops that are not ready yet but must be harvested because of something coming, such as a typhoon. Choose the date and the reason, tick the crops, type each one\'s area and its quantity in the Qty / Unit box, choosing the unit it was counted in. The kg it comes to shows under the box. Press Review Force Harvest, check the tables, then Confirm.', image: img(`admin/force-harvest.png`, 'The Force Harvest window') },
    ],
  },
  {
    id: 'assistance',
    title: 'Give assistance',
    intro: 'Assistance > Crop Assistance (or Fisheries Assistance) records help given to farmers, fisherfolk and organizations.',
    steps: [
      { text: 'Open Assistance. Distribute to Organizations gives one assistance to the members of the organizations you choose; Distribute Farmer Assistance gives it to chosen people.', image: img(`admin/distribute.png`, 'The Distribute window') },
      { text: 'Choose the assistance type (Fertilizer, Seeds, Equipment, Cash Assistance, Training or Other), the source agencies, the quantity with its unit, the date and a description. Then choose who receives it and press Review Distribution before confirming.' },
      { text: 'A distribution can be scheduled for a later date: it stays Pending until that date arrives.' },
    ],
  },
  {
    id: 'disaster',
    title: 'Report a disaster',
    intro: 'Disaster > Crop Disaster and Fisheries Disaster keep the disaster logs.',
    steps: [
      { text: 'Open Disaster > Crop Disaster. The table lists the farmers who have disaster logs; open a farmer to see each log. Filters include the date it occurred. Print Report and Download Report give the table as a report, and the ⋮ menu of a farmer gives that farmer\'s report.', image: img(`admin/disaster.png`, 'Crop Disaster') },
      { text: 'Press Log Disaster to report one disaster on many parcels and crops at once: fill the event once, tick the parcels and crops that were hit and type the area affected of each.' },
      { text: 'In Disaster > Fisheries Disaster, Log Disaster works the same way for fisherfolk: fill the event once, open each fisherfolk, tick their stocks, and type the fingerlings lost of each pond or cage. One log is saved for each fisherfolk.', image: img(`admin/log-fisheries-disaster.png`, 'Logging a fisheries disaster for many fisherfolk') },
    ],
  },
  {
    id: 'reports',
    title: 'Print and download reports',
    intro: 'Reports has the official reports; most tables also have Print Report and Download Report buttons.',
    steps: [
      { text: 'Open Reports, choose the report, set its filters and period, then Print, Preview PDF or Download Excel.', image: img(`admin/reports.png`, 'The Reports page') },
      { text: 'On the farmers, fisherfolk, organizations, crop and fisheries tables, set the filters first: Print Report and Download Report give exactly the rows the table shows.' },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    adminOnly: true,
    intro: 'The Admin menu holds the lists the forms use. Only an Admin can change them.',
    steps: [
      { text: 'Crop Settings holds the crops (growth days, yield, planted as seed or tree), categories, seed sources, varieties, input types and equipment types. Fisheries Settings holds species, categories, feed types, diseases, fingerling sources, equipment types and fishing gear.', image: img(`admin/crop-settings.png`, 'Crop Settings') },
      { text: 'To add an item press the button under the table, named after what it adds (Add Crop, Add Variety...). A new row opens at the top: fill it and press Save. The newest item is always first. Use Edit in a row\'s menu to change an item.' },
      { text: 'Harvest Unit Settings sets how many kg one harvest unit weighs, so a harvest counted in sacks or cavans is saved in kg.' },
    ],
  },
  {
    id: 'users',
    title: 'Manage user accounts and backups',
    adminOnly: true,
    intro: 'User Management creates and controls the accounts of staff, farmers, fisherfolk and organizations. Backup keeps a copy of the whole system.',
    steps: [
      { text: 'Open Admin > User Management to create an account, reset a password or turn an account off.', image: img(`admin/users.png`, 'User Management') },
      { text: 'Open Admin > Backup and press Back up now to make one file with every record and uploaded file. It runs in the background and the list updates by itself; when it says Done, press Download and keep the file somewhere safe (it holds personal records and is not encrypted). The latest 14 backups are kept in the system, and Delete removes one.', image: img('admin/backup.png', 'The Backup page') },
    ],
  },
]

// ── Farmer, Fisherfolk and Organization accounts
const FARMER_GUIDES = [
  {
    id: 'start', title: 'Getting started',
    intro: 'Sign in with the account the office gave you. Your Home shows your farm parcels, your crops and your harvests.',
    steps: [
      { text: 'Sign in with your username and password. The first time you are asked to choose a new password.' },
      { text: 'Home shows how many farm parcels and active crops you have, your total area and your harvests this month, with charts of your crops. The menu on the left opens Crop Monitoring, Forecasting, Disaster and Assistance.', image: img('farmer/home.png', 'The Farmer Home') },
      { text: 'Your crops appear once the office registers them. If something is missing or wrong, tell the office.' },
    ],
  },
  {
    id: 'profile', title: 'Your profile',
    intro: 'Your profile shows what the office has on record about you.',
    steps: [
      { text: 'Open your name at the top right, then your profile. You can see your personal details, address and farm information.', image: img('farmer/profile.png', 'My Profile') },
      { text: 'To change a detail that is locked, use Request a Change: the office checks it before it is updated. Use the camera button to change your photo.' },
    ],
  },
  {
    id: 'crops', title: 'Follow your crops',
    intro: 'Crop Monitoring lists your crops with their dates and status.',
    steps: [
      { text: 'Open Crop Monitoring to see each crop, when it was planted and when it is expected to be harvested.', image: img('farmer/crops.png', 'Crop Monitoring') },
      { text: 'Open the ⋮ menu of a crop to record what you did in the field (Record Activity) or to view its details.' },
    ],
  },
  {
    id: 'disaster', title: 'Report a disaster',
    intro: 'If a typhoon, flood, drought or pest hurts your crops, report it so the office knows.',
    steps: [
      { text: 'Open Disaster. Your earlier reports are listed here.', image: img('farmer/disaster.png', 'Disaster') },
      { text: 'Press Log Disaster, choose the crops that were hit, the type of disaster and the date, add a description and photos of the damage, and press save. The office is notified.' },
    ],
  },
  {
    id: 'assistance', title: 'Assistance you received',
    intro: 'Assistance lists the help the office or its partners gave you.',
    steps: [
      { text: 'Open Assistance to see what was given to you, when, and by whom.', image: img('farmer/assistance.png', 'Assistance') },
      { text: 'When something is marked as given to you, confirm that you received it if you are asked to.' },
    ],
  },
  {
    id: 'help', title: 'Help',
    intro: 'The Help screen answers common questions and shows how to reach the office.',
    steps: [{ text: 'Open Help from your profile menu.', image: img('farmer/help.png', 'Help') }],
  },
]

const FISHERFOLK_GUIDES = [
  {
    id: 'start', title: 'Getting started',
    intro: 'Sign in with the account the office gave you. Your Home shows your ponds, cages and stocks.',
    steps: [
      { text: 'Sign in with your username and password. The first time you are asked to choose a new password.' },
      { text: 'On a larger screen your Home takes you to your aquaculture records; on a phone it shows a summary with shortcuts.', image: img('fisherfolk/home.png', 'The Fisherfolk Home') },
    ],
  },
  {
    id: 'profile', title: 'Your profile',
    intro: 'Your profile shows what the office has on record about you.',
    steps: [
      { text: 'Open your name at the top right, then your profile.', image: img('fisherfolk/profile.png', 'My Profile') },
      { text: 'To change a locked detail use Request a Change: the office checks it first.' },
    ],
  },
  {
    id: 'stocks', title: 'Your stocks, ponds and cages',
    intro: 'Aquaculture Monitoring lists your production cycles and stocks.',
    steps: [
      { text: 'Open the monitoring page to see each stock with its species, pond or cage, date stocked and expected harvest.', image: img('fisherfolk/stocks.png', 'Aquaculture Monitoring') },
      { text: 'Open the ⋮ menu of a row to see its details, record activities or report a disaster.' },
    ],
  },
  {
    id: 'disaster', title: 'Report a disaster',
    intro: 'Report a typhoon, flood, fish kill or other disaster that hurt your ponds or cages.',
    steps: [
      { text: 'Open Disaster to see your reports.', image: img('fisherfolk/disaster.png', 'Disaster') },
      { text: 'Press Log Disaster, choose the stocks that were hit, type the fingerlings lost for each pond or cage (or tick Total loss), add the equipment damaged, a description and photos, then save. The office is notified.' },
    ],
  },
  {
    id: 'assistance', title: 'Assistance you received',
    intro: 'Assistance lists the help given to you.',
    steps: [{ text: 'Open Assistance to see what was given to you, when, and by whom.', image: img('fisherfolk/assistance.png', 'Assistance') }],
  },
]

const ORG_GUIDES = [
  {
    id: 'start', title: 'Getting started',
    intro: 'Sign in with the organization\'s account. The Home shows your organization at a glance.',
    steps: [
      { text: 'Sign in with the username and password the office gave your organization. The first time you are asked to choose a new password.' },
      { text: 'The Home shows your organization, its members and recent assistance. The menu opens My Organization, Equipment and Assistance.', image: img('org/home.png', 'The Organization Home') },
    ],
  },
  {
    id: 'organization', title: 'My Organization',
    intro: 'My Organization shows your organization\'s details, its members and officers.',
    steps: [
      { text: 'Open My Organization to see the registration details, the members with their positions and the dates they joined.', image: img('org/my-organization.png', 'My Organization') },
      { text: 'To change a detail, tell the office: Admin and Focal Person staff edit the organization and its members.' },
    ],
  },
  {
    id: 'equipment', title: 'Equipment',
    intro: 'Equipment lists what the organization owns and who borrowed it.',
    steps: [
      { text: 'Open Equipment to see each item, how many units and their condition.', image: img('org/equipment.png', 'Equipment') },
      { text: 'Use Lend equipment to record who borrowed an item, then Mark returned when it comes back. Members with an account can also request equipment from their own page; the organization approves or rejects the request.' },
    ],
  },
  {
    id: 'assistance', title: 'Assistance',
    intro: 'Assistance lets the organization give assistance to its members and see what was given.',
    steps: [
      { text: 'Open Assistance to see what the organization has given out and received.', image: img('org/assistance.png', 'Assistance') },
      { text: 'Use Distribute to All Members to give the same assistance to the members you choose, in one step.' },
    ],
  },
  {
    id: 'help', title: 'Help',
    intro: 'The Help screen answers common questions and shows how to reach the office.',
    steps: [{ text: 'Open Help from your profile menu.', image: img('org/help.png', 'Help') }],
  },
]

export function manualFor(audience) {
  if (audience === 'admin') return STAFF_GUIDES('admin')
  if (audience === 'focal') return STAFF_GUIDES('focal').filter((g) => !g.adminOnly)
  if (audience === 'farmer') return FARMER_GUIDES
  if (audience === 'fisherfolk') return FISHERFOLK_GUIDES
  if (audience === 'org') return ORG_GUIDES
  return []
}

// Every image a manual shows, for the test that checks the files exist.
export const allImages = () => AUDIENCES.flatMap(({ id }) => manualFor(id).flatMap((g) => g.steps.map((s) => s.image?.file).filter(Boolean)))
