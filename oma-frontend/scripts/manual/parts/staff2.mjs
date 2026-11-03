// Staff screens, part 2: Fisherfolk registration and Organizations.
import { A, click, clickIncl, wait, rowMenu, SEARCH, FILTERS, PRINT, DOWNLOAD, COLS, ROW1, PAGER, PAGER_ROW, FILTERS_ROW, PRINT_ROW, DOWNLOAD_ROW, SEARCH_ROW } from './common.mjs'

const H = '[class*="rounded-xl"]'
const field = (label, tag = 'label') => ({ text: label, tag, up: 1 })
const orgMenu = `${rowMenu}; ${wait(700)}`

const ORG_FORM_FIELDS = (kind) => [
  { find: { text: 'Organization Name', tag: 'label', up: 1 }, label: 'Organization Name', desc: 'Required. The name as registered with the agency.' },
  { find: [field('Barangay'), field('Street Address')], label: 'Barangay and Street Address', desc: 'The barangay is required (choose from the list). The street address is optional (for example Purok 3, San Antonio St.).' },
  { find: [field('Date Organized'), field('Date Registered')], label: 'Date Organized and Date Registered', desc: 'Both required: when the group was organized, and when it was registered with the agency. They cannot be in the future.' },
  { find: [field('Registration Number'), field('Registration Agency')], label: 'Registration Number and Agency', desc: `Required. The registration number in the agency's format (for example CN200626622: CN = prefix, 2006 = year, 26622 = unique number) and the agency that registered the group (SEC, CDA and the others in the list).` },
  { find: [field('Email Address'), field('Contact Number'), field('Contact Person Full Name')], label: 'Email, contact person and number', desc: 'Required. One box for the full name of the contact person, then the organization\'s email and a mobile number (09XXXXXXXXX). The report papers use them.' },
  { find: { text: 'EQUIPMENT', tag: 'h3', up: 1 }, label: 'Equipment', desc: `Add equipment adds a line: choose the kind of ${kind === 'farmers' ? 'farm equipment' : 'fishing equipment'} (or Other), how many units, and optionally the date acquired and remarks. Import equipment attaches a spreadsheet instead (Download template gives its columns). New equipment starts as Good. Leave it empty if there is none.` },
  { find: { text: 'MEMBERS', tag: 'h3', up: 1 }, label: 'Members', desc: `Add Members opens a table of registered ${kind === 'farmers' ? 'farmers' : 'fisherfolk'} who are not members yet. Import members attaches a spreadsheet; when the organization is saved its Import Members window opens so you can check it first.` },
]

