import assert from 'node:assert/strict'

// The one menu of the farmer, fisherfolk and organization accounts: five entries, the same on the phone tab bar and the computer sidebar.
const { accountKind, accountNav, activeNavKey, accountTheme } = await import(new URL('../src/pages/Account/accountNav.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
const pairs = (list) => list.map((e) => [e.label, e.to])

eq(accountKind({ isFarmer: true }), 'farmer', 'farmer')
eq(accountKind({ isFisherfolk: true }), 'fisherfolk', 'fisherfolk')
eq(accountKind({ isOrg: true, orgType: 'FARMERS_ORG' }), 'orgFarm', 'farmers organization')
eq(accountKind({ isOrg: true, orgType: 'FISHERFOLK_ORG' }), 'orgFish', 'fisherfolk organization')
eq(accountKind({}), null, 'staff has no account menu')

eq(pairs(accountNav('farmer').main), [['Home', '/my-account'], ['Crops', '/crop-monitoring'], ['Assistance', '/crop-assistance'], ['Disasters', '/disaster'], ['More', '/more']], 'farmer menu')
eq(pairs(accountNav('farmer').more), [['Forecast', '/forecasting'], ['My profile', '/my-profile'], ['Help', '/my-help'], ['User Manual', '/manual']], 'farmer More, not a member')
eq(pairs(accountNav('farmer', { isMember: true }).more), [['Forecast', '/forecasting'], ['Borrow equipment', '/my-equipment'], ['My profile', '/my-profile'], ['Help', '/my-help'], ['User Manual', '/manual']], 'a member can borrow')
eq(pairs(accountNav('fisherfolk').main), [['Home', '/my-account'], ['Cycles', '/fisheries-monitoring'], ['Assistance', '/fisheries-assistance'], ['Disasters', '/disaster'], ['More', '/more']], 'fisherfolk menu')
eq(pairs(accountNav('fisherfolk').more)[0], ['Forecast', '/fisheries-forecasting'], 'fisherfolk forecast')
eq(pairs(accountNav('orgFarm').main), [['Home', '/my-account'], ['Members', '/my-organization'], ['Assistance', '/crop-assistance'], ['Equipment', '/my-organization?tab=equipment'], ['More', '/more']], 'farmers organization menu')
eq(pairs(accountNav('orgFish').main)[2], ['Assistance', '/fisheries-assistance'], 'fisherfolk organization assistance')
eq(pairs(accountNav('orgFarm').more), [['Officers', '/my-organization?tab=officers'], ['Organization profile', '/my-profile'], ['Help', '/my-help'], ['User Manual', '/manual']], 'organization More')
for (const kind of ['farmer', 'fisherfolk', 'orgFarm', 'orgFish']) {
  const nav = accountNav(kind, { isMember: true })
  eq(nav.main.length, 5, `${kind}: five entries`)
  assert.ok([...nav.main, ...nav.more].every((e) => e.key && e.icon && e.label && e.to.startsWith('/'))); n++
}

const farmer = accountNav('farmer', { isMember: true })
eq(activeNavKey(farmer, '/my-account'), 'home', 'home')
eq(activeNavKey(farmer, '/crop-monitoring', '?record=4'), 'crops', 'a deep link stays on Crops')
eq(activeNavKey(farmer, '/forecasting'), 'more', 'a More page lights More')
eq(activeNavKey(farmer, '/my-equipment'), 'more', 'borrow equipment is under More')
eq(activeNavKey(farmer, '/more'), 'more', 'More itself')
eq(activeNavKey(farmer, '/my-help'), 'more', 'Help is under More')
eq(activeNavKey(farmer, '/users'), null, 'an address outside the menu lights nothing')
const org = accountNav('orgFarm')
eq(activeNavKey(org, '/my-organization'), 'members', 'members is the default tab')
eq(activeNavKey(org, '/my-organization', '?tab=equipment'), 'equipment', 'equipment tab')
eq(activeNavKey(org, '/my-organization', '?tab=borrowed'), 'equipment', 'loans belong to Equipment')
eq(activeNavKey(org, '/my-organization', '?tab=borrowed-history'), 'equipment', 'loan history too')
eq(activeNavKey(org, '/my-organization', '?tab=officers'), 'more', 'officers is under More')
eq(activeNavKey(org, '/my-organization', '?tab=confirmed'), 'members', 'the old confirmed tab stays with Members for now')

eq(accountTheme('farmer'), 'crop', 'green'); eq(accountTheme('orgFarm'), 'crop', 'green')
eq(accountTheme('fisherfolk'), 'fish', 'blue'); eq(accountTheme('orgFish'), 'fish', 'blue')
console.log(`ok - ${n} assertions`)
