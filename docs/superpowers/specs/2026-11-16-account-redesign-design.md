# Farmer, Fisherfolk and Organization accounts: redesign

Date: 2026-11-16
Status: design, waiting for the owner's review

## Goal

Make the three own-record accounts (farmer, fisherfolk, organization) easy enough and dependable enough that people adopt them. The accounts must look and behave as one product: the same menu, list, table, badge, button and profile patterns in all three.

Success means:

- A person opening the account on a phone sees what needs them first and can act on it in one tap.
- The same kind of thing looks the same in every account, on a phone and on a computer.
- A failed request never looks like a real value, and every save is visibly confirmed.
- Nothing about what is stored, who may do what, or how the forms save changes.

## Decisions the owner made

| Question | Answer |
|---|---|
| Depth | Task-first rework: same features and data, no database change |
| Main device | Phone for all three accounts; the computer shows the same content wider |
| Language | English, in shorter and plainer words |
| Build approach | One shared account kit; Home and every list rebuilt on it; existing forms and windows kept; office pages unchanged |

## What is wrong today (seen on the test copy, 2026-11-16)

- Home leads with three charts. The one actionable item ("1 crop needs attention") sits under them. The organization Home is charts plus six shortcuts that repeat the menu.
- Farmers and fisherfolk get office-shaped pages. Crop Monitoring shows a farmer their own records under Farm Parcel / Farmer / Barangay columns, grouped by parcel, with a row "No farm parcel on file".
- The same thing differs between accounts: Members and Equipment are plain lists while Assistance is a green-header table; farmer Disaster opens a two-step picker while fisherfolk Disaster opens on a form; the farmer profile uses round icon buttons with a colour legend while the organization profile uses "Request change" links.
- In My Organization the search and list are narrower than their card and the buttons sit off to the right.
- Equipment is in the computer menu for members but not in the phone tabs.
- A failed request on Home can show as a zero (parcels and disasters are fetched with a silent fallback).
- Phone text goes as small as 9.5px.

## Concept: what needs me, then my records

### Menu

Five entries per account, same names and order on the phone tab bar and the computer sidebar. Both are built from one definition file.

| Account | Entries |
|---|---|
| Farmer | Home, Crops, Assistance, Disasters, More |
| Fisherfolk | Home, Cycles, Assistance, Disasters, More |
| Organization | Home, Members, Assistance, Equipment, More |

More holds the rest:

- Farmer and fisherfolk: Forecast, Borrow equipment (only for a member of an organization), My profile, User Manual, Log out.
- Organization: Officers, Organization profile, User Manual, Log out.

On a phone More is a screen of rows. On a computer the sidebar shows More as a group that opens in place. The initials menu in the phone header is removed; the notification bell stays.

### Home

In this order:

1. A one-line greeting with the name and the account type.
2. **To do**: only things the person can act on, most urgent first, each a card with its own button. When nothing is waiting: one line saying so.
3. A short list of what is active (crops, cycles, or the member count with a link).
4. One compact summary strip of three or four figures.

The three charts leave Home. Their figures stay reachable on the Forecast page.

To-do items and where each comes from (all existing, own-record-scoped endpoints):

| Account | Item | Button |
|---|---|---|
| Farmer, fisherfolk | Assistance awaiting confirmation | Received / Not received |
| Farmer | Activity due today or overdue (crop suggestions) | Log activity |
| Farmer, fisherfolk | Crop or cycle that may be harvested | Record harvest |
| Farmer, fisherfolk | Borrowed equipment past its return-by date | View loan |
| Organization | Members without an account waiting on a confirmation | Confirm for members |
| Organization | Borrow requests waiting for a decision | Review request |
| Organization | Loans past their return-by date | View loan |

If the plan finds that an item has no existing endpoint, the item is dropped or the owner is asked before any endpoint is added.

### One list pattern

Every list in the accounts is the same component, given one column definition:

- Phone: a row per record with the name first, up to two lines of detail, a status badge at the right, and at most two buttons (one green main action, plus Details).
- Computer: the same fields as table columns in the same order, with the green header the office tables use, the status badge in a Status column and the buttons in a last Action column.
- Sections ("Growing (1)", "Harvested (1)") group rows on both.
- Office-only columns (Farmer, Farm Parcel grouping, record locks) are not shown to the account owner.

### Pages

| Account | Page | Sections or tabs | Main button |
|---|---|---|---|
| Farmer | Crops | Growing, Ready to harvest, Harvested | Log activity, or Record harvest once allowed |
| Farmer | Assistance | Waiting for you, History | Received / Not received |
| Farmer | Disasters | My reports | Report a disaster |
| Farmer | Forecast (More) | One table: crop, expected and actual harvest, estimated and actual yield | none |
| Farmer | Borrow equipment (More) | Available, My loans | Ask to borrow |
| Fisherfolk | Cycles | Growing, Ready to harvest, Harvested | Start cycle; Log activity or Record harvest per row |
| Fisherfolk | Assistance, Disasters, Forecast, Borrow equipment | As for the farmer | As for the farmer |
| Organization | Members | Active, Inactive | Add member (Import beside it) |
| Organization | Assistance | To do, History, Confirm for members | Distribute assistance |
| Organization | Equipment | Items, On loan (with requests), History | Add equipment |
| Organization | Officers (More) | Current, History | Assign officer |

