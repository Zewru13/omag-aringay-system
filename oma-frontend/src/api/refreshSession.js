// Renewing the login without making the person sign in again.
//
// The server lets a refresh token be used ONCE: it answers with a new access token and a new refresh token and
// retires the old one. So two things must hold, or people get logged out for no reason:
//   1. the new refresh token is always stored, and
//   2. requests that fail together (a page fires many at once) share ONE refresh - a second use of the same
//      refresh token would be refused as a replay.
// Another open tab can also refresh first; if the stored refresh token changed while ours was failing, that newer
// one is tried once.

export function createSessionRefresher({ storage, post }) {
  let inFlight = null

  const attempt = async (refresh) => {
    const data = await post(refresh)
    storage.setItem('accessToken', data.access)
    if (data.refresh) storage.setItem('refreshToken', data.refresh)
    return data.access
  }

  const run = async () => {
    const used = storage.getItem('refreshToken')
    if (!used) throw new Error('There is no refresh token to renew the session with.')
    try {
      return await attempt(used)
    } catch (error) {
      const latest = storage.getItem('refreshToken')
      if (latest && latest !== used) return attempt(latest)
      throw error
    }
  }

  return function refreshSession() {
    if (!inFlight) {
      inFlight = run().finally(() => { inFlight = null })
    }
    return inFlight
  }
}

// After a 401: was the token that was sent the one still stored? If a newer one is stored already (a refresh
// finished while this request was on its way), there is nothing to refresh - just send it again with the new token.
export function shouldRefreshAfter401(sentAuthorization, currentAccessToken) {
  if (!sentAuthorization || !currentAccessToken) return true
  return sentAuthorization === `Bearer ${currentAccessToken}`
}
