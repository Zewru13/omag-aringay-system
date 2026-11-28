// The common questions of the farmer, fisherfolk and organization accounts, shown in their Help. They name the pages and
// buttons these accounts have now (the menu: Home, then Crops / Cycles / Members, Assistance, Disasters / Equipment, More).

export const HELP = {
  farmer: {
    faq: [
      { key: 'home', q: 'What does Home show?', a: 'To do today lists what needs you now: assistance to claim, activities that are due, a crop ready to harvest and borrowed equipment that is overdue. Each has its own button. Below it are your crops and a short summary.' },
      { key: 'log-activity', q: 'How do I log a crop activity?', a: 'Open Crops and press Log activity on the crop. Choose the activity, the date and any notes, then save. You can also press Log activity on Home when an activity is due.' },
      { key: 'log-many', q: 'I did the same work on many crops. Do I log them one by one?', a: 'No. On Crops press Log activity on many crops (it shows when you have more than one growing crop). Choose the activity and the date, tick the crops, then press Log on crops. It is saved on every crop you ticked. If one crop cannot take it, for example it was planted after that date, the message names it and nothing is saved: untick it and try again.' },
      { key: 'record-harvest', q: 'When can I record a harvest?', a: 'Record harvest appears on a crop once half of its growing time has passed. Press it, enter what you harvested, then save. Before then, the button explains why it is not ready.' },
      { key: 'force-harvest', q: 'Can I harvest a crop early because of a storm?', a: 'Yes. Open Details on a crop that is still growing and press Force harvest. Choose why, tick the crops, type the area and yield of each, then review and save. The office is told.' },
      { key: 'disaster', q: 'How do I report a disaster?', a: 'Open Disasters and press Report a disaster. Tick the crops that were damaged, then fill in what happened once for all of them. Mark recovered closes a report once the crop is back to normal. A crop that is already harvested cannot be reported.' },
      { key: 'assistance', q: 'When and where do I claim my assistance?', a: 'Open Assistance, or look at To do today on Home. It shows the date, the time and the place to claim it. There is nothing for you to answer: after that time it shows as Received. If you could not claim it, tell the office or your cooperative.' },
      { key: 'forecast', q: 'Where is the forecast?', a: 'Open More, then Forecast. It shows when each crop should be ready, and how past harvests compared with their estimate.' },
      { key: 'profile', q: 'How do I change my name or barangay?', a: 'Open More, then My profile. Press Request change on the detail. The office checks it first, and the row says Waiting for approval until then.' },
    ],
  },
  fisherfolk: {
    faq: [
      { key: 'home', q: 'What does Home show?', a: 'To do today lists what needs you now: assistance to claim, a cycle ready to harvest and borrowed equipment that is overdue. Each has its own button. Below it are your cycles and a short summary.' },
      { key: 'start-cycle', q: 'How do I start a production cycle?', a: 'Open Cycles and press Start a cycle. Choose the species and culture system, then add each pond or cage with its size and the fingerlings stocked.' },
      { key: 'log-many', q: 'I fed or checked the ponds of many cycles. Do I log them one by one?', a: 'No. On Cycles press Log on many cycles (it shows when you have more than one growing cycle). Choose Feeding Log or Health Log, fill in the date and the details once, then tick. For feeding, tick the cycles and type the kg of each pond or cage, or type one kg in the Same kg box and press Fill. For health, tick the ponds and cages (and type how many fish died in each when it is Fish Mortality). It is saved on all of them. If one cannot be saved, for example a pond that already has a Health Log in that cycle, the message names it and nothing is saved: untick it and try again.' },
      { key: 'logs', q: 'How do I log feeding or fish health?', a: 'Open Cycles and press Log activity on the cycle. Choose Feeding Log or Health Log, fill it in, then save. Details shows every log of the cycle.' },
      { key: 'record-harvest', q: 'When can I record a harvest?', a: 'Record harvest appears on a cycle once half of its culture time has passed, or sooner when a Health Log asked for a force harvest. Choose the ponds or cages you harvested, then save.' },
      { key: 'details', q: 'Where are my ponds and cages?', a: 'Press Details on a cycle. It lists the ponds and cages, and holds Activity logs, Edit, Print and Force harvest.' },
      { key: 'disaster', q: 'How do I report a disaster?', a: 'Open Disasters and press Report a disaster. Tick the ponds or cages that were affected and say what happened. Saving also sends it to the office.' },
      { key: 'assistance', q: 'When and where do I claim my assistance?', a: 'Open Assistance, or look at To do today on Home. It shows the date, the time and the place to claim it. There is nothing for you to answer: after that time it shows as Received. If you could not claim it, tell the office or your cooperative.' },
      { key: 'profile', q: 'Where are the forecast and my profile?', a: 'Open More. Forecast shows when each cycle should be ready; My profile holds your details, your password and Log out.' },
    ],
  },
  org: {
    faq: [
      { key: 'home', q: 'What does Home show?', a: 'To do today lists what needs your cooperative now: borrow requests and overdue loans. Each opens the list where you act on it.' },
      { key: 'members', q: 'How do I add members?', a: 'Open Members and press Add member, then search for a registered person. Import adds many members from a spreadsheet.' },
      { key: 'log-members', q: 'Can I record farm work for a member who cannot?', a: 'Yes, for members who have no activated account. Open Members and press Log activity, choose the work and the date once, tick their crops (or cycles), then save. A member with an activated account records their own.' },
      { key: 'equipment', q: 'How do I keep our equipment list?', a: 'Open Equipment. Items lists what you own; Details on an item changes its condition, records a repair, lends it or shows its history. Add equipment and Import are at the top.' },
      { key: 'loans', q: 'How do I handle borrow requests and returns?', a: 'Open Equipment, then Loans. Press Approve or Reject on a request. When units come back, press Mark returned and say what condition they are in.' },
      { key: 'distribute', q: 'How do I record assistance we give?', a: 'Open Assistance and press Distribute assistance. Choose one member or all members, then say what is given and the date, time and place to claim it. Members with an account are told right away. It stays under Scheduled until that time, then moves to History.' },
      { key: 'unclaimed', q: 'What if a member did not claim their assistance?', a: 'On Assistance, click the row to see its members and press Remove from the list beside that person. Nobody has to answer anything: whoever stays on the list shows as Received after the date and time.' },
      { key: 'officers', q: 'How do I assign officers?', a: 'Open More, then Officers. Press Assign officer and pick an active member. End term early frees a position before you give it to someone else.' },
      { key: 'profile', q: 'How do I change our cooperative details?', a: 'Open More, then Cooperative profile. The logo and contact number change at once. Press Request change for the rest; the Admin and the Focal Person both approve it.' },
    ],
  },
}
