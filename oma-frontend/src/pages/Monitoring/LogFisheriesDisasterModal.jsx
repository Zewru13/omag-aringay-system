import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import SearchBar from '../../components/UI/SearchBar.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import {
  AQUACULTURE_EQUIPMENT_GROUPS, FISHERFOLK_DISASTER_TYPES, equipmentPayload, saveErrorMessage,
} from './fisheriesDisasterConstants.js'
import { DamagePhotosField, EquipmentChecklist } from './fisheriesDisasterShared.jsx'
import useDamagePhotos from './useDamagePhotos.js'

const DISASTER_TYPES = [
  'Typhoon', 'Flooding', 'Storm Surge', 'El Nino Drought', 'Red Tide', 'Disease Outbreak', 'Other',
]

const EQUIPMENT_DAMAGED_OPTIONS = [
  'Boat',
  'Fishing Net',
  'Fish Cage',
  'Fish Pen',
  'Fish Trap',
  'Crab Trap',
  'Fishing Gear',
  'Engine',
  'Paddle',
  'Cooler / Ice Box',
  'Fishpond Dike',
  'Pond Gate',
  'Fingerlings',
  'Feeds',
  'Other',
]
const STAFF_EQUIPMENT_GROUPS = [{ label: null, options: EQUIPMENT_DAMAGED_OPTIONS }]

