import { useEffect, useState } from 'react'
import { MapPinned } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { parcelLabel } from '../CropInformation/parcelRecords.js'

// View Parcel (Crop Monitoring > Group by Farm Parcel > a parcel's ⋮ menu): everything on file about one parcel, read-only: where it
// is, how big, who works it, and the crops and machinery declared on it. "Edit parcel" is the other item in the same menu.

const cropName = (c) => (c.crop_name === 'Other' ? c.crop_name_other || 'Other' : c.crop_name)
const machineryName = (m) => (m.machinery_type === 'Other' ? m.machinery_type_other || 'Other' : m.machinery_type)

// A row marked optional (third item true) is left out while it is empty, so a parcel does not show a column of dashes.
function Rows({ rows }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.filter(([, value, optional]) => !optional || value).map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-4 border-b border-[#F0F4F0] pb-2">
          <span className="text-[12px] font-medium text-[#7A8E7A]">{label}</span>
          <span className="break-words text-right text-[13px] font-semibold text-[#1A2B1A]">{value || '—'}</span>
        </div>
      ))}
    </div>
  )
}

function Heading({ children }) {
  return <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#4A5E4A]">{children}</h3>
}

export default function ParcelViewModal({ group, onClose }) {
  const [state, setState] = useState({ id: null, parcel: null, failed: false })
  useEffect(() => {
    let alive = true
    api.get(`/farmers/parcels/${group.id}/`)
      .then((r) => alive && setState({ id: group.id, parcel: r.data, failed: false }))
      .catch(() => alive && setState({ id: group.id, parcel: null, failed: true }))
    return () => { alive = false }
  }, [group.id])

  const loading = state.id !== group.id
  const { parcel, failed } = state
  const title = parcelLabel({ id: group.id, parcel_number: parcel?.parcel_number ?? (group.name?.startsWith('Parcel #') ? '' : group.name) })

  return (
    <ModalShell
      title={`Farm Parcel — ${title}`}
      subtitle={`${group.farmer_name || 'Farmer'} · Read-only detail view`}
      icon={MapPinned}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
      ) : failed || !parcel ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">Unable to load this parcel. Please try again.</p>
      ) : (
        <div className="space-y-5">
          <section>
            <Heading>The parcel</Heading>
            <Rows rows={[
              ['Parcel number', parcelLabel(parcel)],
              ['Farmer', group.farmer_name],
              ['RSBSA number', group.rsbsa_number],
              ['Barangay', parcel.barangay],
              ['Area (ha)', Number(parcel.area_hectares).toFixed(2)],
              ['Land ownership', parcel.land_ownership],
              ['Land owner', parcel.land_owner_name, true],
              ['Land owner RSBSA', parcel.land_owner_rsbsa_number, true],
              ['Tax declaration no.', parcel.tax_declaration_number, true],
              ['Farm type', parcel.farm_type, true],
              ['Cropping schedule', parcel.cropping_schedule, true],
              ['Classifications', (parcel.classifications || []).join(', '), true],
            ]} />
          </section>

          <section>
            <Heading>Crop records on it</Heading>
            <Rows rows={[
              ['Records', String(group.count ?? 0)],
              ['Area planted (ha)', Number(group.area_planted_ha || 0).toFixed(2)],
              ['Near harvest', String(group.near_harvest ?? 0)],
            ]} />
          </section>

          <section>
            <Heading>Crops declared on the parcel</Heading>
            {(parcel.crops || []).length === 0 ? (
              <p className="text-[13px] text-[#7A8E7A]">None declared.</p>
            ) : (
              <ul className="divide-y divide-[#F0F4F0] rounded-lg border border-[#E2E8E2]">
                {parcel.crops.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-[13px]">
                    <span className="font-medium text-[#1A2B1A]">{cropName(c)}{c.is_main_crop ? ' · main crop' : ''}</span>
                    <span className="text-[#4A5E4A]">{Number(c.area_hectares).toFixed(2)} ha{c.variety_used ? ` · ${c.variety_used}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <Heading>Machinery on the parcel</Heading>
            {(parcel.machinery || []).length === 0 ? (
              <p className="text-[13px] text-[#7A8E7A]">None declared.</p>
            ) : (
              <ul className="divide-y divide-[#F0F4F0] rounded-lg border border-[#E2E8E2]">
                {parcel.machinery.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-[13px]">
                    <span className="font-medium text-[#1A2B1A]">{machineryName(m)}</span>
                    <span className="text-[#4A5E4A]">{m.quantity} · {m.ownership}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </ModalShell>
  )
}
