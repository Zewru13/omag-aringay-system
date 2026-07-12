import { useEffect, useMemo, useState } from 'react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const VESSEL_CONDITION_OPTIONS = ['Good', 'Fair', 'Poor', 'For Repair']

function LogVesselInspectionModal({ onClose, onSuccess }) {
  const { showToast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [ffSearch, setFfSearch] = useState('')
  const [ffResults, setFfResults] = useState([])
  const [selectedFf, setSelectedFf] = useState(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const [form, setForm] = useState({
    inspection_date: '',
    license_number: '',
    license_expiry_date: '',
    vessel_condition: '',
    remarks: '',
  })

  useEffect(() => {
    let mounted = true
    const loadFisherfolk = async () => {
      try {
        // Backend restricts vessel inspections to Capture fisherfolk
        // (fisheries.models.VesselInspection.clean()).
        const r = await api.get('/fisheries/fisherfolk/', { params: { fisherfolk_type: 'Capture' } })
        const rows = Array.isArray(r.data) ? r.data : (r.data.results || [])
        if (mounted) setFfResults(rows)
      } catch {
        if (mounted) setFfResults([])
      }
    }
    loadFisherfolk()
    return () => { mounted = false }
  }, [])

  const filteredFisherfolk = useMemo(() => {
    const q = ffSearch.trim().toLowerCase()
    if (!q) return ffResults
    return ffResults.filter((ff) => {
      const fullName = (ff.full_name || '').toLowerCase()
      const lgu = (ff.lgu_registration_number || '').toLowerCase()
      return fullName.includes(q) || lgu.includes(q)
    })
  }, [ffResults, ffSearch])

  const handleFfSearch = async (q) => {
    setFfSearch(q)
    setIsDropdownOpen(true)
    const normalized = q.trim()
    try {
      const r = await api.get('/fisheries/fisherfolk/', {
        params: { fisherfolk_type: 'Capture', ...(normalized ? { search: normalized } : {}) },
      })
      const rows = Array.isArray(r.data) ? r.data : (r.data.results || [])
      setFfResults(rows)
    } catch {
      setFfResults([])
    }
  }

  const handleSelectFf = (ff) => {
    setSelectedFf(ff)
    setFfSearch(ff.full_name || `${ff.first_name || ''} ${ff.last_name || ''}`.trim())
    setIsDropdownOpen(false)
  }

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedFf) { showToast('Select a Capture fisherfolk.', 'error'); return }
    if (!form.inspection_date || !form.license_number.trim() || !form.license_expiry_date || !form.vessel_condition) {
      showToast('Fill in all required fields.', 'error'); return
    }

    setIsSubmitting(true)
    try {
      await api.post('/fisheries/vessel-inspections/', {
        fisherfolk: selectedFf.id,
        inspection_date: form.inspection_date,
        license_number: form.license_number.trim(),
        license_expiry_date: form.license_expiry_date,
        vessel_condition: form.vessel_condition,
        remarks: form.remarks,
      })
      showToast('Vessel inspection saved.', 'success')
      onSuccess?.()
      onClose?.()
    } catch (err) {
      const data = err?.response?.data
      const detail = data?.detail
        || (data && typeof data === 'object' && Object.entries(data).map(([f, d]) => `${f}: ${Array.isArray(d) ? d.join(', ') : d}`).join(' | '))
        || 'Failed to save.'
      showToast(detail, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell title="Log Vessel Inspection" onClose={onClose} maxWidth="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Fisherfolk (Capture)">
          <input
            type="text"
            className={baseInputClasses}
            value={ffSearch}
            onChange={(e) => handleFfSearch(e.target.value)}
            onFocus={() => setIsDropdownOpen(true)}
            placeholder="Search by name or LGU number…"
          />
          {isDropdownOpen && (
            <ul className="mt-1 max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {filteredFisherfolk.length > 0 ? (
                filteredFisherfolk.map((ff) => (
                  <li key={ff.id}>
                    <button
                      type="button"
                      className="w-full px-4 py-2.5 text-left text-sm hover:bg-[#f0f7f0]"
                      onClick={() => handleSelectFf(ff)}
                    >
                      <span className="font-medium">{ff.full_name || `${ff.first_name || ''} ${ff.last_name || ''}`.trim()}</span>
                      <span className="ml-2 text-slate-400">({ff.lgu_registration_number})</span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-4 py-2.5 text-sm text-slate-500">No Capture fisherfolk found</li>
              )}
            </ul>
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Inspection Date" required>
            <input
              type="date"
              className={baseInputClasses}
              value={form.inspection_date}
              onChange={(e) => set('inspection_date', e.target.value)}
            />
          </FormField>
          <FormField label="License Number" required>
            <input
              type="text"
              className={baseInputClasses}
              value={form.license_number}
              onChange={(e) => set('license_number', e.target.value)}
            />
          </FormField>
          <FormField label="License Expiry Date" required>
            <input
              type="date"
              className={baseInputClasses}
              value={form.license_expiry_date}
              onChange={(e) => set('license_expiry_date', e.target.value)}
            />
          </FormField>
          <FormField label="Vessel Condition" required>
            <select
              className={baseInputClasses}
              value={form.vessel_condition}
              onChange={(e) => set('vessel_condition', e.target.value)}
            >
              <option value="">Select Condition</option>
              {VESSEL_CONDITION_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField label="Remarks">
          <textarea
            className={baseInputClasses}
            rows={2}
            value={form.remarks}
            onChange={(e) => set('remarks', e.target.value)}
          />
        </FormField>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Save Inspection</Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default LogVesselInspectionModal
