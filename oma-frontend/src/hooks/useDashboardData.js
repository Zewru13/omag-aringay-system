import { useCallback, useEffect, useState } from 'react'
import api from '../api/axiosInstance.js'

const currentYear = new Date().getFullYear()

function normalizeList(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.results)) return data.results
  return []
}

// Module-level fetchers are stable references — safe to use as useCallback deps.
const fetchSummary = () => api.get('/production/dashboard/').then((r) => r.data)

const fetchExtended = () => api.get('/production/dashboard/extended/').then((r) => r.data)

const fetchCommodities = () =>
  api
    .get(`/production/analytics/commodities/?year=${currentYear}`)
    .then((r) => normalizeList(r.data))

const fetchSeasonal = () =>
  api
    .get(`/production/analytics/seasonal/?year=${currentYear}`)
    .then((r) => r.data)

const fetchYearlyTrend = () =>
  api
    .get('/production/analytics/yearly-trend/')
    .then((r) => normalizeList(r.data))

const fetchUpcomingVisits = () =>
  api.get('/monitoring/farm-visits/').then((r) => {
    const visits = normalizeList(r.data)
    const today = new Date()
    const in14 = new Date(today)
    in14.setDate(today.getDate() + 14)
    return visits.filter((v) => {
      if (!v.next_visit_date) return false
      const d = new Date(v.next_visit_date)
      return d >= today && d <= in14
    }).length
  })

const fetchActiveMonitoring = () =>
  api.get('/production/monitoring/').then((r) =>
    typeof r.data?.count === 'number' ? r.data.count : normalizeList(r.data).length
  )

const fetchMunicipalityCrops = () =>
  api.get('/production/analytics/municipality-crops/').then((r) => r.data)

function useSection(fetcher) {
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      setData(result)
    } catch (err) {
      setError(
        err?.response?.data?.detail ??
          'Could not load this data. Please try again.',
      )
    } finally {
      setIsLoading(false)
    }
  }, [fetcher])

  useEffect(() => {
    load()
  }, [load])

  return { data, isLoading, error, retry: load }
}

export default function useDashboardData() {
  const summary = useSection(fetchSummary)
  const extended = useSection(fetchExtended)
  const commodities = useSection(fetchCommodities)
  const seasonal = useSection(fetchSeasonal)
  const yearlyTrend = useSection(fetchYearlyTrend)
  const upcomingVisits = useSection(fetchUpcomingVisits)
  const activeMonitoring = useSection(fetchActiveMonitoring)
  const municipalityCrops = useSection(fetchMunicipalityCrops)

  return { summary, extended, commodities, seasonal, yearlyTrend, upcomingVisits, activeMonitoring, municipalityCrops }
}
