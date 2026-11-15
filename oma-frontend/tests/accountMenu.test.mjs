import assert from 'node:assert/strict'
import fs from 'node:fs'

// The account menu on the screen: the phone tab bar, the computer sidebar and the More page all read accountNav.js.
let n = 0
const ok = (v, label) => { assert.ok(v, label); n++ }
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const shell = read('../src/pages/Citizen/CitizenPhoneShell.jsx')
ok(shell.includes('accountNav(') && shell.includes('activeNavKey('), 'the phone tabs come from the one menu definition')
ok(!shell.includes('TABS_BY_ROLE'), 'no second list of tabs')
ok(shell.includes('showMenu={false}'), 'no initials menu in the phone header')
const sidebar = read('../src/components/Layout/Sidebar.jsx')
ok(sidebar.includes('accountNav(') && sidebar.includes('activeNavKey(') && !/FARMER_NAV|FISHERFOLK_NAV|orgNav\b/.test(sidebar), 'the sidebar reads the same definition')
ok(sidebar.includes('GROUPS') && sidebar.includes('ADMIN_GROUP') && sidebar.includes('DASHBOARD_ITEM'), 'the office menu is still there')
const chrome = read('../src/pages/Citizen/FarmerChrome.jsx')
ok(/showMenu/.test(chrome), 'the header can hide its menu')
ok(!chrome.includes('text-[9.5px]'), 'tab labels are no longer 9.5px')
const tabBar = chrome.slice(chrome.indexOf('export function FarmerTabBar'), chrome.indexOf('// ─── Desktop'))
ok(tabBar.includes('md:hidden') && !tabBar.includes('sm:hidden'), 'the tab bar shows wherever the phone layout does (under 768px): it is the only menu there')
const more = read('../src/pages/Account/MoreScreen.jsx')
ok(more.includes('accountNav(') && more.includes('.more'), 'More lists the More entries')
ok(more.includes('Log out') && more.includes('ConfirmDialog'), 'Log out is on More and asks first')
ok(more.includes('min-h-[52px]'), 'More rows are easy to tap')
ok(!/text-\[(9|10|11|12)(\.\d+)?px\]/.test(more), 'no text under 13px on More')
const app = read('../src/App.jsx')
const moreRoute = app.slice(app.indexOf('path="/more"'), app.indexOf('path="/more"') + 260)
ok(app.includes('path="/more"') && moreRoute.includes('<MoreScreen'), 'the More route')
ok(/allowedRoles=\{\["CITIZEN"\]\}/.test(moreRoute), 'only an account may open More')
console.log(`ok - ${n} assertions`)
