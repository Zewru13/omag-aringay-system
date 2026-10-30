// The screens of the User Manual: where to take each picture and what its numbered orange boxes point at.
//   id, audience (admin | focal | farmer | fisherfolk | org), role (the sample account), url, phone (390x844 instead of 1280x800), file (under public/manual/)
//   js: runs in the page after it loads (open a window, a tab, a menu); wait / after: milliseconds to let it settle
//   callouts: [{ find: { text | css, tag?, exact?, nth? }, label, desc, pad?, tag?: 'right' }]  The numbers follow this order and are the legend's numbers.
//   title / purpose: the heading and the one line under it in the manual.
const click = (text, tag = 'button') => `const b=[...document.querySelectorAll('${tag}')].find(x=>x.offsetParent&&x.textContent.trim()==='${text}'); if(b) b.click()`
const rowMenu = "const r=[...document.querySelectorAll('tbody tr')].filter(x=>x.offsetParent)[0]; const bs=[...r.querySelectorAll('button')]; bs[bs.length-1].click()"
const SIDEBAR = { css: 'aside' }
const SEARCH = { css: 'input[type=search]' }
const FILTERS = { text: 'Filters', tag: 'button', exact: true }
const PRINT = { text: 'Print Report', tag: 'button', exact: true }
const DOWNLOAD = { text: 'Download Report', tag: 'button', exact: true }
const TABLE = { css: 'table' }
const HEADER = { css: 'header' }

const A = (o) => ({ role: 'ADMIN', audience: 'admin', ...o })
const F = (o) => ({ role: 'EVALUATOR', audience: 'focal', ...o })
const FA = (o) => ({ role: 'CITIZEN:FARMER', audience: 'farmer', ...o })
const FI = (o) => ({ role: 'CITIZEN:FISHERFOLK', audience: 'fisherfolk', ...o })
const O = (o) => ({ role: 'CITIZEN:FARMERS_ORG', audience: 'org', ...o })
const phone = (o) => ({ phone: true, wait: 4000, ...o })

const NAV_BAR = (label, desc) => ({ find: { css: 'nav[aria-label], nav:last-of-type', nth: 0 }, label, desc })
const BELL = { find: { css: 'button[aria-label*="otification"]' }, label: 'Notifications bell', desc: 'Shows new notices, such as a disaster a farmer reported or an assistance that was given.' }
const ACCOUNT = { find: { text: 'Aringay', tag: 'header' }, label: 'Account menu', desc: 'Your name. Open it for your profile, Help, the User Manual and Sign out.' }

