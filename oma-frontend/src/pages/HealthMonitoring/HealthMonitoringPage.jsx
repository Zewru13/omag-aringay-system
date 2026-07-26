import { useCallback, useEffect, useState } from 'react'
import { HeartPulse } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { ViewStockingLogsModal } from '../FisheriesRecords/StockingMonitoringModals.jsx'

const CONDITION_TONES = { Good: 'green', Fair: 'amber', Poor: 'rose' }

const COLUMNS = [
  { key: 'fisherfolk_name',   label: 'FISHERFOLK' },
  { key: 'pond_name_cell',    label: 'POND' },
  { key: 'condition_cell',    label: 'LATEST HEALTH STATUS' },
  { key: 'mortality_cell',    label: 'LATEST MORTALITY' },
  { key: 'next_feeding_fmt',  label: 'NEXT SUGGESTED FEEDING' },
]

function fmtDate(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v + 'T00:00:00'))
}

function HealthMonitoringPage() {
  const [records, setRecords] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedRecord, setSelectedRecord] = useState(null)

  const fetchRecords = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const r = await api.get('/fisheries/health-monitoring/')
      setRecords(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      setError('Unable to load health & feeding monitoring data.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const rows = records.map((r) => ({
    ...r,
    pond_name_cell: r.pond_name || r.pond_location_barangay || '—',
    condition_cell: r.latest_water_fish_condition ? (
      <StatusPill tone={CONDITION_TONES[r.latest_water_fish_condition] || 'slate'}>{r.latest_water_fish_condition}</StatusPill>
    ) : <span className="text-slate-400">No logs yet</span>,
    mortality_cell: r.latest_mortality_count != null ? r.latest_mortality_count : '—',
    next_feeding_fmt: fmtDate(r.next_feeding_date),
  }))

  return (
    <PageLayout
      title="Health & Feeding Monitoring"
      subtitle="Active stocking records — health status, mortality, and suggested next feeding date"
    >
      <div className="space-y-4">
        {error && <ErrorMessage message={error} />}
        <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-[#F0F4F0]">
            <HeartPulse size={16} className="text-[#1B4D2E]" />
            <h2 className="text-[13px] font-semibold text-[#1A2B1A]">Active Stocking Records</h2>
          </div>
          <DataTable
            columns={COLUMNS}
            data={rows}
            isLoading={isLoading}
            onRowClick={(row) => setSelectedRecord(row)}
          />
        </div>
      </div>

      {selectedRecord && (
        <ViewStockingLogsModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          onLogAdded={fetchRecords}
        />
      )}
    </PageLayout>
  )
}

export default HealthMonitoringPage
