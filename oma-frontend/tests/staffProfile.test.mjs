import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The Admin and Focal Person profile ("My Profile"): a hero with the photo, name, role, e-mail and date joined; account information; account status.
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const { accountStatus, roleLabel, roleSummary } = await import(new URL('../src/pages/Profile/staffProfile.js', import.meta.url).href)

eq(roleLabel('ADMIN'), 'Admin', 'the Admin')
eq(roleLabel('EVALUATOR'), 'Focal Person', 'the Focal Person')
ok(roleSummary('ADMIN').length > 20 && roleSummary('EVALUATOR').length > 20 && roleSummary('ADMIN') !== roleSummary('EVALUATOR'), 'each role says what it can do')

const good = accountStatus({ is_active: true, is_email_verified: true, must_change_password: false })
eq(good.map((s) => [s.key, s.value, s.tone]), [['account', 'Active', 'green'], ['email', 'Verified', 'green'], ['password', 'Up to date', 'green']], 'a healthy account')
const bad = accountStatus({ is_active: false, is_email_verified: false, must_change_password: true })
eq(bad.map((s) => [s.key, s.value, s.tone]), [['account', 'Inactive', 'rose'], ['email', 'Not verified', 'amber'], ['password', 'Change required', 'amber']], 'an account that needs attention')
ok(good.every((s) => s.label && s.detail), 'every line says what it is and what it means')

const page = read('src/pages/Profile/ProfilePage.jsx')
ok(/<ProfileHero/.test(page) && /<AvatarBox/.test(page), 'the page opens with the hero and the photo')
ok(/title="Account Information"/.test(page) && /title="Account Status"/.test(page) && /title="Role &amp; Access"|title="Role & Access"/.test(page), 'cards: Account Information, Account Status, Role & Access')
ok(/aria-label="Edit profile"|>Edit profile</.test(page) || /iconOnly[^>]*>Edit Profile</.test(page), 'the edit icon stays')
ok(/handlePickPhoto/.test(page) && /handlePhotoChange/.test(page), 'the photo upload still works')
ok(!/<DetailTable/.test(page), 'the old single table is replaced')
ok(/Edit Profile/.test(page) && /Change Password/.test(page), 'the edit window and its password section stay')

console.log(`staffProfile: ${n} checks passed`)