export const SCREENS = [
  // ───────────────────────────── Everyone: the sign-in page ─────────────────────────────
  { id: 'login', audience: 'all', anon: true, file: 'login.png', url: '/login', wait: 3500, title: 'Sign in', purpose: 'Every account signs in here.',
    callouts: [
      { find: { css: '#login-email' }, label: 'Email or username', desc: 'The username or email the office gave you.' },
      { find: { css: '#login-password' }, label: 'Password', desc: 'Your password. The first time you sign in you are asked to choose a new one.' },
      { find: { css: 'button[aria-label="Show password"]' }, label: 'Show password', desc: 'Shows or hides what you typed, to check it.' },
      { find: { text: 'Sign in', tag: 'button', exact: true }, label: 'Sign in', desc: 'Opens your account. It stays disabled until both boxes are filled.' },
      { find: { text: "Can't sign in?", tag: 'p' }, label: 'Help signing in', desc: 'There is no self-registration: the Office of the Municipal Agriculturist creates your account and resets a forgotten password.' },
    ] },
  { id: 'login-phone', audience: 'all', anon: true, phone: true, file: 'login-phone.png', url: '/login', wait: 3500, title: 'Sign in on a phone', purpose: 'The same page at phone size.',
    callouts: [
      { find: { css: '#login-email' }, label: 'Email or username', desc: 'The username or email the office gave you.' },
      { find: { css: '#login-password' }, label: 'Password', desc: 'Your password.' },
      { find: { text: 'Sign in', tag: 'button', exact: true }, label: 'Sign in', desc: 'Opens your account.' },
    ] },
  // ───────────────────────────── Admin (and Focal Person) ─────────────────────────────
  A({ id: 'admin-dashboard', file: 'admin/dashboard.png', url: '/dashboard', wait: 4500, title: 'Dashboard', purpose: 'The first screen after sign-in: the totals of the municipality at a glance.',
    callouts: [
      { find: SIDEBAR, label: 'Sidebar menu', desc: 'Links to every module: Registration, Organizations, Crop Management, Fisheries Management, Forecasting, Assistance, Disaster, Reports and the Admin menu.' },
      { find: { text: 'What needs attention today', tag: 'h1, h2, h3, p, div' }, label: 'Attention banner', desc: 'What needs the office\'s attention today, for the signed-in staff account.' },
      { find: { text: 'Crop Sector', tag: 'h2, h3, p, div, span' }, label: 'Crop Sector panel', desc: 'Totals and charts of crops: planted, near harvest, harvested and disasters.' },
      { find: { text: 'Fisheries Sector', tag: 'h2, h3, p, div, span' }, label: 'Fisheries Sector panel', desc: 'Totals and charts of production cycles, stocks and fisheries disasters.' },
    ] }),
  A({ id: 'admin-farmers', file: 'admin/farmers.png', url: '/farmers?tab=registry', title: 'Registration > Farmers', purpose: 'The list of every registered farmer.',
    callouts: [
      { find: SEARCH, label: 'Search box', desc: 'Find a farmer by name, RSBSA number or barangay.' },
      { find: FILTERS, label: 'Filters button', desc: 'Narrow the list by barangay, sex, farmer type, senior citizen, ICC/IP, PWD and the registered dates.' },
      { ...{ find: PRINT }, label: 'Print Report', desc: 'Prints the list exactly as filtered.' },
      { find: DOWNLOAD, label: 'Download Report', desc: 'Saves the same report as a PDF.' },
      { find: { text: 'Register Farmer', tag: 'button', exact: true }, label: 'Register Farmer', desc: 'Opens the form to register a new farmer.' },
    ] }),
  A({ id: 'admin-register-farmer', file: 'admin/register-farmer.png', url: '/farmers?tab=registry', js: click('Register Farmer'), after: 1800, title: 'Register Farmer form', purpose: 'Records a new farmer once, with their RSBSA number.',
    callouts: [
      { find: { text: 'Register Farmer', tag: 'h2, h1, h3' }, label: 'Form title', desc: 'The window that registers a farmer. Fields marked * are required.' },
      { find: { css: '#first_name' }, label: 'Name fields', desc: 'Prefix, first, last and middle name of the farmer.' },
      { find: { text: 'RSBSA', tag: 'label' }, label: 'RSBSA number', desc: 'The farmer\'s RSBSA number. It identifies the farmer in every list and report.' },
      { find: { text: 'Save Farmer & Add Farm Parcels', tag: 'button' }, label: 'Save and add parcels', desc: 'Saves the farmer and goes straight to the table to add their farm parcels and crops.' },
    ] }),
  A({ id: 'admin-organizations', file: 'admin/organizations.png', url: '/farmers?tab=organizations', title: 'Organizations > Farmers\' Organizations', purpose: 'Each organization with its members, officers and equipment.',
    callouts: [
      { find: SEARCH, label: 'Search box', desc: 'Find an organization by name or address.' },
      { find: { text: 'Import Organizations', tag: 'button' }, label: 'Import Organizations', desc: 'Registers many organizations from a spreadsheet, with a preview first.' },
      { find: { text: 'Add Organization', tag: 'button', exact: true }, label: 'Add Organization', desc: 'Opens the registration form, with members and equipment inside it.' },
      { find: TABLE, label: 'Organizations table', desc: 'One row per organization. The three-dot menu of a row has Edit organization, View organization profile and Add assistance.' },
    ] }),
  A({ id: 'admin-add-organization', file: 'admin/add-organization.png', url: '/farmers?tab=organizations', js: click('Add Organization'), after: 1800, title: 'Add New Organization form', purpose: 'Registers an organization together with its contact, members and equipment.',
    callouts: [
      { find: { text: 'Add New Organization', tag: 'h2, h1, h3' }, label: 'Form title', desc: 'Registers a new farmers\' organization (or a fisherfolk organization on the fisherfolk side).' },
      { find: { text: 'Organization Name', tag: 'label' }, label: 'Organization details', desc: 'Name, barangay, address, date organized and date registered, registration number and agency.' },
      { find: { text: 'Registration Number', tag: 'label' }, label: 'Registration number', desc: 'The registration number of the organization and the agency that registered it. Scroll down for the contact person (one full-name box), the members and the equipment.' },
      { find: { text: 'Add Organization', tag: 'button', last: true }, label: 'Add Organization', desc: 'Saves the organization with the members and equipment you added.' },
    ] }),
  A({ id: 'admin-add-members', file: 'admin/add-members.png', url: '/farmers?tab=organizations', js: `${click('Add Organization')}; await new Promise(r=>setTimeout(r,1200)); const m=[...document.querySelectorAll('button')].find(x=>x.offsetParent&&x.textContent.trim()==='Add Members'); m.scrollIntoView(); m.click()`, after: 2500, title: 'Add Members table', purpose: 'Chooses the registered farmers to add as members, with their positions.',
    callouts: [
      { find: { text: 'Add Members', tag: 'h2, h1, h3', exact: true }, label: 'Window title', desc: 'Lists only the registered farmers who are not members of this organization yet.' },
      { find: { css: 'input[type=search]', last: true }, label: 'Search box', desc: 'Find a farmer by name or RSBSA number.' },
      { find: { css: 'table input[type=checkbox]' }, label: 'Tick box', desc: 'Tick each farmer to add. A Position box then appears on that row.' },
      { find: { text: 'Position', tag: 'th' }, label: 'Position', desc: 'Choose Member or an officer position such as President, Secretary or Treasurer for each ticked farmer.' },
      { find: { text: 'Add selected', tag: 'button' }, label: 'Add selected', desc: 'Puts the ticked farmers on the organization\'s member list. They are saved when the organization is saved.' },
    ] }),
  A({ id: 'admin-crop-records', file: 'admin/crop-records.png', url: '/crop-records', js: "const b=[...document.querySelectorAll('button')].find(x=>/Show the crops/.test(x.getAttribute('aria-label')||'')&&x.offsetParent); b&&b.click()", after: 1200, title: 'Crop Management > Crop Records', purpose: 'Every farm parcel, with the crops planted on it.',
    callouts: [
      { find: SEARCH, label: 'Search box', desc: 'Find a parcel by farmer, RSBSA number or parcel number.' },
      { find: { text: 'Import Farm Parcels', tag: 'button' }, label: 'Import Farm Parcels', desc: 'Adds many parcels from a spreadsheet.' },
      { find: { text: 'Add Farm Parcel', tag: 'button', exact: true }, label: 'Add Farm Parcel', desc: 'Opens the table to add parcels for a farmer, with their crops.' },
      { find: { css: 'button[aria-label*="crops on"]', nth: 0 }, label: 'Parcel arrow', desc: 'Opens a parcel to show the crops planted on it.' },
    ] }),
  A({ id: 'admin-crop-monitoring', file: 'admin/crop-monitoring.png', url: '/crop-monitoring', title: 'Crop Management > Crop Monitoring', purpose: 'Follows every crop from planting to harvest.',
    callouts: [
      { find: SEARCH, label: 'Search box', desc: 'Find a crop by farmer, crop or organization.' },
      { find: FILTERS, label: 'Filters button', desc: 'Filter by status, barangay, farmer and the date planted.' },
      { find: PRINT, label: 'Print Report', desc: 'Prints the crops as filtered.' },
      { find: TABLE, label: 'Crops table', desc: 'One row per crop with its dates and status (Planted, Near Harvest, Harvested...).' },
    ] }),
  A({ id: 'admin-crop-menu', file: 'admin/crop-row-menu.png', url: '/crop-monitoring', js: rowMenu, after: 900, title: 'The menu of a crop', purpose: 'The actions of one crop.',
    callouts: [
      { find: { text: 'Record Activity', tag: 'button' }, label: 'Record Activity', desc: 'Logs work done on the crop: fertilizing, spraying, irrigation and so on.' },
      { find: { text: 'Record Harvest', tag: 'button' }, label: 'Record Harvest', desc: 'Opens once half of the crop\'s growing time has passed. Before that it says Not Yet Available.' },
      { find: { text: 'Force Harvest', tag: 'button', exact: true }, label: 'Force Harvest', desc: 'Harvests crops that are not ready yet because of something coming, such as a typhoon.' },
      { find: { text: 'Report Disaster', tag: 'button' }, label: 'Report Disaster', desc: 'Reports damage on this crop.' },
    ] }),
  A({ id: 'admin-force-harvest', file: 'admin/force-harvest.png', url: '/crop-monitoring', js: `${rowMenu}; await new Promise(r=>setTimeout(r,600)); ${click('Force Harvest')}`, after: 3000, title: 'Force Harvest window', purpose: 'Harvests several crops of one farmer early, for one reason.',
    callouts: [
      { find: { text: 'Harvested date', tag: 'label' }, label: 'Harvested date', desc: 'The day the crops were harvested.' },
      { find: { text: 'reason', tag: 'label' }, label: 'Reason', desc: 'Why the crops are harvested early: an upcoming typhoon, drought, El Niño, flood, a pest outbreak or another reason.' },
      { find: { text: 'Area harvested', tag: 'th' }, label: 'Area harvested', desc: 'The area actually harvested for each crop, in hectares.' },
      { find: { text: 'Qty / Unit', tag: 'th' }, label: 'Qty / Unit', desc: 'The quantity and the unit it was counted in (kg, sacks, cavan...). The kg it comes to shows under the box.' },
      { find: { text: 'Review Force Harvest', tag: 'button' }, label: 'Review Force Harvest', desc: 'Shows the tables to check and the total harvest before you confirm.' },
    ] }),
  A({ id: 'admin-distribute', file: 'admin/distribute.png', url: '/crop-assistance', js: click('Distribute to Organizations'), after: 2200, title: 'Distribute window', purpose: 'Gives one assistance to the members of several organizations.',
    callouts: [
      { find: { text: 'Assistance Type', tag: 'label' }, label: 'Assistance type', desc: 'Fertilizer, Seeds, Equipment, Cash Assistance, Training or Other.' },
      { find: { text: 'Source Agency', tag: 'label' }, label: 'Source agency', desc: 'The agencies that provided the assistance (you can choose several).' },
      { find: { text: 'Quantity per Recipient', tag: 'label' }, label: 'Quantity and unit', desc: 'The quantity each recipient gets, and its unit from the fixed list (kg, sack, bag, piece, bundle, box, liter, set).' },
      { find: { text: 'Distribution Date', tag: 'label' }, label: 'Distribution date', desc: 'Today or a later date. A later date schedules the distribution: it stays Pending until then.' },
      { find: { text: 'Review Distribution', tag: 'button' }, label: 'Review Distribution', desc: 'Goes to the review step, where you check who receives the assistance before confirming.' },
    ] }),
  A({ id: 'admin-disaster', file: 'admin/disaster.png', url: '/disaster?tab=farmer', title: 'Disaster > Crop Disaster', purpose: 'The disaster logs of farmers\' crops.',
    callouts: [
      { find: SEARCH, label: 'Search box', desc: 'Find a log by farmer, crop, disaster or reference number.' },
      { find: FILTERS, label: 'Filters button', desc: 'Barangay, type, status, year and the date it occurred (From and To).' },
      { find: PRINT, label: 'Print Report', desc: 'Prints the table as filtered.' },
      { find: { text: 'Log Disaster', tag: 'button', exact: true }, label: 'Log Disaster', desc: 'Reports one disaster on many parcels and crops at once.' },
      { find: { text: 'Actions', tag: 'span, th, div' }, label: 'Actions', desc: 'The menu of a farmer: View Report, Print Report and Download Report of that farmer\'s disasters.' },
    ] }),
  A({ id: 'admin-log-fisheries-disaster', file: 'admin/log-fisheries-disaster.png', url: '/disaster?tab=fisheries', js: click('Log Disaster'), after: 3000, title: 'Log Fisheries Disaster', purpose: 'Reports one disaster on the ponds and cages of one or many fisherfolk.',
    callouts: [
      { find: { text: 'Disaster details', tag: 'h3' }, label: 'Disaster details', desc: 'The disaster type, the date it occurred, a description of the damage and photos. Fill them once.' },
      { find: { text: 'Ponds and cages hit', tag: 'h3' }, label: 'Ponds and cages hit', desc: 'Open a fisherfolk, tick their stocks, and type the fingerlings lost for each pond or cage (or tick Total loss).' },
      { find: SEARCH, label: 'Search box', desc: 'Find a fisherfolk, species or location.' },
      { find: { text: 'Log Disaster', tag: 'button', exact: true }, label: 'Log Disaster', desc: 'Saves one disaster log for each fisherfolk, all together or none.' },
    ] }),
  A({ id: 'admin-reports', file: 'admin/reports.png', url: '/reports', title: 'Reports', purpose: 'The official reports, ready to print or download.',
    callouts: [
      { find: { text: 'Registered Farmers, Fisherfolk & Organizations', up: 2 }, label: 'A report', desc: 'Click a report card (or Open Report) to set its filters and period. Each opens a preview you can print or download as a PDF.' },
      { find: { text: 'Crop / Parcel Disaster Reports', up: 2 }, label: 'Disaster reports', desc: 'The disasters logged on crops and farm parcels, or on fisherfolk and their stocks, with the area or volume lost.' },
    ] }),
  A({ id: 'admin-crop-settings', file: 'admin/crop-settings.png', url: '/crop-settings', title: 'Admin > Crop Settings', purpose: 'The lists the forms use: crops, categories, varieties and more.',
    callouts: [
      { find: { css: '[role=tablist]' }, label: 'Settings tabs', desc: 'Crop Options, Categories, Seed Sources, Varieties, Input Types and Equipment Types.' },
      { find: SEARCH, label: 'Search box', desc: 'Find a crop by name or category.' },
      { find: TABLE, label: 'Table', desc: 'The newest item is always first. The menu of a row has Edit and Delete.' },
      { find: { text: 'Add Crop', tag: 'button', exact: true }, label: 'Add Crop', desc: 'A new row opens at the top of the table: fill it and press Save.' },
    ] }),
  A({ id: 'admin-users', file: 'admin/users.png', url: '/users', title: 'Admin > User Management', purpose: 'Creates and controls every account.',
    callouts: [
      { find: SEARCH, label: 'Search box', desc: 'Find an account by name, username or email.' },
      { find: TABLE, label: 'Accounts table', desc: 'Every account with its role and status. The row menu resets a password or turns the account on or off.' },
    ] }),
  A({ id: 'admin-backup', file: 'admin/backup.png', url: '/backup', title: 'Admin > Backup', purpose: 'Makes and downloads a copy of the whole system.',
    callouts: [
      { find: { text: 'Back up now', tag: 'button' }, label: 'Back up now', desc: 'Starts a backup in the background. The list updates by itself.' },
      { find: { text: 'Backups', tag: 'h2, h3, span, div', nth: 0 }, label: 'Backups list', desc: 'Each backup with its date, who made it, its size and status. The latest 14 are kept.' },
      { find: { text: 'Download', tag: 'button', exact: true }, label: 'Download', desc: 'Saves the backup file (a .zip) to your computer. Keep it somewhere safe.' },
      { find: { text: 'Delete', tag: 'button', exact: true }, label: 'Delete', desc: 'Removes a backup and its file.' },
    ] }),
  F({ id: 'focal-dashboard', file: 'focal/dashboard.png', url: '/dashboard', wait: 4500, title: 'Dashboard (Focal Person)', purpose: 'The Focal Person\'s first screen. The Admin menu is not shown.',
    callouts: [
      { find: SIDEBAR, label: 'Sidebar menu', desc: 'The modules a Focal Person can open. The Admin group (settings, users, backup) is only for the Admin.' },
      { find: { text: 'Crop Sector', tag: 'h2, h3, p, div, span' }, label: 'Crop Sector panel', desc: 'Totals and charts of crops.' },
      { find: { text: 'Fisheries Sector', tag: 'h2, h3, p, div, span' }, label: 'Fisheries Sector panel', desc: 'Totals and charts of production cycles and stocks.' },
    ] }),
  F({ id: 'focal-farmers', file: 'focal/farmers.png', url: '/farmers?tab=registry', title: 'Registration > Farmers (Focal Person)', purpose: 'A Focal Person registers and updates farmers like an Admin.',
    callouts: [
      { find: SEARCH, label: 'Search box', desc: 'Find a farmer.' },
      { find: FILTERS, label: 'Filters button', desc: 'Narrow the list.' },
      { find: { text: 'Register Farmer', tag: 'button', exact: true }, label: 'Register Farmer', desc: 'Registers a new farmer.' },
    ] }),

  // ───────────────────────────── Farmer ─────────────────────────────
  FA({ id: 'farmer-home', file: 'farmer/home.png', url: '/my-account', wait: 4500, title: 'Home (Farmer)', purpose: 'Your farm at a glance.',
    callouts: [
      { find: SIDEBAR, label: 'Menu', desc: 'Home, Crop Monitoring, Forecasting, Disaster and Assistance.' },
      { find: { text: 'Welcome', tag: 'h1, h2, p, div' }, label: 'Welcome banner', desc: 'Your name and the date.' },
      { find: { text: 'Farm parcels', tag: 'p, span, div', up: 1 }, label: 'Totals', desc: 'How many farm parcels and active crops you have, your total area and your harvests this month.' },
      { find: { text: 'My crops by stage', tag: 'h2, h3, p, div, span' }, label: 'Charts', desc: 'Your crops by stage, your harvests against the estimate and your disasters by type.' },
    ] }),
  FA({ id: 'farmer-profile', file: 'farmer/profile.png', url: '/my-profile', title: 'My Profile (Farmer)', purpose: 'What the office has on record about you.',
    callouts: [
      { find: { css: 'button[aria-label*="photo"], button[title*="photo"]' }, label: 'Change photo', desc: 'The camera button changes your profile photo.' },
      { find: { text: 'Instant Change', up: 2 }, label: 'Key to the icons', desc: 'The pencil changes a detail at once. The arrows send a request that the office approves. A padlock means it cannot be changed here.' },
      { find: { text: 'RSBSA NUMBER', up: 1 }, label: 'RSBSA number', desc: 'Locked. Contact the office to have it corrected.' },
      { find: { text: 'Personal Information', tag: 'h2, h3, p, div, span' }, label: 'Your details', desc: 'Your personal details as the office recorded them.' },
      { find: { text: 'Change Password', tag: 'p, h3, div, span', up: 2 }, label: 'Change Password', desc: 'Optional. Press Edit to set a new password.' },
    ] }),
  FA({ id: 'farmer-crops', file: 'farmer/crops.png', url: '/crop-monitoring', js: "const b=[...document.querySelectorAll('button')].find(x=>/crops on/.test(x.getAttribute('aria-label')||'')&&x.offsetParent); b&&b.click()", after: 1500, title: 'Crop Monitoring (Farmer)', purpose: 'Your crops with their dates and status.',
    callouts: [
      { find: SEARCH, label: 'Search box', desc: 'Find one of your crops.' },
      { find: FILTERS, label: 'Filters button', desc: 'Narrow the list by status or season.' },
      { find: PRINT, label: 'Print Report', desc: 'Prints your crops as they are listed.' },
      { find: { text: 'Ownership', tag: 'div, span, th', exact: true, up: 1 }, label: 'Your farm parcels', desc: 'Each farm parcel with the crops on it. Press the arrow at the end of a row to see each crop, when it was planted and when it is expected to be harvested.' },
    ] }),
  FA({ id: 'farmer-disaster', file: 'farmer/disaster.png', url: '/disaster', title: 'Disaster (Farmer)', purpose: 'The disasters you reported.',
    callouts: [
      { find: { text: 'Disaster history', tag: 'button' }, label: 'Disaster history', desc: 'The disasters you reported before and their status (Active or Recovered).' },
      { find: { text: 'Select all', tag: 'span, label, div', up: 1 }, label: 'Choose the crops', desc: 'Step 1: tick every crop that was hit. You fill in the disaster only once for all of them.' },
      { find: { text: 'Continue', tag: 'button', exact: true }, label: 'Continue', desc: 'Step 2: choose the type of disaster and the date, describe the damage and add photos, then send the report.' },
    ] }),
  FA({ id: 'farmer-assistance', file: 'farmer/assistance.png', url: '/crop-assistance', title: 'Assistance (Farmer)', purpose: 'The help given to you.',
    callouts: [
      { find: { css: 'main, [role=main]' }, label: 'Assistance list', desc: 'What was given to you, when it was given and by which agency. Confirm it when you are asked to.' },
    ] }),
  FA({ id: 'farmer-p-home', phone: true, file: 'farmer/phone-home.png', url: '/my-account', wait: 4500, title: 'Home on a phone (Farmer)', purpose: 'The same Home on a phone, with the menu along the bottom.',
    callouts: [
      { find: { text: 'Welcome', tag: 'h1, h2, p, div' }, label: 'Welcome banner', desc: 'Your name, the kind of account and the date.' },
      { find: { text: 'Farm parcels', tag: 'p, span, div', up: 1 }, label: 'Totals', desc: 'Parcels, active crops, total area and harvests this month.' },
      { find: { css: 'nav' , nth: 0 }, label: 'Bottom menu', desc: 'Home, Monitoring, Disaster, Forecasting and Assistance. Tap one to open it.' },
      { find: { css: 'header button, button[aria-label]', nth: 1 }, label: 'Bell and account', desc: 'Notifications and your account (profile, Help and Sign out).' },
    ] }),
  FA({ id: 'farmer-p-crops', phone: true, file: 'farmer/phone-crops.png', url: '/crop-monitoring', wait: 4000, title: 'Crop Monitoring on a phone (Farmer)', purpose: 'Your crops as cards.',
    callouts: [
      { find: { css: 'input[type=search]' }, label: 'Search box', desc: 'Find one of your crops.' },
      { find: { css: 'nav', nth: 0 }, label: 'Bottom menu', desc: 'Switch between Home, Monitoring, Disaster, Forecasting and Assistance.' },
    ] }),
  FA({ id: 'farmer-p-disaster', phone: true, file: 'farmer/phone-disaster.png', url: '/disaster', wait: 4000, title: 'Disaster on a phone (Farmer)', purpose: 'Report a disaster from the field.',
    callouts: [
      { find: { text: 'Select all', tag: 'span, label, div', up: 1 }, label: 'Choose the crops', desc: 'Step 1: tick every crop that was hit.' },
      { find: { text: 'Continue', tag: 'button', exact: true }, label: 'Continue', desc: 'Step 2: choose the disaster and the date, then add photos taken with the phone camera.' },
      { find: { css: 'nav', nth: 0 }, label: 'Bottom menu', desc: 'Home, Monitoring, Disaster, Forecasting and Assistance.' },
    ] }),
  FA({ id: 'farmer-p-assistance', phone: true, file: 'farmer/phone-assistance.png', url: '/crop-assistance', wait: 4000, title: 'Assistance on a phone (Farmer)', purpose: 'The help given to you.',
    callouts: [
      { find: { css: 'nav', nth: 0 }, label: 'Bottom menu', desc: 'Home, Monitoring, Disaster, Forecasting and Assistance.' },
    ] }),

  // ───────────────────────────── Fisherfolk ─────────────────────────────
  FI({ id: 'fisherfolk-profile', file: 'fisherfolk/profile.png', url: '/my-profile', title: 'My Profile (Fisherfolk)', purpose: 'What the office has on record about you.',
    callouts: [
      { find: { css: 'button[aria-label*="photo"], button[title*="photo"]' }, label: 'Change photo', desc: 'The camera button changes your profile photo.' },
      { find: { text: 'Instant Change', up: 2 }, label: 'Key to the icons', desc: 'The pencil changes a detail at once. The arrows send a request that the office approves. A padlock means it cannot be changed here.' },
      { find: { text: 'Personal Information', tag: 'h2, h3, p, div, span' }, label: 'Your details', desc: 'Your personal details as the office recorded them.' },
      { find: { text: 'Change Password', tag: 'p, h3, div, span', up: 2 }, label: 'Change Password', desc: 'Optional. Press Edit to set a new password.' },
    ] }),
  FI({ id: 'fisherfolk-stocks', file: 'fisherfolk/stocks.png', url: '/fisheries-monitoring', title: 'Aquaculture Monitoring (Fisherfolk)', purpose: 'Your production cycles, ponds, cages and stocks.',
    callouts: [
      { find: SIDEBAR, label: 'Menu', desc: 'Home, Aquaculture Monitoring, Forecasting, Disaster and Assistance.' },
      { find: { text: 'Start Production Cycle', tag: 'button' }, label: 'Start Production Cycle', desc: 'Starts a new cycle: choose the species and where it is raised, the date stocked, the number of fingerlings and where they came from.' },
      { find: TABLE, label: 'Your stocks', desc: 'Each stock with its species, pond or cage, date stocked and expected harvest. The row menu opens its details.' },
    ] }),
  FI({ id: 'fisherfolk-disaster', file: 'fisherfolk/disaster.png', url: '/disaster', title: 'Disaster (Fisherfolk)', purpose: 'The disasters you reported on your ponds and cages.',
    callouts: [
      { find: { text: 'Log Disaster', tag: 'button' }, label: 'Log Disaster', desc: 'Reports a disaster: choose the stocks hit, type the fingerlings lost for each pond or cage (or tick Total loss), add the equipment damaged, a description and photos.' },
      { find: { css: 'main, [role=main]' }, label: 'Your reports', desc: 'Your reports and whether each is Active or Recovered.' },
    ] }),
  FI({ id: 'fisherfolk-assistance', file: 'fisherfolk/assistance.png', url: '/fisheries-assistance', title: 'Assistance (Fisherfolk)', purpose: 'The help given to you.',
    callouts: [
      { find: { css: 'main, [role=main]' }, label: 'Assistance list', desc: 'What was given to you, when, and by which agency.' },
    ] }),
  FI({ id: 'fisherfolk-p-home', phone: true, file: 'fisherfolk/phone-home.png', url: '/my-account', wait: 4500, title: 'Home on a phone (Fisherfolk)', purpose: 'Your ponds, cages and cycles at a glance, with the menu along the bottom.',
    callouts: [
      { find: { text: 'Welcome', tag: 'h1, h2, p, div' }, label: 'Welcome banner', desc: 'Your name, the kind of account and the date.' },
      { find: { text: 'Active cycles', tag: 'p, span, div' }, label: 'Totals', desc: 'Active cycles, ponds and cages, harvested cycles and open disasters.' },
      { find: { text: 'My cycles by stage', tag: 'h2, h3, p, div, span' }, label: 'Cycles by stage', desc: 'How many of your cycles are growing, near harvest or harvested.' },
      { find: { css: 'nav', nth: 0 }, label: 'Bottom menu', desc: 'Home, Monitoring, Disaster, Forecasting and Assistance.' },
    ] }),
  FI({ id: 'fisherfolk-p-stocks', phone: true, file: 'fisherfolk/phone-stocks.png', url: '/fisheries-monitoring', wait: 4000, title: 'Monitoring on a phone (Fisherfolk)', purpose: 'Your stocks as cards.',
    callouts: [
      { find: { text: 'Start Production Cycle', tag: 'button' }, label: 'Start Production Cycle', desc: 'Starts a new cycle from the phone.' },
      { find: { text: 'Tilapia', tag: 'h3, p, div, span', up: 3 }, label: 'A stock', desc: 'Tap a stock to open its details: pond or cage, dates, fingerlings and the harvest.' },
      { find: { css: 'nav', nth: 0 }, label: 'Bottom menu', desc: 'Switch between the parts of your account.' },
    ] }),
  FI({ id: 'fisherfolk-p-disaster', phone: true, file: 'fisherfolk/phone-disaster.png', url: '/disaster', wait: 4000, title: 'Disaster on a phone (Fisherfolk)', purpose: 'Report a disaster from the pond side.',
    callouts: [
      { find: { text: 'Log Disaster', tag: 'button' }, label: 'Log Disaster', desc: 'Starts a report with the stocks hit, the fingerlings lost and photos from the phone camera.' },
      { find: { css: 'nav', nth: 0 }, label: 'Bottom menu', desc: 'Switch between the parts of your account.' },
    ] }),
  FI({ id: 'fisherfolk-p-assistance', phone: true, file: 'fisherfolk/phone-assistance.png', url: '/fisheries-assistance', wait: 4000, title: 'Assistance on a phone (Fisherfolk)', purpose: 'The help given to you.',
    callouts: [
      { find: { css: 'nav', nth: 0 }, label: 'Bottom menu', desc: 'Switch between the parts of your account.' },
    ] }),

  // ───────────────────────────── Organization ─────────────────────────────
  O({ id: 'org-home', file: 'org/home.png', url: '/my-account', wait: 4500, title: 'Home (Organization)', purpose: 'Your organization at a glance.',
    callouts: [
      { find: SIDEBAR, label: 'Menu', desc: 'Home, My Organization and Assistance.' },
      { find: { css: 'main, [role=main]' }, label: 'Home panels', desc: 'Your organization, its members and the latest assistance.' },
    ] }),
  O({ id: 'org-members', file: 'org/my-organization.png', url: '/my-organization', title: 'My Organization: Members', purpose: 'The members of your organization.',
    callouts: [
      { find: { text: 'Members', tag: 'button', exact: true }, label: 'Tabs', desc: 'Members, Equipment, Borrowed, Officers and Confirmed for Members. Equipment is a tab here, not a separate page.' },
      { find: { text: 'Import Members', tag: 'button' }, label: 'Import Members', desc: 'Adds members from a spreadsheet.' },
      { find: { text: 'Add Member', tag: 'button', exact: true }, label: 'Add Member', desc: 'Adds one registered farmer to the organization.' },
      { find: SEARCH, label: 'Search box', desc: 'Find a member by name.' },
    ] }),
  O({ id: 'org-equipment', file: 'org/equipment.png', url: '/my-organization', js: click('Equipment'), after: 1800, title: 'My Organization: Equipment', purpose: 'What the organization owns and who borrowed it.',
    callouts: [
      { find: { text: 'Equipment', tag: 'button', exact: true }, label: 'Equipment tab', desc: 'Equipment is a tab of My Organization. It lists each item with its units, its condition and how many are on loan.' },
      { find: { text: 'Import Equipment', tag: 'button' }, label: 'Import Equipment', desc: 'Adds many items from a spreadsheet.' },
      { find: { text: 'Add Equipment', tag: 'button', exact: true }, label: 'Add Equipment', desc: 'Adds one item: its type, number of units and condition.' },
      { find: { text: 'Hand Tractor', tag: 'p, div, span, h3', up: 2 }, label: 'An item', desc: 'Click an item to open it, lend it to a member, or change its condition.' },
      { find: { text: 'Borrowed', tag: 'button' }, label: 'Borrowed tab', desc: 'What is still out, one row per person. Use Mark returned when an item comes back.' },
    ] }),
  O({ id: 'org-officers', file: 'org/officers.png', url: '/my-organization', js: click('Officers'), after: 1800, title: 'My Organization: Officers', purpose: 'The officers of the organization and their positions.',
    callouts: [
      { find: { text: 'Officers', tag: 'button', exact: true }, label: 'Officers tab', desc: 'The president, secretary, treasurer and the other officers.' },
    ] }),
  O({ id: 'org-assistance', file: 'org/assistance.png', url: '/crop-assistance', title: 'Assistance (Organization)', purpose: 'Gives assistance to your members and shows what was given.',
    callouts: [
      { find: { text: 'Distribute to All Members', tag: 'button' }, label: 'Distribute to All Members', desc: 'Gives the same assistance to the members you choose, in one step.' },
      { find: { css: 'main, [role=main]' }, label: 'Assistance list', desc: 'What the organization gave and received.' },
    ] }),
  O({ id: 'org-p-home', phone: true, file: 'org/phone-home.png', url: '/my-account', wait: 4500, title: 'Home on a phone (Organization)', purpose: 'Your organization on a phone.',
    callouts: [
      { find: { css: 'nav', nth: 0 }, label: 'Bottom menu', desc: 'Home, Organization and Assistance.' },
      { find: { css: 'header' }, label: 'Top bar', desc: 'The system name, notifications and your account.' },
    ] }),
  O({ id: 'org-p-members', phone: true, file: 'org/phone-members.png', url: '/my-organization', wait: 4000, title: 'My Organization on a phone', purpose: 'Members, equipment, borrowed items and officers from the phone.',
    callouts: [
      { find: { text: 'Members', tag: 'button', exact: true }, label: 'Tabs', desc: 'Members, Equipment, Borrowed and Officers. Swipe the tabs sideways to see them all.' },
      { find: { text: 'Add Member', tag: 'button' }, label: 'Add Member', desc: 'Adds a registered farmer to the organization.' },
      { find: { css: 'input[type=search]' }, label: 'Search box', desc: 'Find a member by name.' },
      { find: { css: 'nav', nth: 0 }, label: 'Bottom menu', desc: 'Home, Organization and Assistance.' },
    ] }),
  O({ id: 'org-p-assistance', phone: true, file: 'org/phone-assistance.png', url: '/crop-assistance', wait: 4000, title: 'Assistance on a phone (Organization)', purpose: 'Give assistance to your members from the phone.',
    callouts: [
      { find: { text: 'Distribute', tag: 'button' }, label: 'Distribute to members', desc: 'Gives the same assistance to the members you choose.' },
      { find: { css: 'nav', nth: 0 }, label: 'Bottom menu', desc: 'Home, Organization and Assistance.' },
    ] }),
]
