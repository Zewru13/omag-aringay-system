import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import PondModal from '../Fisheries/PondModal.jsx'

const ADD_NEW_VALUE = '__add_new__'

// Pond dropdown for the stocking form (Batch 3) — replaces the old freeform
// barangay/area/water-source inputs. Selecting a pond fills the read-only
// preview below from that pond's fields; the backend re-syncs
// pond_location_barangay/area_hectares/water_source from the pond on save
// regardless of what's submitted, so this preview is just showing the
// user what will actually be saved.
function PondSelector({ fisherfolkId, value, onSelectPond }) {
  const [ponds, setPonds] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)

  const fetchPonds = () => {
    if (!fisherfolkId) { setPonds([]); return Promise.resolve([]) }
    return api.get(`/fisheries/fisherfolk/${fisherfolkId}/ponds/`)
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : (r.data.results || [])
        const active = list.filter((p) => p.is_active)
        setPonds(active)
        return active
      })
      .catch(() => { setPonds([]); return [] })
  }

  useEffect(() => { fetchPonds() }, [fisherfolkId])

  const selectedPond = ponds.find((p) => String(p.id) === String(value))

  const handleChange = (e) => {
    const v = e.target.value
    if (v === ADD_NEW_VALUE) { setShowAddModal(true); return }
    if (!v) { onSelectPond(null); return }
    const pond = ponds.find((p) => String(p.id) === String(v))
    onSelectPond(pond || null)
  }

  const handlePondCreated = async () => {
    const active = await fetchPonds()
    const newest = active.reduce((a, b) => (!a || b.id > a.id ? b : a), null)
    if (newest) onSelectPond(newest)
  }

  return (
    <>
      <FormField label="Pond">
        <select
          className={baseInputClasses}
          value={value || ''}
          disabled={!fisherfolkId}
          onChange={handleChange}
        >
          <option value="">{fisherfolkId ? 'Select a pond…' : 'Select a fisherfolk first'}</option>
          {ponds.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.barangay ? ` — ${p.barangay}` : ''}</option>
          ))}
          {fisherfolkId && <option value={ADD_NEW_VALUE}>+ Add New Pond</option>}
        </select>
      </FormField>

      {selectedPond && (
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-2 text-[12px]">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#A8BCA8]">Barangay</p>
            <p className="font-medium text-[#1A2B1A]">{selectedPond.barangay || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#A8BCA8]">Area (ha)</p>
            <p className="font-medium text-[#1A2B1A]">{selectedPond.area_hectares ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#A8BCA8]">Water Source</p>
            <p className="font-medium text-[#1A2B1A]">{selectedPond.water_source || '—'}</p>
          </div>
        </div>
      )}

      {showAddModal && (
        <PondModal
          fisherfolkId={fisherfolkId}
          onClose={() => setShowAddModal(false)}
          onSuccess={handlePondCreated}
        />
      )}
    </>
  )
}

export default PondSelector
