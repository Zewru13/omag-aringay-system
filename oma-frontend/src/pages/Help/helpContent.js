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
        a: 'In Add Farm Parcels each row is one parcel. Under a parcel, press Add crop to record what is planted on it. That crop form is the same as Add Crop Records, with the same fields and the same rules, and each crop is saved as a planted crop on that parcel. Everything is saved together or not at all. To bring in a whole file of parcels for one farmer, choose the farmer and press Import Farm Parcels.',
      },
      {
        q: 'What are Crop Status and Crop Owner?',
        a: 'Crop Status says how the farmer holds the land for that crop: Owner, Lessee, Tenant or Other. When it is Tenant or Lessee a Crop Owner column opens beside it where you type the owner\'s name. The name is required.',
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
        q: 'Why can\'t I add more area to a parcel?',
        a: 'The crops growing on a parcel together cannot be more than the parcel\'s area. Harvested crops and total losses no longer count. Fix the area of the crop, or the area of the parcel from Edit parcel.',
      },
      {
        q: 'What do the ⋮ menus on Crop Records do?',
        a: 'On a parcel: Add crops, Force harvest, Edit parcel and Purge parcel (for a parcel that was sold or transferred). Opening a farmer\'s profile shows their parcels and the crops they planted.',
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
        a: 'Activity Suggestions are set per crop in Activity Settings. In a crop\'s View Logs, Get Suggestions shows what is recommended: done activities are grayed out with a checkmark, the others are in full color.',
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
        q: 'How do I add equipment to an organization?',
        a: 'In the organization\'s Equipment tab (Equipment Inventory for staff) choose Add Equipment, then the equipment, how many units, and optionally the date acquired and remarks. There is no condition to choose: new equipment starts as Good. Later, Change condition moves units to Needs Repair, Not Operational, Broken or Lost, and Repair puts repaired units back to Good.',
      },
      {
        q: 'How do I record that members borrowed equipment?',
        a: 'In an organization account\'s Borrowed tab press Lend equipment. Choose the equipment, the date it was borrowed and, if known, when it is due back, then tick every member who borrowed it and give each one\'s number of units. Use it for borrowers who have no account to request equipment themselves. All of them are saved together as Borrowed.',
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
        a: 'Log Individual Assistance records help for one person. Distribute to Organization gives the same assistance to the members of one organization. Distribute to Multiple Organizations is a table where each row is one organization with its own assistance. Import File brings a spreadsheet in.',
      },
      {
        q: 'How does Distribute to Multiple Organizations work?',
        a: 'Each row is an organization plus the assistance type, date, quantity (or cash amount per member), source agencies and description. Add Row Like the Last copies the details of the row above so you only pick the organization. Review checks every row first: how many members would receive it and who is blocked. You can untick members for each organization. Nothing is saved until you confirm, then each organization\'s distribution is saved and the result is shown per organization.',
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
    ],
  },
  {
    title: 'Accounts and settings',
    items: [
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