// onSuccess(log) receives the saved log (the API's response), so the page can open its Disaster Details.
// fixedFisherfolk: Admin logging for a chosen fisherfolk (Admin > Disaster > Fisheries Disaster) - the full
// aquaculture form, exactly as the fisherfolk gets it. Without it, staff get the original form unchanged.
function LogFisheriesDisasterModal({ onClose, onSuccess, fixedFisherfolk = null }) {
  const { showToast } = useToast()
  const { isFisherfolk } = useAuth()
  const [ffSearch, setFfSearch] = useState('')
  const [ffResults, setFfResults] = useState([])
  const [selectedFf, setSelectedFf] = useState(fixedFisherfolk)
  // The aquaculture form: a fisherfolk's own account, or Admin logging for one chosen fisherfolk.
  const aquaculture = isFisherfolk || Boolean(fixedFisherfolk)
  // A fisherfolk account reports for THEMSELVES: their own record (the only one the fisherfolk API
  // returns to them) is fixed here instead of a search, and the backend forces it again on save.
  useEffect(() => {
    if (!isFisherfolk) return
    api.get('/fisheries/fisherfolk/')
      .then(r => setSelectedFf((Array.isArray(r.data) ? r.data : (r.data.results || []))[0] || null))
      .catch(() => showToast('Failed to load your fisherfolk record.', 'error'))
  }, [isFisherfolk, showToast])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [photo, setPhoto] = useState(null)
  const [form, setForm] = useState({
    date_of_occurrence: new Date().toISOString().slice(0, 10),
    disaster_type: 'Typhoon',
    disaster_type_other_specify: '',
    estimated_damage: '',
    volume_lost_kg: '',
    equipment_damaged: [],
    equipment_damaged_other: '',
  })
  // Damage photos (fisherfolk): 0-10, from the live camera and/or the file picker.
  const damagePhotos = useDamagePhotos()

  const handleFfSearch = async (q) => {
    setFfSearch(q)
    if (!q) { setFfResults([]); return }
    try {
      const r = await api.get(`/fisheries/fisherfolk/?search=${encodeURIComponent(q)}`)
      setFfResults(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setFfResults([]) }
  }

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))
  const equipmentGroups = aquaculture ? AQUACULTURE_EQUIPMENT_GROUPS : STAFF_EQUIPMENT_GROUPS
  const disasterTypes = aquaculture ? FISHERFOLK_DISASTER_TYPES : DISASTER_TYPES

  const toggleEquipment = (option) => {
    setForm((prev) => {
      const exists = prev.equipment_damaged.includes(option)
      const next = exists
        ? prev.equipment_damaged.filter((item) => item !== option)
        : [...prev.equipment_damaged, option]

      return {
        ...prev,
        equipment_damaged: next,
        equipment_damaged_other: next.includes('Other') ? prev.equipment_damaged_other : '',
      }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSubmitting) return
    if (!selectedFf) { showToast('Select a fisherfolk.', 'error'); return }

    // The backend requires the actual disaster type when "Other" is chosen.
    if (form.disaster_type === 'Other' && !form.disaster_type_other_specify.trim()) {
      showToast('Please specify the disaster type.', 'error'); return
    }

    if (form.equipment_damaged.includes('Other') && !form.equipment_damaged_other.trim()) {
      showToast('Specify Equipment Damaged.', 'error'); return
    }

    setIsSubmitting(true)
    try {
      const fields = {
        fisherfolk: selectedFf.id,
        date_of_occurrence: form.date_of_occurrence,
        disaster_type: form.disaster_type,
        disaster_type_other_specify: form.disaster_type === 'Other' ? form.disaster_type_other_specify.trim() : '',
        estimated_damage: form.estimated_damage,
        volume_lost_kg: form.volume_lost_kg ? parseFloat(form.volume_lost_kg) : null,
        equipment_damaged: equipmentPayload(form.equipment_damaged, form.equipment_damaged_other),
      }
      let payload = fields
      if (photo || damagePhotos.photos.length) {
        payload = new FormData()
        Object.entries(fields).forEach(([k, v]) => { if (v !== null && v !== undefined) payload.append(k, v) })
        if (photo) payload.append('photo', photo)
        // Every damage photo as its own `photos` file - the backend stores each one separately.
        damagePhotos.photos.forEach(p => payload.append('photos', p.file, p.file.name))
      }
      const r = await api.post('/monitoring/fisherfolk-disasters/', payload)
      showToast(isFisherfolk ? 'Disaster logged and submitted to Admin successfully.'
        : fixedFisherfolk ? `Disaster logged for ${fixedFisherfolk.full_name}.` : 'Disaster report submitted.', 'success')
      onSuccess(r.data)
      onClose()
    } catch (err) {
      // Show the server's actual reason (field error, photo error, or server error) - never a false
      // success. The form stays open with everything entered, so the user can correct and retry.
      showToast(saveErrorMessage(err), 'error')
    } finally { setIsSubmitting(false) }
  }

  return (
    <ModalShell
      title={aquaculture ? 'Log Disaster' : 'Log Fisheries Disaster Report'}
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="log-fisheries-disaster-form" isLoading={isSubmitting} disabled={isSubmitting}>
            {aquaculture ? 'Log Disaster' : 'Submit Report'}
          </Button>
        </>
      }
    >
      <form id="log-fisheries-disaster-form" onSubmit={handleSubmit} className="space-y-4">
        {aquaculture ? (
          <FormField label="Fisherfolk">
            <p className="rounded-xl border border-green-200 bg-[#f0f7f0] px-3 py-2 text-sm font-medium text-slate-800">
              {selectedFf ? <>{selectedFf.full_name} <span className="ml-2 text-xs text-slate-400">{selectedFf.barangay}</span></> : 'Loading your fisherfolk record…'}
            </p>
          </FormField>
        ) : (
        <FormField label="Fisherfolk">
          <SearchBar value={ffSearch} onChange={handleFfSearch} placeholder="Search fisherfolk…" />
          {ffResults.length > 0 && (
            <ul className="mt-1 max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {ffResults.map(ff => (
                <li key={ff.id}>
                  <button type="button" className="w-full px-4 py-2.5 text-left text-sm hover:bg-[#f0f7f0]"
                    onClick={() => {
                      setSelectedFf(ff)
                      setFfSearch(ff.full_name)
                      setFfResults([])
                    }}>
                    <span className="font-medium">{ff.full_name}</span>
                    <span className="ml-2 text-slate-400">{ff.fisherfolk_type} · {ff.barangay}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedFf && <p className="mt-1 text-xs text-[#1E4620]">Selected: {selectedFf.full_name} ({selectedFf.fisherfolk_type})</p>}
        </FormField>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Date of Occurrence" required>
            <input type="date" className={baseInputClasses} required value={form.date_of_occurrence}
              max={new Date().toISOString().split('T')[0]}
              onChange={e => set('date_of_occurrence', e.target.value)} />
          </FormField>
          <FormField label="Disaster Type" required>
            <select className={baseInputClasses} value={form.disaster_type} onChange={e => set('disaster_type', e.target.value)}>
              {disasterTypes.map(d => <option key={d}>{d}</option>)}
            </select>
            {form.disaster_type === 'Other' && (
              <input
                className={`${baseInputClasses} mt-2`}
                value={form.disaster_type_other_specify}
                onChange={e => set('disaster_type_other_specify', e.target.value)}
                placeholder="Specify disaster type"
                maxLength={150}
                required
              />
            )}
          </FormField>
          <FormField label="Volume Lost (kg)">
            <input type="number" step="0.01" className={baseInputClasses} min="0" value={form.volume_lost_kg} onChange={e => set('volume_lost_kg', e.target.value)} />
          </FormField>
          <FormField label="Equipment Damaged">
            <EquipmentChecklist
              groups={equipmentGroups}
              selected={form.equipment_damaged}
              onToggle={toggleEquipment}
              otherValue={form.equipment_damaged_other}
              onOtherChange={(v) => set('equipment_damaged_other', v)}
              inputClassName={baseInputClasses}
            />
          </FormField>
          <FormField label="Description of Damage" required className="sm:col-span-2">
            <textarea className={baseInputClasses} rows={3} required value={form.estimated_damage} onChange={e => set('estimated_damage', e.target.value)} />
          </FormField>
          {aquaculture ? (
            <div className="sm:col-span-2">
              <DamagePhotosField photosState={damagePhotos} />
            </div>
          ) : (
            <FormField label="Photo (optional)" className="sm:col-span-2">
              <input type="file" accept="image/jpeg,image/png,image/webp" className={baseInputClasses}
                onChange={e => setPhoto(e.target.files?.[0] || null)} />
              <p className="mt-1 text-xs text-slate-400">JPG, PNG, or WEBP, up to 5 MB.</p>
            </FormField>
          )}
        </div>

      </form>
    </ModalShell>
  )
}

export default LogFisheriesDisasterModal
