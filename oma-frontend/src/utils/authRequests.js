// Calls whose 401 means "wrong credentials" or "dead token", not "the session expired". The response handler must
// not try to refresh the token or reload the login page for these, or the login error message is wiped.
const AUTH_PATHS = ['/accounts/login/', '/accounts/token/refresh/', '/accounts/logout/']

export const isAuthEndpoint = (url) => typeof url === 'string' && AUTH_PATHS.some((path) => url.includes(path))
