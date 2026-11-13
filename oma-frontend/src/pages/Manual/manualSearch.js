import { matchesSearch, searchWords } from '../../utils/searchMatch.js'

// The search bar of the User Manual. Every word typed has to be found, in any order (the same rule as every other search bar). What is searched:
// the guides (title, intro), their pictures (title, purpose), the buttons and fields listed under each picture, and the written steps.
// A result carries the id of the place on the page to jump to; ManualBody draws those ids.

export const guideTarget = (guide) => `guide-${guide.id}`
export const screenTarget = (guide, screen) => `screen-${guide.id}-${screen.id}`
export const stepTarget = (guide, index) => `guide-${guide.id}-step-${index + 1}`

// Every place a result can point at, so the page and the tests can check that each one exists.
export function manualTargets(guides) {
  return guides.flatMap((g) => [
    guideTarget(g),
    ...g.steps.map((_, i) => stepTarget(g, i)),
    ...g.screens.map((s) => screenTarget(g, s)),
  ])
}

const KIND_ORDER = { guide: 0, screen: 1, element: 2, step: 3 }

// A short piece of `text` around the first typed word, so the result shows why it matched.
function snippetOf(text, words, size = 110) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (flat.length <= size) return flat
  const lower = flat.toLowerCase()
  const phrase = lower.indexOf(words.join(' '))
  const at = phrase >= 0 ? phrase : Math.max(0, Math.min(...words.map((w) => lower.indexOf(w)).filter((i) => i >= 0)))
  const start = Math.max(0, at - 30)
  const piece = flat.slice(start, start + size).trim()
  return `${start > 0 ? '…' : ''}${piece}${start + size < flat.length ? '…' : ''}`
}

// Results come as guide, picture, button or field, step; inside each kind a match on the name itself beats a match on the explanation.
export function searchManual(guides, query, { limit = 12 } = {}) {
  const words = searchWords(query)
  if (!words.length) return []
  const found = []
  const add = (kind, target, title, context, body, nameMatches) => found.push({ kind, target, title, context, snippet: snippetOf(body, words), rank: nameMatches ? 0 : 1 })

  guides.forEach((g) => {
    const named = matchesSearch(g.title, query)
    if (named || matchesSearch(`${g.title} ${g.intro || ''}`, query)) add('guide', guideTarget(g), g.title, '', g.intro || g.title, named)
    g.screens.forEach((s) => {
      const target = screenTarget(g, s)
      const sNamed = matchesSearch(s.title, query)
      if (sNamed || matchesSearch(`${s.title} ${s.purpose || ''}`, query)) add('screen', target, s.title, g.title, s.purpose || s.title, sNamed)
      ;(s.legend || []).forEach((item) => {
        const eNamed = matchesSearch(item.label, query)
        if (eNamed || matchesSearch(`${item.label} ${item.desc || ''}`, query)) add('element', target, item.label, s.title, item.desc || item.label, eNamed)
      })
    })
    g.steps.forEach((text, i) => {
      if (matchesSearch(text, query)) add('step', stepTarget(g, i), g.title, `Step ${i + 1}`, text, false)
    })
  })

  return found
    .map((r, i) => ({ ...r, i }))
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.rank - b.rank || a.i - b.i)
    .slice(0, limit)
    .map(({ rank, i, ...r }) => r)
}
