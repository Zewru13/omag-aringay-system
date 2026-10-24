import { Archive } from 'lucide-react'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { cropCountLabel, parcelLabel, purgeReasonLabel } from './parcelRecords.js'

// A purged parcel's details (Crop Records > Purged Parcels > click a row): the parcel as it was, and why, when and by whom it was
// purged. Read-only.

const fmtDate = (value) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`))
}
const fmtDateTime = (value) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function Rows({ rows }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-4 border-b border-[#F0F4F0] pb-2">
          <span className="text-[12px] font-medium text-[#7A8E7A]">{label}</span>
          <span className="break-words text-right text-[13px] font-semibold text-[#1A2B1A]">{value}</span>
        </div>
      ))}
    </div>
  )
}

export default function PurgedParcelDetailsModal({ parcel, onClose }) {
  const parcelRows = [
    ['Parcel number', parcelLabel(parcel)],
    ['Farmer', parcel.farmer_name || '—'],
    ['RSBSA number', parcel.rsbsa_number || '—'],
    ['Barangay', parcel.barangay || '—'],
    ['Area (ha)', Number(parcel.area_hectares).toFixed(2)],
    ['Land ownership', parcel.land_ownership || '—'],
    ['Main crop', parcel.commodity_name || '—'],
    ['Crop records kept', cropCountLabel(parcel.record_count).replace('No crops yet', 'None')],
  ]
  const purgeRows = [
    ['Reason', purgeReasonLabel(parcel.purge_reason, parcel.purge_reason_other)],
    ['Date of occurrence', fmtDate(parcel.purge_date)],
    ['Purged by', parcel.purged_by_name || '—'],
    ['Recorded on', fmtDateTime(parcel.purged_at)],
  ]

  return (
    <ModalShell
      title={`Purged Parcel — ${parcelLabel(parcel)}`}
      subtitle="Read-only detail view"
      icon={Archive}
      iconBg="bg-rose-100"
      iconColor="text-rose-600"
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">
        <section>
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#4A5E4A]">The parcel</h3>
          <Rows rows={parcelRows} />
        </section>
        <section>
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#4A5E4A]">Why it was purged</h3>
          <Rows rows={purgeRows} />
          <div className="mt-3">
            <p className="mb-1 text-[12px] font-medium text-[#7A8E7A]">Note</p>
            <p className="whitespace-pre-wrap break-words rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-2 text-[13px] text-[#1A2B1A]">
              {parcel.purge_note || 'No note.'}
            </p>
          </div>
        </section>
      </div>
    </ModalShell>
  )
}
