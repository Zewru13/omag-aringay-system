// Text size and weight set by a class on a button, input, select or textarea must win. The browser-default reset `font: inherit` therefore lives in
// the base layer (an unlayered rule beats every Tailwind utility, which made all those classes do nothing: a Button was 14px regular instead of 13px
// medium, and the Early / Late badges 13px regular instead of 11px semibold).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8').replaceAll(String.fromCharCode(13), '')
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }

// Everything before `@layer base {` and after its closing brace is unlayered: find the base block by brace matching.
const start = css.indexOf('@layer base {')
let depth = 0
let end = start
for (let i = css.indexOf('{', start); i < css.length; i += 1) {
  if (css[i] === '{') depth += 1
  if (css[i] === '}') { depth -= 1; if (depth === 0) { end = i; break } }
}
const outside = css.slice(0, start) + css.slice(end + 1)
const rule = /button,\s*input,\s*select,\s*textarea\s*\{[^}]*font:\s*inherit/
ok(!rule.test(outside), 'the font reset is not an unlayered rule')
ok(rule.test(css.slice(start, end)), 'the font reset is kept, inside the base layer')

console.log(`lookFonts: ${n} checks passed`)
