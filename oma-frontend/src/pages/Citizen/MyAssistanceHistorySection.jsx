import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import { labels } from './labels.js'

// Batch 11: read-only assistance/beneficiary history for a CITIZEN — no
// create/edit affordance anywhere on this component, matching the backend
// (MyBeneficiaryHistoryView / MyFisherfolkBeneficiaryHistoryView are
// ListAPIView, GET only).
export default function MyAssistanceHistorySection({ endpoint }) {
  const [records, setRecords] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    api.get(endpoint).then((r) => { if (!cancelled) setRecords(r.data) }).finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [endpoint])

  if (isLoading) return <p className="text-[13px] text-[#7A8E7A] italic">{labels.assistanceHistory.loading}</p>
  if (records.length === 0) {
    return <p className="rounded-xl border border-[#E2E8E2] bg-white p-6 text-[13px] italic text-[#A8BCA8]">{labels.assistanceHistory.empty}</p>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-[#E2E8E2] text-left text-[11px] uppercase tracking-wider text-[#7A8E7A]">
            <th className="px-4 py-2">{labels.assistanceHistory.columns.type}</th>
            <th className="px-4 py-2">{labels.assistanceHistory.columns.quantity}</th>
            <th className="px-4 py-2">{labels.assistanceHistory.columns.dateReceived}</th>
            <th className="px-4 py-2">{labels.assistanceHistory.columns.remarks}</th>
          </tr>
        </thead>
        <tbody>
          {records.map((rec) => (
            <tr key={rec.id} className="border-b border-[#F0F4F0] last:border-0">
              <td className="px-4 py-2 text-[#1A2B1A]">{rec.assistance_type || (rec.program ? labels.assistanceHistory.programDistribution : labels.common.unknown)}</td>
              <td className="px-4 py-2 text-[#4A5E4A]">{rec.quantity_given ? `${rec.quantity_given} ${rec.unit || ''}` : (rec.quantity || '—')}</td>
              <td className="px-4 py-2 text-[#4A5E4A]">{rec.date_given}</td>
              <td className="px-4 py-2 text-[#4A5E4A]">{rec.remarks || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
