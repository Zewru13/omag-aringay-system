// The type-to-search select (components/UI/SearchSelect.jsx): which options a typed text finds, in what order, what to show for the chosen
// value, and where the arrow keys go. No screen and no network, so the rules can be tested alone.

const words = (text) => String(text || '').toLowerCase().split(/\s+/).filter(Boolean)

// How well one option matches: 0 its name starts with what was typed, 1 a word of it does, 2 the text is somewhere inside it, null no match.
// Every typed word has to be found. The text is matched as typed (brackets and punctuation are not special).
function score(label, typed, typedWords) {
  const text = String(label || '').toLowerCase().replace(/\s+/g, ' ')
  if (!typedWords.every((w) => text.includes(w))) return null
  if (text.startsWith(typed)) return 0
  return text.split(' ').some((w) => w.startsWith(typedWords[0])) ? 1 : 2
}

// The options that match `query` (all of them when nothing is typed), best matches first and otherwise in the order given.
export function filterOptions(options, query, { limit } = {}) {
  const typedWords = words(query)
  const typed = typedWords.join(' ')
  let result = options
  if (typedWords.length) {
    result = options
      .map((option, index) => ({ option, index, rank: score(option.label, typed, typedWords) }))
      .filter((entry) => entry.rank !== null)
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map((entry) => entry.option)
  }
  return limit ? result.slice(0, limit) : result
}

// The text of the option that has this value ('' for no value, or a value the list does not have, e.g. while the list is still loading).
export function labelOf(options, value) {
  if (value === null || value === undefined || value === '') return ''
  return options.find((o) => String(o.value) === String(value))?.label || ''
}

// The highlighted row after a key: the arrows move and wrap around, Home and End jump. -1 is nothing highlighted yet.
export function nextActive(current, count, key) {
  if (count <= 0) return -1
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === 'ArrowDown') return current < 0 || current >= count - 1 ? 0 : current + 1
  if (key === 'ArrowUp') return current <= 0 ? count - 1 : current - 1
  return current
}
