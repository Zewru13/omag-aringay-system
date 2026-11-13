// Every record of a list that the server sends a page at a time (10 by default, at most 200 when asked). A list that fills a search box or a dropdown
// (the organizations of a registration form) must hold ALL the records: with only the first page, an organization that is not among the newest ten
// can never be found in the box. `get(url, { params })` is the api's get; `params` are the filters; the pages are followed until the server says there is
// no next one (`maxPages` is only a stop against a server that never ends). A list that is not paged comes back as it is.
export async function loadAllPages(get, url, params = {}, { maxPages = 100 } = {}) {
  const all = []
  for (let page = 1; page <= maxPages; page++) {
    const response = await get(url, { params: { ...params, page, page_size: 200 } })
    const data = response.data
    if (Array.isArray(data)) return data
    all.push(...(data?.results || []))
    if (!data?.next) break
  }
  return all
}
