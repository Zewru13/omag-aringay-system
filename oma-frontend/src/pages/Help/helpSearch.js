import { matchesSearch } from '../../utils/searchMatch.js'

// The FAQ sections left after a search: a question stays when every typed word is found in the question or its answer (any order,
// capitals and commas ignored); a section with no question left is dropped. An empty search keeps everything.
export function filterFaqSections(sections, query) {
  if (!String(query ?? '').trim()) return sections
  return sections
    .map((section) => ({ ...section, items: section.items.filter((faq) => matchesSearch(`${faq.q} ${faq.a}`, query)) }))
    .filter((section) => section.items.length > 0)
}
