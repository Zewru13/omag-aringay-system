// The words of the staff Help page (Admin and Focal Person accounts). Plain data, so it can be tested without a screen: every step and every
// question says who it is for (`roles`: leave it out for both), and helpFor(role) returns what that account should see.
//   role: 'ADMIN' | 'EVALUATOR' (the Focal Person)

export const ROLE_LABELS = { ADMIN: 'Admin', EVALUATOR: 'Focal Person' }

const ADMIN = ['ADMIN']

export const STEPS = [
  {
    title: 'Set up the master data',
    roles: ADMIN,
    desc: 'Under Admin, open Crop Settings to set up each crop: its growth duration, yield per hectare and Planted As (seed, tree, or seed or tree). Activity Settings, Assistance Settings, Classification Settings and Harvest Unit Settings hold the other lists the forms use.',
  },
  {
    title: 'Register farmers, fisherfolk and organizations',
    desc: 'Registration holds the farmers and fisherfolk. Organizations holds each organization with its members, officers and equipment.',
  },
  {
    title: 'Add the farm parcels',
    desc: 'Under Crop Management > Crop Records, choose Add Farm Parcel, pick the farmer and fill one row per parcel. The parcel number, barangay, area, land ownership, farm type and cropping schedule are required.',
  },
  {
    title: 'Add the crops that are planted',
    desc: 'Add a crop from a parcel\'s ⋮ menu (Add crops), from Add Crop Records, or right inside the parcel form. They are the same form. Every crop recorded is planted and is monitored until it is harvested.',
  },
  {
    title: 'Monitor, harvest and report disasters',
    desc: 'Crop Monitoring opens on the crops that are Planted; use the status filter for the others. From a crop\'s ⋮ menu you can view its logs, record the harvest or report a disaster.',
  },
  {
    title: 'Give out assistance',
    desc: 'Under Assistance, record help given to one person, distribute it to all the members of an organization, or distribute it to several organizations at once.',
  },
  {
    title: 'Generate reports',
    desc: 'Reports lets you preview a report as a PDF, then download or print it.',
  },
]

