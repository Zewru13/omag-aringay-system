// Loading several things for one screen without one failure hiding the rest, and without a failure ever looking like "none".

// `sources` is { name: () => Promise }. Never rejects: a source that fails is null in `data` and named in `failed`, so the screen can
// say "couldn't load" for that part and still show the others.
export async function settleAll(sources) {
  const names = Object.keys(sources)
  const settled = await Promise.allSettled(names.map((name) => Promise.resolve().then(() => sources[name]())))
  const data = {}
  const failed = []
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') data[names[i]] = result.value
    else { data[names[i]] = null; failed.push(names[i]) }
  })
  return { data, failed }
}

// The rows of an answer: a list as it is, an axios response whose data is a list, or a paged one ({ results }). Anything else: none.
export function listOf(response) {
  if (Array.isArray(response)) return response
  const data = response?.data
  if (Array.isArray(data)) return data
  return Array.isArray(data?.results) ? data.results : []
}
