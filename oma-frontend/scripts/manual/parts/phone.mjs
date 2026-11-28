// Phone-size pictures (390 x 844) of the Farmer, Fisherfolk and Cooperative accounts, with the sign-in page.
import { FA, FI, O } from './common.mjs'

const NAV = { css: 'nav[aria-label="Main navigation"]' }
const BELL = { find: { css: 'button[aria-label*="otification"]' }, label: 'Bell', desc: 'Your notices. A number on it says how many are new.' }
const BOTTOM = (items) => ({ find: NAV, label: 'Bottom menu', desc: `${items} The open one is highlighted. More holds everything else, and Log out.` })
const TODO = { find: { text: 'To do today', tag: 'h2', closest: 'section' }, label: 'To do today', desc: 'What needs you now, with a big button for each.' }
const ROW1 = (label, desc) => ({ find: { css: 'main li', nth: 0 }, label, desc })

export const PHONE = [
  { id: 'login', audience: 'all', anon: true, file: 'login.png', url: '/login', wait: 3500, title: 'Sign in', purpose: 'Every account signs in here.',
    callouts: [
      { find: { css: '#login-email' }, label: 'Email', desc: 'Your email address. Staff may also type their username.' },
      { find: { css: '#login-password' }, label: 'Password', desc: 'Your password. There is no self-registration: the Office of the Municipal Agriculturist creates your account.' },
      { find: { css: 'button[aria-label="Show password"]' }, label: 'Show password', desc: 'Shows or hides what you typed, to check it.' },
      { find: { text: 'Sign in', tag: 'button', exact: true }, label: 'Sign in', desc: 'Opens your account. It stays disabled until both boxes are filled.' },
      { find: { text: 'Forgot password?', tag: 'a', exact: true }, label: 'Forgot password?', desc: 'Asks for your email and sends it a link to set a new password. The link works once, for 30 minutes.' },
      { find: { text: 'No account yet', tag: 'p' }, label: 'Help signing in', desc: 'With no account, or if the email does not arrive, visit the Office of the Municipal Agriculturist with a valid ID.' },
    ] },
  { id: 'login-phone', audience: 'all', anon: true, phone: true, file: 'login-phone.png', url: '/login', wait: 3500, title: 'Sign in on a phone', purpose: 'The same page at phone size.',
    callouts: [
      { find: { css: '#login-email' }, label: 'Email', desc: 'Your email address. Staff may also type their username.' },
      { find: { css: '#login-password' }, label: 'Password', desc: 'Your password.' },
      { find: { css: 'button[aria-label="Show password"]' }, label: 'Show password', desc: 'The eye shows or hides what you typed.' },
      { find: { text: 'Sign in', tag: 'button', exact: true }, label: 'Sign in', desc: 'Opens your account.' },
      { find: { text: 'Forgot password?', tag: 'a', exact: true }, label: 'Forgot password?', desc: 'Sends a link to your email to set a new password.' },
    ] },

  // ───────────────────────────── Farmer ─────────────────────────────
  FA({ id: 'farmer-p-home', phone: true, file: 'farmer/phone-home.png', url: '/my-account', wait: 7000, height: 1300, title: 'Home on a phone (Farmer)', purpose: 'The same Home, with the menu along the bottom.',
    callouts: [
      BELL, TODO,
      { find: { text: 'My crops', tag: 'h2', closest: 'section' }, label: 'My crops', desc: 'Your crops in the field.' },
      BOTTOM('Home, Crops, Assistance, Disasters and More.'),
    ] }),
  FA({ id: 'farmer-p-crops', phone: true, file: 'farmer/phone-crops.png', url: '/crop-monitoring', wait: 6000, title: 'Crops on a phone (Farmer)', purpose: 'One card per crop.',
    callouts: [
      { find: { css: 'main input[type=search]' }, label: 'Search box', desc: 'Narrows the cards to a crop or a place.' },
      ROW1('A crop', 'The crop, its status, its place and harvest date, with Log activity (or Record harvest) and Details as big buttons.'),
      BOTTOM('Home, Crops, Assistance, Disasters and More.'),
    ] }),
  FA({ id: 'farmer-p-assistance', phone: true, file: 'farmer/phone-assistance.png', url: '/crop-assistance', wait: 6000, title: 'Assistance on a phone (Farmer)', purpose: 'Answer for assistance with one tap.',
    callouts: [
      ROW1('Assistance waiting for you', 'Received or Not received, right on the card.'),
      BOTTOM('Home, Crops, Assistance, Disasters and More.'),
    ] }),
  FA({ id: 'farmer-p-more', phone: true, file: 'farmer/phone-more.png', url: '/more', wait: 5000, title: 'More on a phone (Farmer)', purpose: 'The fifth tab of the bottom menu.',
    callouts: [
      { find: { css: 'main ul' }, label: 'Pages', desc: 'Forecast, Borrow equipment, My profile, Help and Log out.' },
      BOTTOM('Home, Crops, Assistance, Disasters and More.'),
    ] }),

  // ───────────────────────────── Fisherfolk ─────────────────────────────
  FI({ id: 'fisherfolk-p-home', phone: true, file: 'fisherfolk/phone-home.png', url: '/my-account', wait: 7000, height: 1200, title: 'Home on a phone (Fisherfolk)', purpose: 'The same Home, with the menu along the bottom.',
    callouts: [
      BELL, TODO,
      { find: { text: 'My cycles', tag: 'h2', closest: 'section' }, label: 'My cycles', desc: 'Your cycles in the water.' },
      BOTTOM('Home, Cycles, Assistance, Disasters and More.'),
    ] }),
  FI({ id: 'fisherfolk-p-cycles', phone: true, file: 'fisherfolk/phone-cycles.png', url: '/fisheries-monitoring', wait: 6000, title: 'Cycles on a phone (Fisherfolk)', purpose: 'One card per cycle.',
    callouts: [
      { find: { text: 'Start a cycle', tag: 'button', exact: true }, label: 'Start a cycle', desc: 'A new production cycle.' },
      ROW1('A cycle', 'The species and cycle, its status, place and harvest date, with Log activity (or Record harvest) and Details.'),
      BOTTOM('Home, Cycles, Assistance, Disasters and More.'),
    ] }),
  FI({ id: 'fisherfolk-p-disasters', phone: true, file: 'fisherfolk/phone-disasters.png', url: '/disaster', wait: 7000, title: 'Disasters on a phone (Fisherfolk)', purpose: 'Report by the pond, with the phone camera.',
    callouts: [
      { find: { text: 'Report a disaster', tag: 'button', exact: true }, label: 'Report a disaster', desc: 'Opens the report; Take Photo uses the phone camera.' },
      ROW1('A report', 'The disaster, the stock and the date, with Mark recovered and Details.'),
      BOTTOM('Home, Cycles, Assistance, Disasters and More.'),
    ] }),

  // ───────────────────────────── Cooperative ─────────────────────────────
  O({ id: 'org-p-home', phone: true, file: 'org/phone-home.png', url: '/my-account', wait: 7000, title: 'Home on a phone (Cooperative)', purpose: 'The same Home, with the menu along the bottom.',
    callouts: [
      BELL, TODO,
      BOTTOM('Home, Members, Assistance, Equipment and More.'),
    ] }),
  O({ id: 'org-p-members', phone: true, file: 'org/phone-members.png', url: '/my-organization', wait: 6000, title: 'Members on a phone (Cooperative)', purpose: 'One card per member.',
    callouts: [
      { find: { text: 'Log activity', tag: 'button', exact: true }, label: 'Log activity', desc: 'Records farm work for members who have no activated account: choose it once, then tick their crops or cycles.' },
      { find: [{ text: 'Import', tag: 'button', exact: true }, { text: 'Add member', tag: 'button', exact: true }], label: 'Import / Add member', desc: 'Add several members at once by searching and picking each, or from a spreadsheet.' },
      ROW1('A member', 'The name, the position and the date joined.'),
      BOTTOM('Home, Members, Assistance, Equipment and More.'),
    ] }),
  O({ id: 'org-p-equipment', phone: true, file: 'org/phone-equipment.png', url: '/my-organization?tab=borrowed', wait: 6000, title: 'Equipment on a phone (Cooperative)', purpose: 'Answer borrow requests with one tap.',
    callouts: [
      { find: { css: 'main [role=tablist]' }, label: 'Items / Loans', desc: 'The number on Loans is how many requests wait.' },
      ROW1('A loan', 'Approve or Reject a request; Mark returned when the units come back.'),
      BOTTOM('Home, Members, Assistance, Equipment and More.'),
    ] }),
]