export const STAFF2 = [
  // ───────────────────────────── Fisherfolk ─────────────────────────────
  A({ id: 'admin-fisherfolk', file: 'admin/fisherfolk.png', url: '/fisherfolk?tab=registry', title: 'Registration > Fisherfolk', purpose: 'The list of every registered fisherfolk.',
    callouts: [
      SEARCH_ROW('a fisherfolk by name, RSBSA number, FishR number or barangay'),
      { ...FILTERS_ROW, desc: 'Opens the filter row: fisherfolk type, barangay, gender, senior citizen, ICC/IP, PWD and the Registered From / To dates.' },
      PRINT_ROW, DOWNLOAD_ROW,
      { find: { text: 'Import Fisherfolk', tag: 'button' }, label: 'Import Fisherfolk', desc: 'Registers many fisherfolk from a spreadsheet, with a preview first. A recent import can be undone from the import window.' },
      { find: { text: 'Register Fisherfolk', tag: 'button', exact: true }, label: 'Register Fisherfolk', desc: 'Opens the form to register one new fisherfolk.' },
      { find: COLS, label: 'Columns', desc: 'FishR number (the fisherfolk registration number), RSBSA number, full name, type (Aquaculture or Capture), the activities they do, barangay, age and date registered.' },
      { find: ROW1, label: 'A fisherfolk row', desc: 'Click a row to open that fisherfolk\'s profile.' },
      { ...PAGER_ROW, find: PAGER },
    ] }),
  A({ id: 'admin-register-fisherfolk', file: 'admin/register-fisherfolk.png', url: '/fisherfolk?tab=registry', js: click('Register Fisherfolk'), after: 2200, height: 1800, title: 'Register Fisherfolk form', purpose: 'Records a new fisherfolk once, with their RSBSA and FishR numbers.',
    callouts: [
      { find: { text: 'Register Fisherfolk', tag: 'h2' }, label: 'Form title and close button', desc: 'The X at the top right (or Cancel) closes the window without saving. Fields marked * are required.' },
      { find: [field('Prefix'), field('First Name'), field('Last Name'), field('Middle Name')], label: 'Name', desc: 'Optional prefix (Mr., Dr., Engr., Atty., Hon.), then first and last name (required) and the middle name (optional).' },
      { find: [field('Sex'), field('Birthdate'), field('Civil Status'), field('Highest Education')], label: 'Sex, birthdate, civil status, education', desc: 'Sex, Birthdate and Civil Status are required. The age on the lists comes from the birthdate, and 60 or older is marked Senior Citizen automatically.' },
      { find: [field('Contact Number'), field('Barangay')], label: 'Contact number and barangay', desc: 'The mobile number is optional (09XXXXXXXXX); the barangay is required.' },
      { find: [field('RSBSA Number'), field('FishR Number'), field('PhilSys')], label: 'RSBSA, FishR and PhilSys numbers', desc: 'The RSBSA number is required and must be new. The FishR number (the fisherfolk registration number) and the PhilSys national ID are optional.' },
      { find: { text: 'Person with Disability', tag: 'label', up: 2 }, label: 'Classification', desc: 'Tick Person with Disability, 4Ps Beneficiary and ICC/IP Member if they apply. Senior Citizen is automatic from the birthdate.' },
      { find: field('Fisherfolk Type'), label: 'Fisherfolk Type', desc: 'Required. Aquaculture (ponds and cages: they get production cycles) or Capture (fishing trips: they get catch logs).' },
      { find: { text: 'Mariculture', tag: 'label', up: 2 }, label: 'Activities', desc: 'Tick what the fisherfolk does: Aquaculture, Capture Fishery, Mariculture, Inland Fishery. It shows in the Activities column.' },
      { find: field('Fisherfolk Organization'), label: 'Fisherfolk Organization', desc: 'Optional. Click the box and type part of the organization\'s name: the list narrows as you type. Pick it (or Not a member) to make the fisherfolk one of its members.' },
      { find: field('Email'), label: 'Email', desc: 'Optional. Only kept on the record; the login account is set up later from the profile.' },
      { find: { text: 'Cancel', tag: 'button', exact: true, last: true }, label: 'Cancel', desc: 'Closes the form; nothing is saved.' },
      { find: { text: 'Save Fisherfolk', tag: 'button', exact: true }, label: 'Save Fisherfolk', desc: 'Saves the fisherfolk and returns to the list.' },
    ] }),
  A({ id: 'admin-fisherfolk-profile', file: 'admin/fisherfolk-profile.png', url: '/fisheries/1', wait: 6000, height: 1300, title: 'Fisherfolk profile', purpose: 'Everything about one fisherfolk: details, stocking records and ponds.',
    callouts: [
      { find: { text: 'Back to Fisherfolk Registry', tag: 'a' }, label: 'Back', desc: 'Returns to the fisherfolk list.' },
      { find: { text: 'View Assistance History', tag: 'button' }, label: 'View Assistance History', desc: 'Opens every assistance this fisherfolk received: type, source agency, quantity, season, year and the date given. Print Report and Download Report in that window give the history as a PDF.' },
      { find: { text: 'Generate Report', tag: 'button' }, label: 'Generate Report', desc: 'Makes a PDF profile of the fisherfolk and downloads it.' },
      { find: { text: 'Edit Profile', tag: 'button' }, label: 'Edit Profile', desc: 'Opens the same form as Register Fisherfolk, to correct the details.' },
      { find: { text: 'Regenerate Password', tag: 'button' }, label: 'Regenerate Password', desc: 'Makes a new random password for the fisherfolk\'s login account and shows it once, to be read to them. Until an account exists it says Set Up Account.' },
      { find: { text: 'Stocking Records', tag: 'h2', closest: H }, label: 'Stocking Records', desc: 'Each production cycle: species, culture type, date stocked, expected harvest, estimated and actual harvest (kg), pond barangay and status.' },
      { find: { text: 'Bulk Add Ponds', tag: 'button' }, label: 'Bulk Add Ponds', desc: 'Adds several ponds or cages at once.' },
      { find: { text: 'Add Pond', tag: 'button', exact: true }, label: 'Add Pond', desc: 'Adds one pond or cage: its name (numbered automatically if left blank), barangay, area in hectares, water source, and whether it has PCIC insurance (with up to 5 photos of the insurance form).' },
      { find: { text: 'Ponds', tag: 'h2', exact: true, closest: H }, label: 'Ponds table', desc: 'Each pond with its barangay, area, water source, stocking history and the PCIC Insured tick. The Actions menu of a pond edits or removes it.' },
    ] }),

  // ───────────────────────────── Organizations ─────────────────────────────
  A({ id: 'admin-organizations', file: 'admin/organizations.png', url: '/farmers?tab=organizations', title: 'Organizations > Farmers Organizations', purpose: 'Each organization with its members, officers and equipment. Fisherfolk Organizations works the same way.',
    callouts: [
      SEARCH_ROW('an organization by name or address'),
      FILTERS_ROW, PRINT_ROW, DOWNLOAD_ROW,
      { find: { text: 'Import Organizations', tag: 'button' }, label: 'Import Organizations', desc: 'Registers many organizations from a spreadsheet, with a preview first.' },
      { find: { text: 'Add Organization', tag: 'button', exact: true }, label: 'Add Organization', desc: 'Opens the registration form, with equipment and members inside it.' },
      { find: COLS, label: 'Columns', desc: 'Organization name, address, contact person, contact number and Actions.' },
      { find: { css: 'tbody tr:first-child td:last-child button' }, label: 'Actions menu', desc: 'The three dots of a row open the menu of that organization (next picture).' },
      { ...PAGER_ROW, find: PAGER },
    ] }),
  A({ id: 'admin-org-menu', file: 'admin/org-menu.png', url: '/farmers?tab=organizations', js: orgMenu, after: 600, title: 'The menu of an organization', purpose: 'What the three-dot menu of an organization does.',
    callouts: [
      { find: { text: 'Edit organization', tag: 'button' }, label: 'Edit organization', desc: 'Opens the Edit Organization form: the same fields as Add Organization, plus the Members section to add more members.' },
      { find: { text: 'View organization profile', tag: 'button' }, label: 'View organization profile', desc: 'Opens the organization\'s own page: members, equipment inventory, what it confirmed for members, and its officers.' },
      { find: { text: 'Add assistance', tag: 'button' }, label: 'Add assistance', desc: 'Opens the Assistance page with this organization already chosen, to distribute help to its members.' },
    ] }),
  A({ id: 'admin-add-organization', file: 'admin/add-organization.png', url: '/farmers?tab=organizations', js: click('Add Organization'), after: 2000, height: 1850, title: 'Add New Organization form', purpose: 'Registers an organization together with its contact, equipment and members.',
    callouts: [
      { find: { text: 'Add New Organization', tag: 'h2' }, label: 'Form title and close button', desc: 'The X at the top right (or Cancel) closes the window without saving. Fields marked * are required.' },
      ...ORG_FORM_FIELDS('farmers'),
      { find: { text: 'Cancel', tag: 'button', exact: true, last: true }, label: 'Cancel', desc: 'Closes the form; nothing is saved.' },
      { find: { text: 'Add Organization', tag: 'button', last: true }, label: 'Add Organization', desc: 'Saves the organization with the equipment and members you added.' },
    ] }),
  A({ id: 'admin-edit-organization', file: 'admin/edit-organization.png', url: '/farmers?tab=organizations', js: `${orgMenu}; ${clickIncl('Edit organization')}`, after: 2500, height: 1300, title: 'Edit Organization form', purpose: 'Changes an organization\'s details and adds more members.',
    callouts: [
      { find: { text: 'Edit Organization', tag: 'h2' }, label: 'Form title', desc: 'The same fields as Add New Organization, filled with the current details.' },
      ...ORG_FORM_FIELDS('farmers').filter((c) => !/Equipment/.test(c.label)),
      { find: { text: 'Update Organization', tag: 'button', exact: true }, label: 'Update Organization', desc: 'Saves the changes. Equipment is managed on the organization\'s page.' },
    ] }),
  A({ id: 'admin-add-members', file: 'admin/add-members.png', url: '/farmers?tab=organizations', js: `${click('Add Organization')}; ${wait(1200)}; const m=[...document.querySelectorAll('button')].find(x=>x.offsetParent&&x.textContent.trim()==='Add Members'); m.scrollIntoView(); m.click()`, after: 2500, title: 'Add Members table', purpose: 'Chooses the registered farmers to add as members, with their positions.',
    callouts: [
      { find: { text: 'Add Members', tag: 'h2', exact: true }, label: 'Window title', desc: 'Lists only the registered farmers who are not members of this organization yet.' },
      { find: { css: 'input[type=search]', last: true }, label: 'Search box', desc: 'Find a farmer by name or RSBSA number.' },
      { find: { css: 'table input[type=checkbox]' }, label: 'Tick box', desc: 'Tick each farmer to add. A Position box then appears on that row.' },
      { find: { text: 'Position', tag: 'th' }, label: 'Position', desc: 'Choose Member or an officer position (President, Vice President, Secretary, Treasurer and so on) for each ticked farmer. A position that is already taken, or chosen on another row, is grayed out and marked (taken).' },
      { find: { text: 'Showing', tag: 'span, p, div', up: 1, last: true }, label: 'Page bar', desc: 'Previous page and Next page move through the farmers. Your ticks are kept across pages.' },
      { find: { text: 'Cancel', tag: 'button', exact: true, last: true }, label: 'Cancel', desc: 'Closes the table without adding anyone.' },
      { find: { text: 'Add selected', tag: 'button' }, label: 'Add selected', desc: 'Puts the ticked farmers on the organization\'s member list. They are saved when the organization is saved.' },
    ] }),
  A({ id: 'admin-org-detail', file: 'admin/org-detail.png', url: '/organizations/farmers/1', wait: 6000, height: 1300, title: 'Organization page: Members and Officers', purpose: 'One organization: its members, equipment inventory, confirmations and officers.',
    callouts: [
      { find: { text: 'Back to Organizations', tag: 'a' }, label: 'Back to Organizations', desc: 'Returns to the list.' },
      { find: { text: 'Regenerate Password', tag: 'button' }, label: 'Regenerate Password', desc: 'Makes a new random password for the organization\'s login account and shows it once, to be read to its officer. Until an account exists it says Set Up Account.' },
      { find: [{ text: 'Members', tag: 'button', exact: true }, { text: 'Equipment Inventory', tag: 'button' }, { text: 'Confirmed for Members', tag: 'button' }], label: 'Tabs', desc: 'Members, Equipment Inventory and Confirmed for Members (the next pictures show the last two).' },
      { find: { text: 'Import Members', tag: 'button' }, label: 'Import Members', desc: 'Adds many members from a spreadsheet, with a preview first.' },
      { find: { text: 'Add Member', tag: 'button', exact: true }, label: 'Add Member', desc: 'Opens a window: search a registered farmer, choose the position (one that is taken is grayed out) and the date joined, then Add Member.' },
      { find: COLS, label: 'Members table', desc: 'Full name, RSBSA number, position, date joined and Main (marks the organization that is this member\'s main one when they belong to several). A member\'s menu changes the position or removes them.' },
      { find: { text: 'Organization Officers', tag: 'h3', up: 2 }, label: 'Organization Officers', desc: 'The president, vice president, secretary, treasurer, auditor, board members and the other positions, with the term of each.' },
      { find: { text: 'Officer History', tag: 'button' }, label: 'Officer History', desc: 'Every officer who held a position before, with the term dates and why it ended.' },
      { find: { text: 'Assign Officer', tag: 'button' }, label: 'Assign Officer', desc: 'Choose a position and one of the organization\'s members, then Assign Officer. Positions that are held are grayed out, and a member who already holds a position cannot be given another: end that term first (open the officer, End term early, give the reason).' },
    ] }),
  A({ id: 'admin-org-equipment', file: 'admin/org-equipment.png', url: '/organizations/farmers/1', js: click('Equipment Inventory'), after: 2500, height: 1000, title: 'Organization page: Equipment Inventory', purpose: 'What the organization owns, as staff see it.',
    callouts: [
      { find: { text: 'Equipment Inventory', tag: 'button' }, label: 'Equipment Inventory tab', desc: 'The equipment of this organization, one line per kind.' },
      { find: { text: 'Import Equipment', tag: 'button' }, label: 'Import Equipment', desc: 'Adds many equipment lines from a spreadsheet.' },
      { find: { text: 'Add Equipment', tag: 'button', exact: true }, label: 'Add Equipment', desc: 'Choose the equipment, how many units and optionally the date acquired and remarks. New equipment starts as Good.' },
      { find: COLS, label: 'Columns', desc: 'Equipment, quantity, condition (Good, Needs Repair, Not Operational, Broken or Lost), date acquired and remarks.' },
      { find: { text: 'Remove', tag: 'button' }, label: 'Remove', desc: 'Removes a line that was entered by mistake.' },
    ] }),
  A({ id: 'admin-org-confirmed', file: 'admin/org-confirmed.png', url: '/organizations/farmers/1', js: click('Confirmed for Members'), after: 2500, height: 900, title: 'Organization page: Confirmed for Members', purpose: 'The record of what the organization confirmed for its members.',
    callouts: [
      { find: { text: 'Confirmed for Members', tag: 'button' }, label: 'Confirmed for Members tab', desc: 'When the organization confirms for its members that they received an assistance, the confirmations are listed here, grouped by the moment and the person who confirmed, with the proof photos they share. It is a record: these confirmations are final and need no staff approval.' },
    ] }),
  A({ id: 'admin-assign-officer', file: 'admin/assign-officer.png', url: '/organizations/farmers/1', js: click('Assign Officer'), after: 2000, title: 'Assign Officer window', purpose: 'Gives a position to a member.',
    callouts: [
      { find: { text: 'Position', tag: 'label', up: 1 }, label: 'Position', desc: 'President, Vice President, Secretary, Treasurer, Auditor, Board Member and the others. A position that is already held is grayed out and marked (taken); the first free one is chosen for you.' },
      { find: { text: 'Member', tag: 'label', up: 1 }, label: 'Member', desc: 'Search this organization\'s members by name and choose one. Only members can be officers.' },
      { find: { text: 'Assign Officer', tag: 'button', last: true }, label: 'Assign Officer', desc: 'Saves the assignment, with the date it starts.' },
    ] }),
  A({ id: 'admin-fisherfolk-orgs', file: 'admin/fisherfolk-organizations.png', url: '/fisherfolk?tab=organizations', title: 'Organizations > Fisherfolk Organizations', purpose: 'The same page for fisherfolk organizations.',
    callouts: [
      SEARCH_ROW('an organization by name or address'),
      FILTERS_ROW, PRINT_ROW, DOWNLOAD_ROW,
      { find: { text: 'Import Organizations', tag: 'button' }, label: 'Import Organizations', desc: 'Registers many fisherfolk organizations from a spreadsheet.' },
      { find: { text: 'Add Organization', tag: 'button', exact: true }, label: 'Add Organization', desc: 'The same form as for farmers, with fisherfolk as members and fishing equipment.' },
      { find: COLS, label: 'Columns and Actions', desc: 'Name, address, contact person and number; the Actions menu has Edit organization, View organization profile and Add assistance.' },
    ] }),
]