export const SECTIONS = [
  {
    title: 'Farm parcels and crops',
    items: [
      {
        q: 'What is required when I add a farm parcel?',
        a: 'Parcel Number (all 17 digits), Barangay, Area (ha), Land Ownership, Farm Type and Cropping Schedule. The tax declaration number is optional. Land Ownership is something you choose, it is never filled in for you. A Tenant or Lessee parcel also needs the land owner\'s name.',
      },
      {
        q: 'How do I add several parcels, or a parcel with its crops?',
        a: 'In Add Farm Parcels each row is one parcel; press Add Parcel for another. Under a parcel, press Add crop to record what is planted on it, or Import crops to read the crops of that parcel from a spreadsheet (the crops are added to the list so you can check them before saving). That crop form is the same as Add Crop Records, with the same fields and the same rules, and each crop is saved as a planted crop on that parcel. Everything is saved together or not at all. To bring in a whole file of parcels for one farmer, choose the farmer and press Import Farm Parcels.',
      },
      {
        q: 'What are Crop Status and Crop Owner?',
        a: 'Crop Status says how the farmer holds the land for that crop: Owner, Lessee, Tenant or Other. When it is Tenant or Lessee a Crop Owner column opens beside it where you type the owner\'s name. The name is required. On a parcel whose Land Ownership is Owner there is no Crop Status column at all: every crop on it is the owner\'s own.',
      },
      {
        q: 'Where do I record a farmer\'s machinery?',
        a: 'Machinery belongs to the farmer, not to a parcel. Enter it in the Agricultural Machinery section of Register Farmer (Add machinery, or Import machinery from a spreadsheet), or later from the farmer\'s profile with Add machinery. Each line has the machinery, how many, and whose it is (Owned, Borrowed, Rented or Organization-Owned). Remove a line from the profile\'s table.',
      },
      {
        q: 'Why does a crop need a variety?',
        a: 'Every new crop record needs its variety, because a variety can have its own growth duration. Pick one from the list or choose Other and type it.',
      },
      {
        q: 'Seeds or trees: how is the quantity recorded?',
        a: 'Each crop has a Planted As setting in Crop Settings: Seed, Tree, or Seed or Tree. A Seed crop is counted in Qty of Seeds (kg), a Tree crop in Qty of Trees. For a crop that can be either, the Quantity column heading gets a small arrow: open it and choose Qty of Seeds or Qty of Trees.',
      },
      {
        q: 'How do I record that a crop has PCIC insurance?',
        a: 'In the crop table, tick Insured in the PCIC column. A window asks for a photo of the PCIC insurance form (JPG, PNG or WEBP, up to 5 MB); the crop cannot be saved insured without it. Cancel the window without a photo and the box unticks. Ponds and stocking records in fisheries work the same way.',
      },
      {
        q: 'Why can\'t I add more area to a parcel?',
        a: 'The crops growing on a parcel together cannot be more than the parcel\'s area. Harvested crops and total losses no longer count. Fix the area of the crop, or the area of the parcel from Edit parcel.',
      },
      {
        q: 'What do the ⋮ menus on Crop Records do?',
        a: 'On a parcel: Add crops, Force harvest and Edit parcel. Opening a farmer\'s profile shows their parcels and the crops they planted.',
      },
    ],
  },
  {
    title: 'Crop monitoring and harvest',
    items: [
      {
        q: 'How is the Expected Harvest Date computed?',
        a: 'Date Planted plus the crop\'s Growth Duration in days (set in Crop Settings). A variety can carry its own duration, and then that one is used.',
      },
      {
        q: 'How is the Estimated Yield computed?',
        a: 'The Area Planted (ha) multiplied by the crop\'s Yield Per Hectare (kg) in Crop Settings.',
      },
      {
        q: 'What do the crop statuses mean?',
        a: 'Planted: in the ground, harvest more than 7 days away. Near Harvest: the expected date is within 7 days, shown as Due Harvest while it is still ahead, Ready for Harvest from the harvest date up to 7 days after it, and Overdue after that when no harvest was recorded. Harvested: a harvest was recorded. Total Loss: a disaster destroyed the whole crop.',
      },
      {
        q: 'Where are my harvested crops?',
        a: 'Crop Monitoring and a farmer\'s Crop Monitoring Records open on Planted. A crop leaves that view once it is harvested. Use the status filter (Near Harvest, Due Harvest, Ready for Harvest, Overdue, Harvested, Total Loss, All Status) to see the others.',
      },
      {
        q: 'How do I record a harvest?',
        a: 'In Crop Monitoring, open the crop\'s ⋮ menu and choose Record Harvest. Enter the harvest dates, the area harvested and the quantity in the unit it was counted in. Harvest Unit Settings turns that unit into kilograms. A harvest before the crop is ready asks for a reason.',
      },
      {
        q: 'What is a forced harvest?',
        a: 'Harvesting a crop (or all the crops of a parcel) before it is ready, for a reason such as an upcoming typhoon or drought. Use Force harvest on the parcel\'s ⋮ menu in Crop Records.',
      },
      {
        q: 'How do I report a disaster or crop damage?',
        a: 'For one crop, open its ⋮ menu in Crop Monitoring and choose Report Disaster. For many crops or farmers at once, go to Disaster > Crop Disaster and press Log Disaster: choose the farmers and their affected parcels and crops (there is a total loss option), and after saving you can download or print the report. A crop reported as a total loss moves to Total Loss.',
      },
      {
        q: 'How do Activity Suggestions work?',
        a: 'Activity Suggestions are set per crop in Activity Settings. In a crop\'s View Logs, Get Suggestions shows what is recommended: done activities are grayed out with a checkmark, the others are in full color. Land Preparation and Planting are never suggested or offered when you record an activity, because a crop is already planted when it is added to the system.',
      },
    ],
  },
  {
    title: 'Organizations, officers and equipment',
    items: [
      {
        q: 'How do I end an officer\'s term early?',
        a: 'Open the officer and choose End term early. A reason is required: choose Migrated or Transferred Registration, or choose Others and write the reason. The position becomes vacant so someone new can be assigned, and the term stays in Officer History.',
      },
      {
        q: 'Can I add equipment when I register an organization?',
        a: 'Yes. The Add Organization form has an Equipment section: press Add equipment for each kind, then choose it, the number of units and optionally the date acquired and remarks. The equipment is saved together with the organization, in Good condition. Leave the section empty if there is none.',
      },
      {
        q: 'How do I add equipment to an organization?',
        a: 'In the organization\'s Equipment tab (Equipment Inventory for staff) choose Add Equipment, then the equipment, how many units, and optionally the date acquired and remarks. There is no condition to choose: new equipment starts as Good. Later, Change condition moves units to Needs Repair, Not Operational, Broken or Lost, and Repair puts repaired units back to Good.',
      },
      {
        q: 'How do I record that members borrowed equipment?',
        a: 'In an organization account\'s Borrowed tab press Lend equipment. Enter the date it was borrowed, choose the equipment, then tick every member who borrowed it and give each one\'s number of units. Once every unit is given out, no other member can be ticked for that equipment. To lend a different kind of equipment, even to a member already ticked, press Lend another equipment and fill its section the same way. Use it for borrowers who have no account to request equipment themselves. Everything is saved together as Borrowed.',
      },
      {
        q: 'Where are borrowed and returned equipment?',
        a: 'The Borrowed tab has two tables. Borrowed lists what is still out, one row per person that opens onto their items: approve or reject a request, and press Mark returned on an item to say what happened: Returned, Damaged (and how damaged) or Not returned (the unit is recorded as Lost). Damaged units leave the lendable stock until they are repaired. An item past its return-by date shows Overdue, and Overdue is also a choice in the Status filter. Returned lists everything that was closed, with when, and what happened to each unit. The equipment list can be filtered by Condition and by Availability (Available units or Not available). Staff accounts see each organization\'s Equipment Inventory, where an item can be lent to one member.',
      },
      {
        q: 'Who can request equipment?',
        a: 'A member with an account can request equipment from their Equipment page, then the organization approves or rejects it. A member without an account is recorded by the organization with Lend equipment.',
      },
    ],
  },
  {
    title: 'Assistance',
    items: [
      {
        q: 'What are the ways to give assistance?',
        a: 'Distribute Farmer Assistance (Distribute Fisherfolk Assistance on the fisheries page) gives one assistance to the farmers you tick in a table of registered farmers, with a search bar. Distribute to Organizations gives one assistance to the members of the organizations you tick in a table of registered organizations. Import File brings a spreadsheet in. Both distribute windows use the same form: assistance type, source agency, quantity (or cash amount, or training days), date and description.',
      },
      {
        q: 'How does a distribution go, and can I print it?',
        a: 'Fill in the details, tick the recipients (the table remembers your ticks across pages), then press Review Distribution. The review asks the server what would happen, saves nothing, shows who would be blocked or refused, and lets you untick people. Confirm and Distribute saves it, and the result window has Print Report: it prints the Assistance Distribution Report for what was just created.',
      },
      {
        q: 'How do I read the assistance table?',
        a: 'Each row is one distribution, named after the organization that gave it, or Individual farmers (5) when it went to selected people. Click a row to drop down the members who benefited, with their barangay and status. The source agencies show the first three and then Others. A distribution cannot be cancelled from this table; a member\'s own record can be viewed, edited while it is still pending or awaiting confirmation, or marked resolved when it was reported as not received.',
      },
      {
        q: 'Why was a member blocked?',
        a: 'A person who already received the same assistance type from a different organization in the last 30 days cannot receive it again from another one. Only one organization\'s distribution of that type counts per person in that window.',
      },
      {
        q: 'I imported the wrong file. Can I undo it?',
        a: 'Yes. In the Import dialog choose Undo a recent import to review and reverse a recent import.',
      },
    ],
  },
  {
    title: 'Reports',
    items: [
      {
        q: 'How do I print or download a report?',
        a: 'Open Reports, choose the report and its period, and use Preview PDF. Print gives the same PDF as the preview, and Download saves it.',
      },
      {
        q: 'Can I print the farmer, fisherfolk or organization list?',
        a: 'Yes. On the Farmers, Fisherfolk and Organizations tables press Print Report. It prints the Registered report for exactly what the table shows, so set the filters first: search, Barangay, sex, type, senior citizens, ICC/IP, PWD, 4Ps and the registered dates (the ones the table has). It is the same PDF as Reports > Registered.',
      },
    ],
  },
  {
    title: 'Accounts and settings',
    items: [
      {
        q: 'I forgot to save a form and went to another page. Is it lost?',
        a: 'No. The long forms (Add Farm Parcels, Add Crop Records, registering a farmer, fisherfolk or organization, adding ponds, and the Distribute assistance windows) keep what you typed in this browser. Open the form again and it is back, with a note and a Discard draft button to start over. A draft is cleared when you save it, discard it or sign out. A chosen photo is not kept, so choose it again.',
      },
      {
        q: 'What can a Focal Person do compared with an Admin?',
        a: 'Both register and manage farmers, fisherfolk, organizations, crop records, monitoring, disasters, assistance and reports. Only an Admin manages the lists under Admin (Crop Settings, Fisheries Settings, Activity Settings, Assistance Settings, Classification Settings, Harvest Unit Settings), User Management and the audit log, and only an Admin deletes crop records.',
      },
      {
        q: 'Where do I add a crop or change its growth duration?',
        a: 'Admin > Crop Settings. Add the crop with its category, growth duration, yield per hectare and Planted As. A Focal Person can use the crops but cannot change them.',
        roles: ADMIN,
      },
      {
        q: 'How do I add a seed source?',
        a: 'Admin > Crop Settings > Seed Sources tab. Press Add row under the table, type the name in the new row and press Save (or Enter). Use the row\'s menu to rename or delete one.',
        roles: ADMIN,
      },
      {
        q: 'How do I give someone an account?',
        a: 'Admin > User Management. Create the account and choose its role. Farmers, fisherfolk and organizations get their own accounts from their record.',
        roles: ADMIN,
      },
    ],
  },
]

const allowed = (item, role) => !item.roles || item.roles.includes(role)

// What the given account sees: the guide steps (numbered from 1) and the sections that have anything left for it.
export function helpFor(role) {
  const steps = STEPS.filter((s) => allowed(s, role)).map((s, i) => ({ ...s, step: String(i + 1) }))
  const sections = SECTIONS
    .map((section) => ({ ...section, items: section.items.filter((item) => allowed(item, role)) }))
    .filter((section) => section.items.length > 0)
  return { steps, sections }
}
