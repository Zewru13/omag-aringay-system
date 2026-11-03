import assert from 'node:assert/strict'
import fs from 'node:fs'

// The app is split by page: the router loads a page only when it is opened (React.lazy), so the first visit downloads the shell and the page it
// lands on, not all 29 pages at once. This reads App.jsx as text (no screen, no network) so a page that is imported eagerly again is caught.
const source = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const lines = source.split(/\r?\n/)

let n = 0
const ok = (condition, label) => { assert.ok(condition, label); n++ }

// Pages the router may import eagerly: the login page is the first screen of a signed-out visit and is small.
const EAGER_PAGES = new Set(['./pages/Login/LoginPage.jsx'])

const staticPageImports = lines
  .map((line) => /^import\s+.+\s+from\s+["'](\.\/pages\/[^"']+)["'];?\s*$/.exec(line))
  .filter(Boolean)
  .map((m) => m[1])
  .filter((path) => !EAGER_PAGES.has(path))
ok(staticPageImports.length === 0, `these pages are imported eagerly and end up in the first download: ${staticPageImports.join(', ')}`)

const lazyPages = lines.filter((line) => /=\s*lazy\(/.test(line))
ok(lazyPages.length >= 25, `expected the pages to be lazy-loaded, found ${lazyPages.length}`)
ok(lazyPages.every((line) => /import\(\s*["']\.\/pages\//.test(line)), 'every lazy() loads a page with a dynamic import')

ok(/<Suspense[\s>]/.test(source), 'the routes sit inside a Suspense boundary, so a page that is still loading shows a placeholder')
ok(/import\s+\{[^}]*\blazy\b[^}]*\}\s+from\s+["']react["']/.test(source) && /import\s+\{[^}]*\bSuspense\b[^}]*\}\s+from\s+["']react["']/.test(source), 'lazy and Suspense come from react')

// The sidebar logo is a small image: the original artwork is kept for the printed documents only.
const logoUses = fs.readdirSync(new URL('../src/assets/', import.meta.url))
ok(logoUses.includes('LOGO OMAg-small.png'), 'a small copy of the logo exists for the screens')
const smallLogo = fs.statSync(new URL('../src/assets/LOGO OMAg-small.png', import.meta.url))
ok(smallLogo.size < 60 * 1024, `the small logo is ${smallLogo.size} bytes; it should stay under 60 KB`)

console.log(`appCodeSplitting: ${n} checks passed`)
