import assert from 'node:assert/strict'

const { MAIN_DEVELOPER, CO_DEVELOPER, SCHOOL, OFFICE_CONTACT } = await import(new URL('../src/constants/appInfo.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// The Help page names a main developer (with contact details) and a co-developer.
eq(MAIN_DEVELOPER, { name: 'John Michael E. Marzan', email: 'marzanmr70@gmail.com', phone: '09455979837' }, 'the main developer and how to reach them')
eq(CO_DEVELOPER, { name: 'Carl Jhoaquin B. Inong' }, 'the co-developer')
eq(SCHOOL, 'Saint Louis College', 'the school')

// The office's own contact details, shown under About This System.
eq(OFFICE_CONTACT, { emails: ['agriculture2503aringay@gmail.com', 'lgu_aringay@yahoo.com'] }, 'the office contact: two email addresses')

// The sign-in page shows the Office of the Municipal Agriculturist's own address, and only that one.
const { OFFICE_SIGN_IN_EMAIL } = await import(new URL('../src/constants/appInfo.js', import.meta.url).href)
eq(OFFICE_SIGN_IN_EMAIL, 'agriculture2503aringay@gmail.com', 'the sign-in page email')
const login = (await import('node:fs')).default.readFileSync(new URL('../src/pages/Login/LoginPage.jsx', import.meta.url), 'utf8')
assert.ok(login.includes('href={`mailto:${OFFICE_SIGN_IN_EMAIL}`}'), 'the sign-in page links to it'); n++
assert.ok(!login.includes('lgu_aringay'), 'only that one address'); n++

console.log(`appInfo: ${n} checks passed`)
