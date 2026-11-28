// The common questions of the Admin and the Focal Person, shown in Help (Manual/ManualQuestions.jsx).

const ADMIN = ['ADMIN']

export const SECTIONS = [
  {
    title: 'Farm parcels and crops',
    items: [
      {
        q: 'Can I add the farm parcels while I register a farmer?',
        a: 'Yes. Fill in the Register Farmer form as usual and press Save Farmer & Add Farm Parcels (in the Farm Parcels and Crops section) instead of Save Farmer. The farmer is saved, and their profile opens with the Add Farm Parcels window already open for that farmer.',
      },
      {
        q: 'What is required when I add a farm parcel?',
        a: 'Parcel Number (all 17 digits), Barangay, Area (ha), Land Ownership, Farm Type and Cropping Schedule. The tax declaration number is optional. Land Ownership is something you choose, it is never filled in for you. For a Tenant or Lessee parcel, type the land owner\'s name as well.',
      },
      {
        q: 'How do I add several parcels, or a parcel with its crops?',
        a: 'Add Farm Parcels has three steps. In Parcel Details, choose the farmer and fill in the parcel; press Add another parcel for each further one, or Import Farm Parcels to bring in a whole file of that farmer\'s parcels. In Add Crops, press Add crop under a parcel to record what is planted on it, or Import crops to read the crops of that parcel from a spreadsheet (they are added to the list so you can check them before saving). That crop form is the same as Add Crop Records, with the same fields and the same rules, and each crop is saved as a planted crop on that parcel. Crops are optional. In Review and Save, check the list and save. Everything is saved together or not at all.',
      },
      {
        q: 'Where do I choose the Crop Status and Crop Owner?',
        a: 'You do not. A crop has no Crop Status column: its status is the Land Ownership of the farm parcel it is grown on (Owner, Lessee or Tenant), and a Tenant or Lessee crop carries the land owner named on that parcel. To change it, change the land ownership of the parcel.',
      },
      {
        q: 'Where do I record a farmer\'s machinery?',
        a: 'Machinery belongs to the farmer and not to any one parcel. Enter it in the Agricultural Machinery section of Register Farmer (Add machinery, or Import machinery from a spreadsheet), or later from the farmer\'s profile with Add machinery. Each line has the machinery, how many, and whose it is (Owned, Borrowed, Rented or Cooperative-Owned). Remove a line from the profile\'s table.',
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
        a: 'In the crop form, press the round Insured button of the crop (the PCIC column of the crop table shows it as a round check: green when insured). A window asks for photos of the PCIC insurance form, one for each page, up to 5 (JPG, PNG or WEBP, up to 5 MB each); the crop cannot be saved insured without at least one. Cancel the window without a photo and the button goes back to an empty circle. In fisheries, insurance is recorded once for the whole production cycle: press Insured beside the number of ponds when you start it and upload the photo of the form (the PCIC INSURED column of Aquaculture Records shows it), or change it in the Edit form of the cycle. Cycle Details, from the row menu of Aquaculture Monitoring, lists each pond or cage with its PCIC Insured round check. To read the uploaded form, press View form beside a round check (crops, ponds and cages alike, or the PCIC insured tag on a record): the form opens in a window inside the system, one page at a time with zoom, and Close brings you back; it never opens another browser tab. The pond table on a fisherfolk profile has the same column.',
      },
      {
        q: 'Why can\'t I add more area to a parcel?',
        a: 'The crops growing on a parcel together cannot be more than the parcel\'s area. Harvested crops and total losses no longer count. Fix the area of the crop, or the area of the parcel from Edit parcel.',
      },
      {
        q: 'What do the ⋮ menus on Crop Records do?',
        a: 'On a parcel: Add crops, Force harvest, Print report and Edit parcel. Opening a farmer\'s profile shows their parcels and the crops they planted.',
      },
      {
        q: 'What do the rows of Group by show?',
        a: 'Crop Records and Crop Monitoring can group their rows (Filters > Group by). A group row has columns just like the table. A farmer group shows the farmer\'s RSBSA No., Barangay and Contact No. with its totals (parcels, area and crops in Crop Records; records, area planted and near harvest in Crop Monitoring). A land ownership or crop group shows how many farmers it holds with its totals. Click a row to open what is inside it. Forecasting\'s Group by farmer and Group by fisherfolk views show the RSBSA No., Barangay and Contact No. as well. On a phone the same facts are stacked inside the row.',
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
        a: 'Crop Monitoring and a farmer\'s Crop Monitoring Records open on Planted. A crop leaves that view once it is harvested. Use the status filter (Near Harvest, Due Harvest, Ready for Harvest, Overdue, Harvested, Total Loss, Every Status) to see the others.',
      },
      {
        q: 'How do I record a harvest?',
        a: 'In Crop Monitoring, press the wheat Record Harvest button beside the crop\'s ⋮ menu. It stays unavailable until half of the growing time of the crop has passed (planting date to expected harvest date); before that, use Force Harvest. Enter the harvest dates, the area harvested and the quantity in the unit it was counted in. Harvest Unit Settings turns that unit into kilograms. If the harvest is more than 7 days late, you are asked why.',
      },
      {
        q: 'What is a forced harvest?',
        a: 'Harvesting a crop (or all the crops of a parcel) before it is ready, for a reason such as an upcoming typhoon or drought. Use Force harvest on the parcel\'s ⋮ menu in Crop Records.',
      },
      {
        q: 'How do I log one disaster for many fisherfolk?',
        a: 'Go to Disaster > Fisheries Disaster and press Log Disaster. Enter the date, type and description once, then tick the ponds and cages the disaster hit in the list of active cycles: click a cycle to see its ponds and cages, search (a fisherfolk is found by name) or filter by barangay, tick a whole cycle or single ponds and cages, and give the fingerlings lost in each, or tick Total loss. Each fisherfolk with something ticked gets a part of their own for the equipment damaged, the volume lost and their own photos (up to 10, shown as previews you can remove). Those photos are saved only on that one fisherfolk log; removing a fisherfolk removes their photos and un-ticks their ponds and cages. Damage to a pond, cage or equipment with no stock lost is added by name under Damage not linked to a stock, and that fisherfolk needs a pond or cage on record. Pressing Log Disaster saves one log for each fisherfolk in one go: if anything is wrong nothing is saved, and each fisherfolk is notified.',
      },
      {
        q: 'How do I report a disaster or crop damage?',
        a: 'For one crop, open its ⋮ menu in Crop Monitoring and choose Report Disaster. For many crops or farmers at once, go to Disaster > Crop Disaster and press Log Disaster: choose the farmers and their affected parcels and crops (there is a total loss option), then add each farmer\'s own photos in the Photo documentation per farmer table (one row for each farmer you ticked; a farmer\'s photos are saved only on that farmer\'s crops). After saving you can download or print the report. A crop reported as a total loss moves to Total Loss.',
      },
      {
        q: 'How do I filter, print or download the Crop Disaster and Fisheries Disaster tables?',
        a: 'Open Filters and use the Occurred From and To dates together with the barangay, disaster type, status and year; either date can be left empty. The report of the disasters is made in Reports > Disaster. Each farmer or fisherfolk row has an Actions menu: View Report shows every disaster of that person (within the filters) with Print Report and Download Report inside, and Print and Download give the same PDF straight away. Open the row to see one disaster, with its own Print Disaster Log and Download Disaster Log.',
      },
      {
        q: 'How do Activity Suggestions work?',
        a: 'Activity Suggestions are set per crop in Crop Settings. When you open Log Activity on a crop, the form is already filled in from them: the activity that is due now (or the earliest overdue one), its recommendation and, for Fertilizer Application, the Type of Fertilizer from the list in Crop Settings (Input Types). Change anything you like. Land Preparation and Planting are never suggested or offered when you record an activity, because a crop is already planted when it is added to the system.',
      },
    ],
  },
  {
    title: 'Cooperatives, officers and equipment',
    items: [
      {
        q: 'How do I end an officer\'s term early?',
        a: 'Open the officer and choose End term early. A reason is required: choose Migrated or Transferred Registration, or choose Others and write the reason. The position becomes vacant so someone new can be assigned, and the term stays in Officer History.',
      },
      {
        q: 'Where do the equipment names in the lists come from?',
        a: 'From the settings: Crop Settings > Equipment Types for the machinery of a farmer and the equipment of a farmers cooperative, and Fisheries Settings > Equipment Types for a fisherfolk cooperative. Both lists start filled with the usual names. Add a name there and it appears in the dropdowns. Choose Other to type a name that is not on the list.',
      },
      {
        q: 'Can I add equipment when I register a cooperative?',
        a: 'Yes. The Add New Cooperative form has an Equipment section: press Add equipment for each kind, then choose it, the number of units and optionally the date acquired and remarks. The equipment is saved together with the cooperative, in Good condition. Leave the section empty if there is none.',
      },
      {
        q: 'Can I add members when I register a cooperative?',
        a: 'Yes. The Add New Cooperative form has a Members section: press Add Members to open a table of the registered farmers (or fisherfolk) who are not members yet. Search by name or RSBSA number, tick the people to add and choose a position for each one (Member or an officer position), then press Add. They are listed in the form, where you can still change a position or the date joined (left blank, the date registered of the cooperative is used). To use a spreadsheet instead, press Import members, choose the file (Download template gives the columns); when the cooperative is saved the Import Members window opens with it so you can preview it. The same Members section is in the Edit Cooperative form. Anyone who cannot be added, for example a person already in other cooperatives with no main one, is listed after saving and can be added from the cooperative page.',
      },
      {
        q: 'How do I add equipment to a cooperative?',
        a: 'On the cooperative profile, staff open Equipment Inventory and choose Add Equipment; a cooperative account uses Add equipment on its Equipment page. Choose the equipment, how many units, and optionally the date acquired and remarks. There is no condition to choose: new equipment starts as Good. Later, Change condition moves units to Needs Repair, Not Operational, Broken or Lost, and Record repair puts repaired units back to Good.',
      },
      {
        q: 'How do I record that members borrowed equipment?',
        a: 'In a cooperative account, open Equipment and press Lend equipment. Enter the date borrowed, choose the equipment, then tick every member who borrowed it and give each one\'s number of units. Once every unit is given out, no other member can be ticked for that equipment. To lend a different kind of equipment, even to a member already ticked, press Lend another equipment and fill its section the same way. Use it for borrowers who have no account to request equipment themselves. Everything is saved together as borrowed.',
      },
      {
        q: 'Where are borrowed and returned equipment?',
        a: 'A cooperative account sees them on its Equipment page, in the Loans tab, in three sections. Requests waits for Approve or Reject. On loan is what is still out, overdue ones first: press Mark returned to say what happened: Returned, Damaged (and how damaged) or Not returned (the unit is recorded as Lost). Damaged units leave the lendable stock until they are repaired. An item past its return-by date shows Overdue. Returned holds every loan that is closed. The search box finds an equipment or a borrower. Staff see what a cooperative owns in the Equipment Inventory on its profile.',
      },
      {
        q: 'Who can request equipment?',
        a: 'A member with an account can ask for equipment from their Borrow equipment page (under More), then the cooperative approves or rejects it. A member without an account is recorded by the cooperative with Lend equipment.',
      },
    ],
  },
  {
    title: 'Assistance',
    items: [
      {
        q: 'What are the ways to give assistance?',
        a: 'Distribute Farmer Assistance (Distribute Fisherfolk Assistance on the fisheries page) gives one assistance to the farmers you tick in a table of registered farmers, with a search bar. Distribute to Cooperatives gives one assistance to the members of the cooperatives you tick in a table of registered cooperatives. Import File brings a spreadsheet in. Both distribute windows use the same form: assistance type, source agency, quantity (or cash amount, or training days and the type of training), the distribution date, time and place, and a description. The types of training come from the list in Assistance Settings, where you can add, rename or delete them.',
      },
      {
        q: 'How does a distribution go, and can I print it?',
        a: 'Fill in the details, tick the recipients (the table remembers your ticks across pages), then press Review Distribution. The review asks the server what would happen, saves nothing, shows who would be blocked or refused, and lets you untick people. Confirm and Distribute saves it, and the result window has Print Report: it prints the Assistance Distribution Report for what was just created.',
      },
      {
        q: 'How do I read the assistance table?',
        a: 'Each row is one distribution, with its date, time and place, named after who it was given to: the cooperative, or the names of the farmers or fisherfolk when it went to selected people (the first two and how many more, when there are more than three). Clicking a row lists the members who benefited under it, each with a barangay and a status. The source agencies show the first three and then Others. A whole distribution cannot be cancelled from this table. A member\'s own record can be viewed or edited, and Remove (not claimed) takes off someone who did not claim it.',
      },
      {
        q: 'How do I add a new type of assistance?',
        a: 'An Admin opens Admin > Assistance Settings and presses Add Assistance above the Assistance Types table. Type the name, choose whether it applies to crop assistance, fisheries assistance or both, tick the units its quantity box should offer and press Add Assistance. The new type then appears in the Assistance Type box of every assistance form it applies to, before Other. Renaming or deleting it later never changes assistance that was already recorded.',
      },
      {
        q: 'How do I give more than one assistance to the same people at once?',
        a: 'In either distribute window press Add Another Assistance under the first assistance (up to five in all). Every assistance has its own type, quantity and source agency; the date, time, place and description are filled in once for all of them. The review lists each assistance in its own section, so you can untick a person for one of them without changing the others, and the 30-day warnings are checked for each type. Confirm and Distribute saves every assistance as a distribution of its own. A type can be chosen once in a distribution; to give the same type again, start another distribution. Remove Assistance takes a block away.',
      },
      {
        q: 'How do I add a type of training?',
        a: 'In Assistance Settings, press the edit button of the Training row of the Assistance Types table (there is one for crop and one for fisheries). The window lists the types of training; add, rename or delete them there. The Type of Training box appears when Training is chosen in an assistance form.',
      },
      {
        q: 'How do I add a type of seed, fertilizer, equipment, feed, fingerlings or fishing gear?',
        a: 'In Assistance Settings, find the row of that assistance in the Assistance Types table and open its menu: Edit Types of Seed, Edit Types of Fertilizer, Edit Types of Equipment, Edit Types of Feed, Edit Types of Fingerlings or Edit Types of Fishing Gear. Add, rename or delete the names in the window. They are the choices of the item box of that assistance when you distribute it or import it, followed by Other. Each list started as a copy of the crops, input types, feed types and species at the time it was introduced and no longer follows them. Renaming or deleting a name never changes assistance already recorded. A name cannot be added twice to the same list, whatever its capitals, spaces or punctuation.',
      },
      {
        q: 'Why does the system refuse a name I add in a settings page?',
        a: 'Every list in the settings (assistance types, source agencies, seed sources, categories, species, feed types, equipment types, activity types, classifications, signatories and the others) accepts a name once. "Rice  Seed", "rice seed" and "Rice-Seed" count as the same name, so the second one is refused with a message naming the entry that already has it. Edit that entry instead, or choose a different name.',
      },
      {
        q: 'Do people have to confirm that they received assistance?',
        a: 'No. Nobody has to confirm anything. When you distribute you give the date, time and place to claim it, and people with an account are told right away. It shows Scheduled (under Current) until that date and time, then Received (under History). If someone did not claim it, open the distribution and press Remove (not claimed) beside the name: the entry is kept for audit but leaves the list and the reports. What cooperatives confirmed for members before this change is under Earlier Confirmations on their profile.',
      },
      {
        q: 'Why was a member blocked?',
        a: 'A person who already received the same assistance type from a different cooperative in the last 30 days cannot receive it again from another one. Only one cooperative\'s distribution of that type counts per person in that window.',
      },
      {
        q: 'I imported the wrong file. Can I undo it?',
        a: 'Yes. In the Import dialog choose Undo a recent import to review and reverse a recent import.',
      },
      {
        q: 'Can I print or download the assistance history?',
        a: 'Yes. On the History tab of Crop Assistance and Fisheries Assistance, Print Report and Download Report give the list as filtered, and the three dots of a row print or download that one distribution with the people who received it. A farmer\'s or fisherfolk\'s own history (View Assistance History on the profile) and a cooperative\'s History tab have the same two buttons.',
      },
    ],
  },
  {
    title: 'Reports',
    items: [
      {
        q: 'How do I print or download a report?',
        a: 'Open Reports and choose the report in the Report type box; the filters below it change with the report, so set the period and the rest there. The paper preview under the buttons shows the report as it will print and changes as you change the filters. Print Report prints it and Download Report saves it as a PDF: both are the report you see in the preview.',
      },
      {
        q: 'How do I get the report of just one farmer, fisherfolk or cooperative?',
        a: 'In Reports, choose the Registered report (or Cooperative Assistance) and either search for the person or cooperative, or click their row in the paper preview. When your search leaves exactly one record, or when you click a row, the report becomes that one record\'s individual report and a bar above says so. Press Show all records to go back to the list; if the search found it, clear the search instead. Print Report and Download Report then give the individual report.',
      },
      {
        q: 'How do I choose who signs a report?',
        a: 'Above the Print Report and Download Report buttons, the Signatories block shows who signs each line: Prepared by (your own name to start with), Checked by, Noted by and Approved by. Press Enter Signatories to open a table with a row for each line. In a row, pick a saved signer or type a name, and fill in the Position / Designation. Your own Prepared by line starts as Administrator or Focal Person, depending on your account, and you can change it. A line with no name is left off. The signers are printed under their lines at the foot of the printed and downloaded report. What you enter is for that printout only, so enter it again the next time. The saved signers are the list the Admin keeps.',
      },
      {
        q: 'How do I force harvest crops before a typhoon?',
        a: 'From Crop Monitoring, open the menu of one of the crops and choose Force Harvest. The window lists the crops of that farmer that are not ready yet, on every parcel, with the crop you chose already ticked. Choose the harvested date and the reason, tick the crops, type the area of each one and its quantity in the Qty / Unit box, picking the unit it was counted in (kg, sacks, cavan or whatever that crop allows; the kg it comes to shows under it), then press Review Force Harvest, check the tables and press Confirm Force Harvest. On Crop Records the menu of a parcel does the same for that parcel only. The red FORCED HARVEST label on a harvested crop opens the saved details.',
      },
      {
        q: 'Can I print one parcel or one production cycle?',
        a: 'A parcel: yes. On Crop Records, open its ⋮ menu and choose Print report; it prints the details of that parcel and its crop records. A production cycle: on a phone, press Print on its card in Aquaculture Monitoring. On a computer there is no print button for one cycle in the office pages; use Reports for the printed lists.',
      },
      {
        q: 'Can I print or download the crop and fisheries tables?',
        a: 'Yes, on Capture Monitoring. Crop Records, Crop Monitoring and Aquaculture Monitoring no longer have these two buttons above the table (one parcel still prints from its three-dot menu); for the other lists use Reports. On Capture Monitoring, Print Report prints, and Download Report saves as a PDF, every row that the search and filters match, not only the page on screen, with the filters and date range written under the title. Both give the same report, so set the filters first.',
      },
      {
        q: 'How do I filter by date?',
        a: 'Open Filters and use the From and To dates: Planted on Crop Records and Crop Monitoring, Stocked on Aquaculture Monitoring, Trip on Capture Monitoring, and Registered on the farmers, fisherfolk and cooperative tables. Both ends are included and either can be left empty. The To date cannot be before the From date.',
      },
      {
        q: 'Can I print or download the farmer, fisherfolk or cooperative list?',
        a: 'Yes, in Reports: choose the Registered report, then press Print Report to print or Download Report to save it as a PDF. The Farmers, Fisherfolk and Cooperatives tables no longer have report buttons of their own, so set the filters in Reports: search, Barangay, sex, type, senior citizens, ICC/IP, PWD, 4Ps and the registered dates (the ones the table has). It is the same PDF as Reports > Registered.',
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
        a: 'No. Every form that you type into (registering, adding, editing, logging a catch, feeding or health entry, starting a production cycle, reporting a disaster, distributing assistance, the settings forms and the rest) keeps what you typed in this browser. Open the form again and it is back, with a yellow note and a Discard draft button to start over; a new row in a settings table comes back open with its text. A draft is cleared when you save it, discard it or sign out. A chosen photo is not kept, so choose it again. Sign-in and password boxes, search boxes and file imports are never kept.',
      },
      {
        q: 'What can a Focal Person do compared with an Admin?',
        a: 'Both register and manage farmers, fisherfolk, cooperatives, crop records, monitoring, disasters, assistance and reports. Only an Admin manages the lists under Admin (Crop Settings, Fisheries Settings, Activity Settings, Assistance Settings, Classification Settings, Harvest Unit Settings), Signatories, User Management and the Audit Log and Backup & Restore, and only an Admin deletes crop records.',
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
        q: 'Where do I keep the names that sign the reports?',
        a: 'Admin > Signatories. Press Add Signatory under the table, type the name and the position that is printed under it in the new row, choose the signing role (Prepared by, Checked by, Noted by or Approved by), then press Save. Add a person once for each role they sign in. Turn off Active to stop offering a name without deleting it. These are the names offered in the Signatories block of the Reports pages.',
        roles: ADMIN,
      },
      {
        q: 'How do I give someone an account?',
        a: 'Admin > User Management. Create the account and choose its role. Farmers, fisherfolk and cooperatives get their own accounts from their record.',
        roles: ADMIN,
      },
      {
        q: 'Why does a page take a moment the first time I open it?',
        a: 'Each page is loaded when you first open it, and a list asks the server only for the rows it shows. The first visit to a page is therefore the slowest; after that it opens faster. If a list keeps loading for a long time, check the internet connection and reload the page.',
      },
    ],
  },
]

const allowed = (item, role) => !item.roles || item.roles.includes(role)

// What the given account sees: the sections that have anything left for it.
export function helpFor(role) {
  const sections = SECTIONS
    .map((section) => ({ ...section, items: section.items.filter((item) => allowed(item, role)) }))
    .filter((section) => section.items.length > 0)
  return { sections }
}
