// The Edit Profile window and the profile page's details are table forms like every other window.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replaceAll(String.fromCharCode(13), '')
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }

const src = read('src/pages/Profile/ProfilePage.jsx')
ok(src.includes('FormTable.jsx'), 'uses the shared table form')
ok(/<FormSection/.test(src), 'the edit window is made of titled sections')
ok(/<InfoCard/.test(src), 'the account details are in cards (the shared profile kit)')
ok(!src.includes('FormLabel'), 'no stacked labels')
ok(!/<button\s+type="submit"/.test(src), 'the save button is the shared Button')
ok(!src.includes('const CARD'), 'no hand-made card styles')
ok(src.includes("from '../../utils/dateFormat.js'") || src.includes('from "../../utils/dateFormat.js"'), 'dates use the shared format')
ok(!src.includes('Intl.DateTimeFormat'), 'no private date format')
for (const label of ['Full Name', 'Email Address', 'Username', 'New Password', 'Confirm New Password', 'Current Password']) ok(src.includes(label), `${label} is still asked for`)

console.log(`profileForm: ${n} checks passed`)
