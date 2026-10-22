import api from '../../api/axiosInstance.js'

// Every row of a list endpoint, following DRF's page links (lists are paged at 10 rows). A plain array reply is
// returned as it is. The Home charts need every record, not just the first page, or they would under-count.
export default async function fetchAllPages(url, params = {}) {
  const all = []
  for (let page = 1; page <= 50; page++) {
    const res = await api.get(url, { params: { ...params, page } })
    if (Array.isArray(res.data)) return res.data
    all.push(...(res.data?.results || []))
    if (!res.data?.next) break
  }
  return all
}
