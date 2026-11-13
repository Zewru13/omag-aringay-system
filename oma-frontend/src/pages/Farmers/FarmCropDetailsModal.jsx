import { useEffect, useState } from 'react'
import { Sprout } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import { DetailTable } from '../../components/UI/FormTable.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { loadAllPages } from '../../utils/loadAllPages.js'
import { harvestRows, summaryRows } from '../Monitoring/cropDetails.js'
import { cropGrownName, cropGrownRows, plantingsOf } from './farmerProfile.js'

// "View details" of a crop grown on a parcel: what was declared for the crop (variety, area, seeds, source, PCIC), then, for every planting of it on that
// parcel, the full details of the planting and, once it is harvested, its harvest. The activities, pest reports, disasters and remarks of a planting are
// in Crop Monitoring and are not shown here.
const TONES = { Planted: 'green', 'Near Harvest': 'amber', Harvested: 'blue', 'Total Loss': 'rose' }
const asFields = (rows) => rows.map(([label, value]) => ({ label, value }))

function PlantingDetails({ record }) {
  const [harvest, setHarvest] = useState(null)

  useEffect(() => {
    if (!record.harvest_record_id) return undefined
    let alive = true
    api.get(`/production/${record.harvest_record_id}/`).then((r) => { if (alive) setHarvest(r.data) }).catch(() => {})
    return () => { alive = false }
  }, [record.harvest_record_id])

  const harvested = harvestRows(harvest)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={TONES[record.status] || 'slate'}>{record.status}</StatusPill>
      </div>
      <DetailTable title={`Planting — ${[record.season, record.year].filter(Boolean).join(' ') || 'details'}`} fields={asFields(summaryRows(record))} />
      {harvested.length > 0 && <DetailTable title="Harvest" fields={asFields(harvested)} />}
    </div>
  )
}

export default function FarmCropDetailsModal({ crop, parcel, onClose }) {
  const [plantings, setPlantings] = useState(null)   // null while loading

  useEffect(() => {
    let alive = true
    loadAllPages((u, o) => api.get(u, o), '/production/monitoring/', { farm_parcel: parcel.id, status: 'Planted,Near Harvest,Harvested,Total Loss' })
      .then((all) => { if (alive) setPlantings(plantingsOf(crop, all)) })
      .catch(() => { if (alive) setPlantings([]) })
    return () => { alive = false }
  }, [crop, parcel.id])

  return (
    <ModalShell
      title={`Crop Details — ${cropGrownName(crop) || 'Crop'}`}
      subtitle={parcel.parcel_number ? `Parcel ${parcel.parcel_number}` : ''}
      icon={Sprout}
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={<Button type="button" variant="outline" onClick={onClose}>Close</Button>}
    >
      <div className="space-y-4">
        <DetailTable title="Crop Grown" fields={asFields(cropGrownRows(crop))} />
        {plantings === null ? (
          <p className="py-4 text-center text-[13px] italic text-[#7A8E7A]">Loading the plantings…</p>
        ) : plantings.length === 0 ? (
          <p className="rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-4 py-3 text-[13px] italic text-[#7A8E7A]">No planting of this crop is on record for this parcel yet.</p>
        ) : (
          plantings.map((record) => <PlantingDetails key={record.id} record={record} />)
        )}
      </div>
    </ModalShell>
  )
}
