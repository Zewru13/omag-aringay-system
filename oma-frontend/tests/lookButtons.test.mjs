// A green-filled, green-outlined or tinted action button is the shared Button (variants primary / outline), not a hand-styled <button>.
// (Link-style buttons, table-row toggles and icon buttons are not covered by this rule.)
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? walk(path) : [path]
})
const files = walk(fileURLToPath(new URL('../src', import.meta.url))).filter((f) => f.endsWith('.jsx'))
const HAND_MADE = /(bg-\[#1B4D2E\][\s"'`]|border-\[#1B4D2E\]\/30|border-\[#1B4D2E\]\s+bg-white)/
const slash = (p) => p.split(String.fromCharCode(92)).join('/')
const offenders = []
for (const file of files) {
  if (slash(file).endsWith('components/UI/Button.jsx')) continue
  const text = readFileSync(file, 'utf8')
  // look at each opening tag only (up to its closing `>` that is not inside {...} braces)
  for (const match of text.matchAll(/<button\b/g)) {
    let depth = 0
    let i = match.index
    for (; i < text.length; i += 1) {
      if (text[i] === '{') depth += 1
      else if (text[i] === '}') depth -= 1
      else if (text[i] === '>' && depth === 0) break
    }
    const tag = text.slice(match.index, i + 1)
    // only a fixed class string: a button whose classes change with its state (a tab, a filter chip) or a round icon button is not an action button
    if (/className="[^"]*"/.test(tag) && HAND_MADE.test(tag.match(/className="[^"]*"/)[0]) && !tag.includes("rounded-full")) offenders.push(`${slash(file).split('/src/')[1]}:${text.slice(0, match.index).split('\n').length}`)
  }
}
assert.deepEqual(offenders, [], `hand-styled green buttons: ${offenders.join(', ')}`)
console.log('lookButtons: 1 check passed')
