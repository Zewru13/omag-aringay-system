// The one way a search bar filters a list that is already on the screen: EVERY word typed has to be found somewhere in the row's text, in any order,
// ignoring capitals, extra spaces and commas ("Cruz, Juan" and "juan cruz" are the same search; "Farmers Cecilia" finds "Santa Cecilia Progressive
// Farmers"). The searches that ask the server do the same word by word (core.utils.build_text_search_q).

export const searchWords = (query) => String(query ?? '').toLowerCase().split(/[\s,]+/).filter(Boolean)

// `text` is everything the search may look at, as one string (join the fields with spaces).
export const matchesSearch = (text, query) => {
  const words = searchWords(query)
  if (!words.length) return true
  const haystack = String(text ?? '').toLowerCase()
  return words.every((word) => haystack.includes(word))
}
