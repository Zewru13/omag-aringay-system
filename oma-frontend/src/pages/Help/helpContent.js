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
        q: 'Can I add the farm parcels while I register a farmer?',
        a: 'Yes. Fill in the Register Farmer form as usual and press Save Farmer and Add Farm Parcels (in the Farm Parcels and Crops section) instead of Save Farmer. The farmer is saved and the Add Farm Parcels table opens for that farmer: one row per parcel, with the crops planted on each. When you save the parcels you come back to the farmer profile, still under Registration > Farmers.',
      },
      {
        q: 'What is required when I add a farm parcel?',
        a: 'Parcel Number (all 17 digits), Barangay, Area (ha), Land Ownership, Farm Type and Cropping Schedule. The tax declaration number is optional. Land Ownership is something you choose, it is never filled in for you. A Tenant or Lessee parcel also needs the land owner\'s name.',
      },
      {
        q: 'How do I add several parcels, or a parcel with its crops?',
        a: 'In Add Farm Parcels each row is one parcel; press Add Parcel for another. Under a parcel, press Add crop to record what is planted on it, or Import crops to read the crops of that parcel from a spreadsheet (the crops are added to the list so you can check them before saving). That crop form is the same as Add Crop Records, with the same fields and the same rules, and each crop is saved as a planted crop on that parcel. Everything is saved together or not at all. To bring in a whole file of parcels for one farmer, choose the farmer and press Import Farm Parcels.',
      },
      {
        q: 'Where do I choose the Crop Status and Crop Owner?',
        a: 'You do not. A crop has no Crop Status column: its status is the Land Ownership of the farm parcel it is grown on (Owner, Lessee or Tenant), and a Tenant or Lessee crop carries the land owner named on that parcel. To change it, change the land ownership of the parcel.',
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
        q: 'Can the seed quantity be counted in something other than kg?',
        a: 'Yes. In Edit Crop the unit next to Qty of Seeds lists kg, bags, pcs and bundles, followed by every unit set up in Admin > Harvest Unit Settings (sacks, cavan and so on). Add a unit there and it appears in this list. The bulk Add Crop table counts seeds in kg.',
      },
      {
        q: 'How do I record that a crop has PCIC insurance?',
        a: 'In the crop table, tick Insured in the PCIC column. A window asks for a photo of the PCIC insurance form (JPG, PNG or WEBP, up to 5 MB); the crop cannot be saved insured without it. Cancel the window without a photo and the box unticks. In fisheries, insurance is kept for each pond or cage: tick PCIC Insured on its row when you start a production cycle, or in the Edit form of the cycle. The pond table on a fisherfolk profile shows a checked PCIC Insured column.',
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
        a: 'In Crop Monitoring, open the crop\'s ⋮ menu and choose Record Harvest. It stays unavailable until half of the growing time of the crop has passed (planting date to expected harvest date); before that, use Force Harvest. Enter the harvest dates, the area harvested and the quantity in the unit it was counted in. Harvest Unit Settings turns that unit into kilograms. A harvest more than 7 days after the expected date asks for a reason.',
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
        q: 'How do I filter, print or download the Crop Disaster and Fisheries Disaster tables?',
        a: 'Open Filters and use the Occurred From and To dates together with the barangay, disaster type, status and year; either date can be left empty. Print Report and Download Report above the table give the report of the rows the filters match, the same PDF as Reports > Disaster. Each farmer or fisherfolk row has an Actions menu: View Report shows every disaster of that person (within the filters) with Print Report and Download Report inside, and Print and Download give the same PDF straight away. Open the row to see one disaster, with its own Print Disaster Log and Download Disaster Log.',
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
        q: 'Where do the equipment names in the lists come from?',
        a: 'From the settings: Crop Settings > Equipment Types for the machinery of a farmer and the equipment of a farmers organization, and Fisheries Settings > Equipment Types for a fisherfolk organization. Add a name there and it appears in the dropdowns. Choose Other to type a name that is not on the list.',
      },
      {
        q: 'Can I add equipment when I register an organization?',
        a: 'Yes. The Add Organization form has an Equipment section: press Add equipment for each kind, then choose it, the number of units and optionally the date acquired and remarks. The equipment is saved together with the organization, in Good condition. Leave the section empty if there is none.',
      },
      {
        q: 'Can I add members when I register an organization?',
        a: 'Yes. The Add Organization form has a Members section: press Add Members to open a table of the registered farmers (or fisherfolk) who are not members yet. Search by name or RSBSA number, tick the people to add and choose each one position (Member or an officer position), then press Add. They are listed in the form, where you can still change a position or the date joined (left blank, the date registered of the organization is used). To use a spreadsheet instead, press Import members, choose the file (Download template gives the columns); when the organization is saved the Import Members window opens with it so you can preview it. The same Members section is in the Edit Organization form. Anyone who cannot be added, for example a person already in other organizations with no main one, is listed after saving and can be added from the organization page.',
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
        q: 'How do I force harvest crops before a typhoon?',
        a: 'From Crop Monitoring, open the menu of one of the crops and choose Force Harvest. The window lists the crops of that farmer that are not ready yet, on every parcel, with the crop you chose already ticked. Choose the harvested date and the reason, tick the crops, type the area of each one and its quantity in the Qty / Unit box, picking the unit it was counted in (kg, sacks, cavan or whatever that crop allows; the kg it comes to shows under it), then press Review Force Harvest, check the tables and press Confirm Force Harvest. On Crop Records the menu of a parcel does the same for that parcel only. The red FORCED HARVEST label on a harvested crop opens the saved details.',
      },
      {
        q: 'Can I print one parcel or one production cycle?',
        a: 'Yes. Open the ⋮ menu of a parcel on Crop Records, or of a row on Aquaculture Monitoring, and choose Print report. It prints the details of that one record and the crop records, or the ponds and cages, that belong to it.',
      },
      {
        q: 'Can I print or download the crop and fisheries tables?',
        a: 'Yes. Crop Records, Crop Monitoring, Aquaculture Monitoring and Capture Monitoring each have a Print Report and a Download Report button. Print Report prints, and Download Report saves as a PDF, every row that the search and filters match, not only the page on screen, with the filters and date range written under the title. Both give the same report, so set the filters first.',
      },
      {
        q: 'How do I filter by date?',
        a: 'Open Filters and use the From and To dates: Planted on Crop Records and Crop Monitoring, Stocked on Aquaculture Monitoring, Trip on Capture Monitoring, and Registered on the farmers, fisherfolk and organization tables. Both ends are included and either can be left empty. The To date cannot be before the From date.',
      },
      {
        q: 'Can I print or download the farmer, fisherfolk or organization list?',
        a: 'Yes. On the Farmers, Fisherfolk and Organizations tables press Print Report to print, or Download Report to save it as a PDF. Both give the Registered report for exactly what the table shows, so set the filters first: search, Barangay, sex, type, senior citizens, ICC/IP, PWD, 4Ps and the registered dates (the ones the table has). It is the same PDF as Reports > Registered.',
      },
    ],
  },
  {
    title: 'Accounts and settings',
    items: [
      {
        q: 'How do I add a new item in the settings tables?',
        a: 'Press the Add button under the table; it is named after what you add (Add Crop, Add Variety, Add Unit and so on). One more row appears at the top of the table with its boxes empty: fill them and press Save (Enter saves, Escape cancels). The settings tables list the newest row first, so the row you add stays on top. The same works on every settings table: Crop Settings, Fisheries Settings, Activity Settings, Assistance Settings, Classification Settings and Harvest Unit Settings. To change an item that is already there, use Edit in its row menu.',
      },
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
        a: 'Admin > Crop Settings > Seed Sources tab. Press Add Seed Source under the table, type the name in the new row and press Save (or Enter). Use the row\'s menu to rename or delete one.',
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
