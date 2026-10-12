// What User Management says and offers around a staff member's temporary password. Pure, so it can be tested.
//
// A temporary password is only ever e-mailed. When the e-mail cannot be sent, the administrator is handed the password
// once, to pass on in person (that is the 'relay' outcome).

const relay = (title, data, person) => ({
  kind: 'relay',
  title,
  reason: data.reason || '',
  password: data.temporary_password,
  link: data.verification_link || null,
  email: person.email,
})

// The result of "Regenerate password" (a verified, active staff member who lost theirs).
export const regenerateOutcome = (data, person) => (
  data.email_sent
    ? { kind: 'sent', toast: `A new temporary password was emailed to ${person.email}.` }
    : relay(`New temporary password for ${person.full_name || person.email}`, data, person)
)

// The result of "Resend verification email" (someone who has not verified yet): link and new password together.
export const resendOutcome = (data, person) => (
  data.email_sent
    ? { kind: 'sent', toast: `A verification link and a new temporary password were emailed to ${person.email}.` }
    : relay(`Verification link and password for ${person.full_name || person.email}`, data, person)
)

export const regenerateConfirmText = (person) =>
  `Send a new temporary password to ${person.full_name || person.email} (${person.email})? Their current password stops working and they are signed out everywhere.`

// Active, verified Admin / Focal Person, not yourself, with an e-mail to send to.
export const canRegeneratePassword = (person, currentUserId) =>
  person.role !== 'CITIZEN' && person.is_active && person.is_email_verified && Boolean(person.email) && person.id !== currentUserId
