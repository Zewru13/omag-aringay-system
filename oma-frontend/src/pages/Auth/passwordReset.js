// The pure parts of "forgot password": reading the e-mailed link, and turning a refused request into one sentence.

// The link is /reset-password#uid=...&token=...  (after '#', so the token is never sent to a web server).
export function readResetLink(hash) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''))
  const uid = params.get('uid')
  const token = params.get('token')
  return uid && token ? { uid, token } : null
}

export function requestErrorText(error) {
  if (error?.response?.status === 429) return 'Too many tries. Please wait a while, then try again.'
  const data = error?.response?.data
  return (
    data?.new_password?.join(' ') ||
    data?.confirm_new_password?.[0] ||
    data?.email?.[0] ||
    data?.detail ||
    'The server could not be reached or had a problem. Please try again in a moment.'
  )
}

// Shown on the sign-in page after a reset link that is used up, expired or incomplete.
export const DEAD_LINK_NOTICE =
  'That reset link was already used or has expired. Sign in, or choose "Forgot password?" to get a new one.'

// Set in localStorage when a new password is saved, so a "Check your email" tab left open can move on to sign-in.
export const PASSWORD_SAVED_KEY = 'omag_password_saved'

export const isDeadLink = (error) => error?.response?.data?.code === 'invalid_link'
