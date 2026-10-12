import assert from 'node:assert/strict'

const { regenerateOutcome, resendOutcome, regenerateConfirmText, canRegeneratePassword } = await import(new URL('../src/pages/Users/staffPasswordOutcome.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const person = { id: 7, email: 'ana@x.test', full_name: 'Ana Cruz', role: 'EVALUATOR', is_active: true, is_email_verified: true }

// sent: just a message, the password is never shown
eq(regenerateOutcome({ email_sent: true }, person), { kind: 'sent', toast: 'A new temporary password was emailed to ana@x.test.' }, 'regenerate, e-mail sent')
eq(resendOutcome({ email_sent: true }, person), { kind: 'sent', toast: 'A verification link and a new temporary password were emailed to ana@x.test.' }, 'resend, e-mail sent')

// not sent: the admin is given what to pass on
const failed = { email_sent: false, reason: 'Could not connect to the mail server.', temporary_password: 'Tamp#12345678', verification_link: 'https://x/verify-email?token=abc' }
eq(regenerateOutcome(failed, person), { kind: 'relay', title: 'New temporary password for Ana Cruz', reason: 'Could not connect to the mail server.', password: 'Tamp#12345678', link: 'https://x/verify-email?token=abc', email: 'ana@x.test' }, 'regenerate, e-mail failed')
eq(resendOutcome({ email_sent: false, temporary_password: 'Tamp#12345678' }, person).link, null, 'no link when the server sent none')

// the confirmation sentence
eq(regenerateConfirmText(person), 'Send a new temporary password to Ana Cruz (ana@x.test)? Their current password stops working and they are signed out everywhere.', 'confirm text')

// who gets the action: active, verified staff other than yourself
eq(canRegeneratePassword(person, 1), true, 'an active verified staff member')
eq(canRegeneratePassword(person, 7), false, 'not yourself')
eq(canRegeneratePassword({ ...person, role: 'CITIZEN' }, 1), false, 'not a citizen')
eq(canRegeneratePassword({ ...person, is_active: false }, 1), false, 'not a deactivated account')
eq(canRegeneratePassword({ ...person, is_email_verified: false, is_active: false }, 1), false, 'an unverified one uses Resend verification instead')
eq(canRegeneratePassword({ ...person, email: null }, 1), false, 'no e-mail, nowhere to send it')

console.log(`staffPasswordOutcome: ${n} checks passed`)
