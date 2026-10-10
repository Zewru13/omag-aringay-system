import assert from 'node:assert/strict'

const { isAuthEndpoint } = await import(new URL('../src/utils/authRequests.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// A 401 from these calls means "wrong credentials / dead token", not "the session expired": the app must show the
// message instead of refreshing the token and reloading the login page (which wipes the message).
eq(isAuthEndpoint('/accounts/login/'), true, 'login')
eq(isAuthEndpoint('http://127.0.0.1:8000/api/accounts/login/'), true, 'login with host')
eq(isAuthEndpoint('/accounts/token/refresh/'), true, 'refresh')
eq(isAuthEndpoint('/accounts/logout/'), true, 'logout')
eq(isAuthEndpoint('/accounts/me/'), false, 'me is a normal call')
eq(isAuthEndpoint('/organizations/farmers/1/'), false, 'other calls')
eq(isAuthEndpoint(undefined), false, 'missing url')

console.log(`ok - ${n} assertions`)
