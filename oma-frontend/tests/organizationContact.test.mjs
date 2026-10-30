import assert from 'node:assert/strict'

const { contactFullName, assistanceLink } = await import(new URL('../src/pages/Organizations/organizationContact.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.equal(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// the contact person is one full name; an older record saved as "Last, First" reads as "First Last"
eq(contactFullName('Dela Cruz, Juan'), 'Juan Dela Cruz', 'last, first becomes first last')
eq(contactFullName('Dela Cruz'), 'Dela Cruz', 'only a last name stays as it is')
eq(contactFullName('Juan Dela Cruz'), 'Juan Dela Cruz', 'a full name is kept')
eq(contactFullName('  Dela Cruz ,  Juan  '), 'Juan Dela Cruz', 'spaces around the comma are ignored')
eq(contactFullName(''), '', 'empty')
eq(contactFullName(null), '', 'missing')

// the row menu's Add assistance goes to the assistance page of the right kind with the organization chosen
eq(assistanceLink('farmers', 7), '/crop-assistance?distribute=7', 'a farmers organization')
eq(assistanceLink('fisherfolk', 9), '/fisheries-assistance?distribute=9', 'a fisherfolk organization')

console.log(`organizationContact: ${n} checks passed`)
