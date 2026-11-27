// Every relative import must spell each folder and file name exactly as it is on disk. Windows does not care about capital letters
// but the website host runs Linux and does: "../ui/ModalShell.jsx" for the folder "UI" builds here and fails there.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const src = fileURLToPath(new URL('../src', import.meta.url))

const sourceFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name)
  if (entry.isDirectory()) return sourceFiles(full)
  return /\.(js|jsx|css)$/.test(entry.name) ? [full] : []
})

const names = new Map()
const listing = (dir) => {
  if (!names.has(dir)) names.set(dir, fs.existsSync(dir) ? fs.readdirSync(dir) : [])
  return names.get(dir)
}

// The first part of `target` (under `from`) that is not on disk with exactly these letters, or null when all of it is.
function wrongPart(from, target) {
  let dir = from
  const parts = path.relative(from, target).split(path.sep)
  for (const [index, part] of parts.entries()) {
    if (part === '..') { dir = path.dirname(dir); continue }
    const found = listing(dir)
    const last = index === parts.length - 1
    const exact = found.includes(part) || (last && ['.js', '.jsx'].some((ext) => found.includes(part + ext)))
    if (!exact) return part
    dir = path.join(dir, part)
  }
  return null
}

const IMPORT = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|@import\s+)['"](\.{1,2}\/[^'"?]+)/g
const problems = []
let checked = 0
for (const file of sourceFiles(src)) {
  for (const [, specifier] of fs.readFileSync(file, 'utf8').matchAll(IMPORT)) {
    checked += 1
    const dir = path.dirname(file)
    const part = wrongPart(dir, path.resolve(dir, specifier))
    if (part) problems.push(`${path.relative(src, file)} imports '${specifier}': no file or folder is spelled "${part}"`)
  }
}

assert.ok(checked > 500, `only ${checked} imports were read, so the check is not looking at the source`)
assert.deepStrictEqual(problems, [], `imports the website host cannot find:\n${problems.join('\n')}`)
console.log(`import spelling: ${checked} relative imports match the files exactly`)
