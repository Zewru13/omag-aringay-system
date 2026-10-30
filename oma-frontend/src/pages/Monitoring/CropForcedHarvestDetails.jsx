import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { forcedCropRows, forcedDetailRows, kgText } from './forcedHarvestDetails.js'

// The saved details of a crop forced harvest (the window the red FORCED HARVEST label opens): GET /production/forced-harvest/<id>/, the
// saved record and never state kept in the page, laid out as two tables like the Aquaculture Force Harvest details.
const HEAD = 'bg-[#1B4D2E] text-white'
const TH = 'whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em]'

export default function CropForcedHarvestDetails({ harvestId, onClose }) {
  const [state, setState] = useState({ id: null, data: null, failed: false })

  useEffect(() => {
    let alive = true
    api.get(`/production/forced-harvest/${harvestId}/`)
      .then((r) => { if (alive) setState({ id: harvestId, data: r.data, failed: false }) })
      .catch(() => { if (alive) setState({ id: harvestId, data: null, failed: true }) })
    return () => { alive = false }
  }, [harvestId])

  const loading = state.id !== harvestId
  const d = loading ? null : state.data
  const crops = d ? forcedCropRows(d) : []

  return (
    <ModalShell
      title="Forced Harvest Details"
      subtitle="Crop forced harvest, as saved"
      icon={Zap}
      iconBg="bg-red-50"
      iconColor="text-red-600"
      maxWidth="max-w-4xl"
      onClose={onClose}
    >
      {loading && <p className="py-6 text-center text-[13px] italic text-[#7A8E7A]" role="status">Loading…</p>}
      {!loading && state.failed && <p className="py-6 text-center text-[13px] text-rose-600" role="alert">The forced harvest details could not be loaded.</p>}
      {d && (
        <div className="space-y-4" data-testid="crop-forced-harvest-details">
          <div className="overflow-x-auto rounded-xl border border-[#E2E8E2]">
            <table className="min-w-full text-[13px]">
              <thead className={HEAD}><tr><th className={TH}>Detail</th><th className={TH}>Value</th></tr></thead>
              <tbody>
                {forcedDetailRows(d).map(([label, value]) => (
                  <tr key={label} className="border-t border-[#F0F4F0] align-top">
                    <th scope="row" className="w-1/3 whitespace-nowrap px-3 py-2 text-left font-medium text-[#4A5E4A]">{label}</th>
                    <td className="px-3 py-2 font-semibold text-[#1A2B1A]">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[#E2E8E2]">
            <table className="min-w-full text-[13px]" data-testid="crop-forced-harvest-crops">
              <thead className={HEAD}>
                <tr>
                  <th className={TH}>Crop</th>
                  <th className={TH}>Parcel</th>
                  <th className={TH}>Expected harvest</th>
                  <th className={`${TH} text-right`}>Days early</th>
                  <th className={`${TH} text-right`}>Area (ha)</th>
                  <th className={`${TH} text-right`}>Quantity</th>
                  <th className={`${TH} text-right`}>Weight (kg)</th>
                </tr>
              </thead>
              <tbody>
                {crops.map((c) => (
                  <tr key={c.id} className="border-t border-[#F0F4F0]">
                    <td className="px-3 py-2 font-semibold text-[#1A2B1A]">{c.crop}</td>
                    <td className="px-3 py-2">{c.parcel}</td>
                    <td className="whitespace-nowrap px-3 py-2">{c.expected}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.daysEarly}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.area}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.kg}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#E2E8E2] bg-[#F9FAF9] font-bold">
                  <td className="px-3 py-2" colSpan={6}>Total harvest (kg)</td>
                  <td className="px-3 py-2 text-right tabular-nums" data-testid="crop-forced-harvest-total">{kgText(d.total_kg)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </ModalShell>
  )
}
