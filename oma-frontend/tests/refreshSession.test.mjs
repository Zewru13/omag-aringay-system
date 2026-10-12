import assert from 'node:assert/strict'

const { createSessionRefresher, shouldRefreshAfter401 } = await import(new URL('../src/api/refreshSession.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const memoryStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial))
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, v) }, dump: () => Object.fromEntries(data) }
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ── a refresh stores BOTH new tokens (the server retires the old refresh token) ──
{
  const storage = memoryStorage({ accessToken: 'a1', refreshToken: 'r1' })
  const refresh = createSessionRefresher({ storage, post: async (token) => ({ access: 'a2', refresh: 'r2', used: token }) })
  eq(await refresh(), 'a2', 'returns the new access token')
  eq(storage.dump(), { accessToken: 'a2', refreshToken: 'r2' }, 'stores the new access AND refresh token')
}

// ── a reply without a new refresh token keeps the old one ──
{
  const storage = memoryStorage({ accessToken: 'a1', refreshToken: 'r1' })
  const refresh = createSessionRefresher({ storage, post: async () => ({ access: 'a2' }) })
  await refresh()
  eq(storage.dump(), { accessToken: 'a2', refreshToken: 'r1' }, 'old refresh token kept when none is returned')
}

// ── many requests failing together share ONE refresh (a second use of the old token would be refused) ──
{
  const storage = memoryStorage({ accessToken: 'a1', refreshToken: 'r1' })
  let calls = 0
  const refresh = createSessionRefresher({ storage, post: async () => { calls++; await delay(20); return { access: 'a2', refresh: 'r2' } } })
  const results = await Promise.all([refresh(), refresh(), refresh(), refresh()])
  eq(calls, 1, 'one request to the server')
  eq(results, ['a2', 'a2', 'a2', 'a2'], 'everyone gets the same new access token')
}

// ── a later expiry refreshes again (the shared attempt is not remembered forever) ──
{
  const storage = memoryStorage({ accessToken: 'a1', refreshToken: 'r1' })
  const sent = []
  const refresh = createSessionRefresher({ storage, post: async (token) => { sent.push(token); return { access: `a${sent.length + 1}`, refresh: `r${sent.length + 1}` } } })
  await refresh()
  await refresh()
  eq(sent, ['r1', 'r2'], 'second refresh uses the refresh token the first one returned')
}

// ── another tab refreshed first: its refresh token is in storage now, so use that one ──
{
  const storage = memoryStorage({ accessToken: 'a1', refreshToken: 'r1' })
  const refresh = createSessionRefresher({
    storage,
    post: async (token) => {
      if (token === 'r1') { storage.setItem('accessToken', 'tabB-a'); storage.setItem('refreshToken', 'tabB-r'); throw new Error('401 already used') }
      return { access: 'a3', refresh: 'r3' }
    },
  })
  eq(await refresh(), 'a3', 'retries once with the refresh token another tab stored')
  eq(storage.dump().refreshToken, 'r3', 'and keeps the newest')
}

// ── a real failure is reported, and tries only once more at most ──
{
  const storage = memoryStorage({ accessToken: 'a1', refreshToken: 'r1' })
  let calls = 0
  const refresh = createSessionRefresher({ storage, post: async () => { calls++; throw new Error('expired') } })
  await assert.rejects(refresh(), /expired/); n++
  eq(calls, 1, 'storage unchanged: no retry')
  eq(storage.dump(), { accessToken: 'a1', refreshToken: 'r1' }, 'a failed refresh changes nothing')
}

// ── nothing to refresh with ──
{
  const refresh = createSessionRefresher({ storage: memoryStorage({ accessToken: 'a1' }), post: async () => ({ access: 'x' }) })
  await assert.rejects(refresh(), /refresh token/i); n++
}

// ── after a 401, refresh only if the token that was sent is still the current one ──
eq(shouldRefreshAfter401('Bearer a1', 'a1'), true, 'same token: it really expired')
eq(shouldRefreshAfter401('Bearer a1', 'a2'), false, 'a newer token exists already: just retry with it')
eq(shouldRefreshAfter401(undefined, 'a1'), true, 'no header was sent: refresh')
eq(shouldRefreshAfter401('Bearer a1', null), true, 'nothing stored any more: refresh (it will fail and log out)')

console.log(`refreshSession: ${n} checks passed`)
