import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { DetailTable, FormSection } from '../../components/UI/FormTable.jsx'
import { EntryCell, EntryHead, EntryRow, EntryTable, EntryTh } from '../../components/UI/EntryTable.jsx'
import { forcedCropRows, forcedDetailRows, kgText } from './forcedHarvestDetails.js'

// The saved details of a crop forced harvest (the window the red FORCED HARVEST label opens): GET /production/forced-harvest/<id>/, the
// saved record and never state kept in the page, laid out as two tables like the Aquaculture Force Harvest details.

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
        <div className="space-y-3" data-testid="crop-forced-harvest-details">
          <DetailTable title="Forced Harvest Details" fields={forcedDetailRows(d).map(([label, value]) => ({ label, value, wide: label === 'Reason for Forced Harvest' || label === 'Remarks' }))} />
          <FormSection title="Crops Harvested">
            <EntryTable bare label="Crops harvested" testId="crop-forced-harvest-crops">
              <EntryHead>
                <EntryTh>Crop</EntryTh>
                <EntryTh>Parcel</EntryTh>
                <EntryTh>Expected Harvest</EntryTh>
                <EntryTh className="md:text-right">Days Early</EntryTh>
                <EntryTh className="md:text-right">Area (ha)</EntryTh>
                <EntryTh className="md:text-right">Quantity</EntryTh>
                <EntryTh className="md:text-right">Weight (kg)</EntryTh>
              </EntryHead>
              <tbody>
                {crops.map((c) => (
                  <EntryRow key={c.id}>
                    <EntryCell label="Crop" className="font-semibold text-[#1A2B1A]">{c.crop}</EntryCell>
                    <EntryCell label="Parcel">{c.parcel}</EntryCell>
                    <EntryCell label="Expected Harvest" className="whitespace-nowrap">{c.expected}</EntryCell>
                    <EntryCell label="Days Early" className="tabular-nums md:text-right">{c.daysEarly}</EntryCell>
                    <EntryCell label="Area (ha)" className="tabular-nums md:text-right">{c.area}</EntryCell>
                    <EntryCell label="Quantity" className="tabular-nums md:text-right">{c.quantity}</EntryCell>
                    <EntryCell label="Weight (kg)" className="tabular-nums md:text-right">{c.kg}</EntryCell>
                  </EntryRow>
                ))}
              </tbody>
              <tfoot>
                <EntryRow tone="bg-[#F9FAF9] font-bold">
                  <EntryCell colSpan={6}>Total harvest (kg)</EntryCell>
                  <EntryCell className="tabular-nums md:text-right" data-testid="crop-forced-harvest-total">{kgText(d.total_kg)}</EntryCell>
                </EntryRow>
              </tfoot>
            </EntryTable>
          </FormSection>
        </div>
      )}
    </ModalShell>
  )
}
