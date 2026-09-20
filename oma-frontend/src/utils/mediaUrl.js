import api from '../api/axiosInstance.js'

// Resolves a relative /media/... path (e.g. a serializer's `photo_url`,
// straight off an ImageField.url) into an absolute URL the browser can
// actually load. Needed because the API's own axios baseURL includes the
// '/api' path segment (see axiosInstance.js's BASE_URL) while media files
// are served from the API host's root — and because the frontend dev
// server (Vite) and the Django dev server run on different origins/ports
// with no proxy between them, a raw relative path resolves against the
// WRONG origin (the frontend's own) and 404s. Nothing else in this app
// currently resolves this correctly — found while building the
// accountless-beneficiary confirmation photo review — so this is a new,
// shared, one-off-safe utility rather than another inline guess.
export function resolveMediaUrl(path) {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  const origin = api.defaults.baseURL.replace(/\/api\/?$/, '')
  return `${origin}${path.startsWith('/') ? '' : '/'}${path}`
}
