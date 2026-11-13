// The rules of the Admin / Focal Person profile ("My Profile"): the role's name and what it can do, and the three lines of the account status. No screen and
// no network, so they can be tested alone.

export const roleLabel = (role) => (role === 'ADMIN' ? 'Admin' : 'Focal Person')

export function roleSummary(role) {
  return role === 'ADMIN'
    ? 'Manages user accounts, backups and the system settings, and can do everything a Focal Person can.'
    : 'Registers and manages farmers, fisherfolk, organizations, crops, assistance, disasters and reports.'
}

// What the account is like right now: [{ key, label, value, tone, detail }].
export function accountStatus(profile) {
  const active = Boolean(profile?.is_active)
  const verified = Boolean(profile?.is_email_verified)
  const mustChange = Boolean(profile?.must_change_password)
  return [
    {
      key: 'account', label: 'Account', value: active ? 'Active' : 'Inactive', tone: active ? 'green' : 'rose',
      detail: active ? 'This account can sign in.' : 'This account cannot sign in.',
    },
    {
      key: 'email', label: 'E-mail address', value: verified ? 'Verified' : 'Not verified', tone: verified ? 'green' : 'amber',
      detail: verified ? 'Password resets and notices reach this address.' : 'Open the link sent to this address to verify it.',
    },
    {
      key: 'password', label: 'Password', value: mustChange ? 'Change required' : 'Up to date', tone: mustChange ? 'amber' : 'green',
      detail: mustChange ? 'Choose a new password in Edit Profile.' : 'Change it any time in Edit Profile.',
    },
  ]
}