Changes in concept:

- My Organization's six tabs are split: Members and Equipment become menu entries, Officers moves to More, and Confirmed for Members becomes part of the Confirm for members tab on Assistance. No screen has more than three tabs.
- Disasters behave the same for farmer and fisherfolk: the page opens on the list of past reports, and reporting is two steps (choose what was affected, then the details).
- The organization's two Distribute buttons become one "Distribute assistance" that first asks: one member or all members.

### Details

Tapping Details opens one screen per record: the facts, then the history (activities, harvests, health logs, loans), then the action buttons. The buttons open the existing windows unchanged (Log Activity, Record Harvest, Force Harvest, Log Disaster, Lend, Mark returned, Distribute, Confirm).

### Profile

One layout for all three accounts: a header (photo or logo, name, account type, ID number), then sections of rows. Each row is a label, a value and a plain-word action:

- **Edit**: saves at once (photo or logo, contact number).
- **Request change**: the office approves; the row shows "Waiting for approval" until then.
- **Fixed**: a lock, no action (RSBSA number, registration details).

Password and Log out are at the bottom. The colour legend and the round icon buttons are removed.

## Format rules

- Dates read "Nov 16, 2026". Numbers carry their unit and are right-aligned in tables. An empty value is "—".
- Four badge tones: green (fine or done), amber (waiting on you), red (a problem), grey (finished or inactive). Every status in the accounts maps to one of them in one place.
- A page is: heading, one helper line, search and filters, the list. The main button is at the top right on a computer and full-width under the search on a phone.
- Crop green for farmer and farmers' organization accounts, fisheries blue for fisherfolk and fisherfolk organization accounts, as today.
- Phone: buttons at least 44px tall, no text under 13px.
- Wording: short plain English, sentence case, verb-first buttons, no "successfully" or "please".

## Reliability rules

- Every list and every Home section has three states: loading (placeholder rows), failed ("Couldn't load. Try again" with a button), and empty (says what to do next). A failed part is shown as failed, never as zero or as empty.
- A button locks while it saves. Afterwards a message names what was saved and the row updates without a reload.
- Forms, windows, drafts, permissions and endpoints are unchanged. No backend change, no migration and no SQL are expected.
- Every address that exists today still works: it is either kept or redirects (for example `/my-organization?tab=equipment`, `/crop-assistance?tab=confirm`, `/crop-monitoring?record=ID`, `/disaster?crop=ID`, and the links inside notifications).

## How it is built

A new folder `oma-frontend/src/pages/Account/` holds the kit and the account screens.

Kit (each piece small and tested on its own):

- `accountNav.js`: the menu of each account; the phone tab bar and the sidebar both read it.
- `AccountPage`: heading, helper line, main button.
- `RecordList`: one column definition in, phone rows or a computer table out, with sections, loading, failed and empty states.
- `StatusBadge` and `statusTone.js`: the four tones and the status-to-tone map.
- `TodoCard` and `todoRules.js`: pure functions that turn fetched records into ordered to-do items.
- `DetailScreen`, `ProfileRow`, `MoreScreen`.

Screens: the account's list views are their own components. A route that both the office and an account use (for example `/crop-monitoring`) renders the account screen for the account and the office page for staff, so addresses do not change. The account screens import the existing windows; where a window lives inside a large office file, it is moved to its own file without changing it.

The office pages keep their current look. Their `isFarmer` / `isFisherfolk` / `isOrg` branches are removed only once the account screen that replaces them is merged.

## Out of scope

- New features, new permissions, new data, or a second language.
- The office (Admin and Focal Person) pages.
- The windows and forms themselves, beyond wording.
- The login and account-activation screens.

## Build order (one pull request each)

1. The kit, the menu with More, and Home for all three accounts.
2. Farmer: Crops, Assistance, Disasters, Forecast.
3. Fisherfolk: Cycles, Assistance, Disasters, Forecast.
4. Organization: Members, Assistance, Equipment, Officers.
5. Profile for all three, the wording pass, Help text, User Manual pictures re-shot.

Each is usable on its own. Until a later step lands, the pages it covers keep their current look inside the new menu.

## Testing

- Kit pieces and `todoRules.js` are written test-first (`node --test`).
- The backend suite must not change: same pass count, same five known failures.
- Every changed screen is checked for each account at 390px and 1440px on the scratch stack (MariaDB 3307, Django 8001, Vite 5174), never on the live database.
- Each step checks the three states (loading, failed, empty) by holding or failing requests in the browser.

## Risks

- The shared office pages are large (Crop Monitoring is 2,375 lines). Moving windows out of them must not change the office view; each move is verified against the office page.
- The User Manual pictures for these accounts are out of date until step 5.
- Steps 2 to 4 leave the accounts in a mixed state between merges (new Home and menu, some old pages).
