import { useEffect, useMemo, useState } from 'react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { SourceAgencyMultiSelect, TypeConditionalFields } from './sharedAssistanceFields.jsx'
import {
  EMPTY_TYPE_CONDITIONAL_FIELDS, buildTypeConditionalPayload, validateTrainingDuration, isTrainingType,
} from './assistanceFieldHelpers.js'

// Must match interventions.models.FisherfolkBeneficiaryRecord.AssistanceType exactly
// (Batch 6: absorbed from fisheries.models.FisheriesAssistanceRecord) — this is a
// model CharField with choices, so the backend 400s on anything else.
const ASSISTANCE_TYPE_OPTIONS = [
  'Fishing Gear',
  'Boat/Vessel',
  'Fingerlings/Seeds',
  'Feed',
  'Cash Assistance',
  'Equipment',
  'Training',
  'Other',
]

const UNIT_OPTIONS = [
  'Pieces',
  'Sets',
  'Kilograms',
  'Liters',
  'Boxes',
  'Bags',
  'Sacks',
  'Units',
  'Boat',
  'Fish Cage',
  'Fish Pen',
  'Fishing Net',
  'Engine',
]

const STATUS_OPTIONS = ['Pending', 'Approved', 'Released', 'Received', 'Completed']

function LogGovernmentAssistanceModal({ onClose, onSuccess }) {
  const { showToast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [searchTerm, setSearchTerm] = useState('')
  const [ffResults, setFfResults] = useState([])
  const [selectedFisherfolk, setSelectedFisherfolk] = useState(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const [form, setForm] = useState({
    assistance_type: '',
    assistance_type_other: '',
    source_agencies: [],
    date_received: '',
    quantity: '',
    unit: '',
    unit_other: '',
    status: 'Pending',
    remarks: '',
    description: '',
    ...EMPTY_TYPE_CONDITIONAL_FIELDS,
  })

  useEffect(() => {
    let mounted = true
    const loadFisherfolk = async () => {
      try {
        const r = await api.get('/fisheries/fisherfolk/')
        const rows = Array.isArray(r.data) ? r.data : (r.data.results || [])
        const activeRows = rows.filter((ff) => ff?.is_active !== false)
        if (mounted) setFfResults(activeRows)
      } catch {
        if (mounted) setFfResults([])
      }
    }
    loadFisherfolk()
    return () => { mounted = false }
  }, [])

  const filteredFisherfolk = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return ffResults
    return ffResults.filter((ff) => {
      const fullName = (ff.full_name || '').toLowerCase()
      const firstName = (ff.first_name || '').toLowerCase()
      const middleName = (ff.middle_name || '').toLowerCase()
      const lastName = (ff.last_name || '').toLowerCase()
      const lgu = (ff.lgu_registration_number || '').toLowerCase()
      const barangay = (ff.barangay || '').toLowerCase()
      return (
        fullName.includes(q)
        || firstName.includes(q)
        || middleName.includes(q)
        || lastName.includes(q)
        || `${firstName} ${middleName} ${lastName}`.replace(/\s+/g, ' ').trim().includes(q)
        || `${firstName} ${lastName}`.trim().includes(q)
        || `${lastName} ${firstName}`.trim().includes(q)
        || lgu.includes(q)
        || barangay.includes(q)
      )
    })
  }, [ffResults, searchTerm])

  const isCashType = form.assistance_type === 'Cash Assistance'
  const isTraining = isTrainingType(form.assistance_type)

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))
  const setAssistanceType = (v) => setForm((p) => ({ ...p, assistance_type: v, quantity: '', unit: '', unit_other: '', ...EMPTY_TYPE_CONDITIONAL_FIELDS }))

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!selectedFisherfolk) {
      showToast('Select a fisherfolk record first.', 'error')
      return
    }

    if (!form.assistance_type || !form.status) {
      showToast('Fill in all required fields.', 'error')
      return
    }

    if (!form.date_received) {
      showToast('Date Received is required.', 'error')
      return
    }

    if (!isTraining && (!form.quantity || Number(form.quantity) <= 0)) {
      showToast(isCashType ? 'Cash assistance requires a valid amount received.' : 'Quantity / Amount must be greater than 0.', 'error')
      return
    }

    if (!isCashType && !isTraining && !form.unit) {
      showToast('Unit is required.', 'error')
      return
    }

    if (form.assistance_type === 'Other' && !form.assistance_type_other.trim()) {
      showToast('Specify Assistance Type.', 'error')
      return
    }

    if (!isCashType && !isTraining && form.unit === 'Other' && !form.unit_other.trim()) {
      showToast('Specify Unit.', 'error')
      return
    }

    const trainingError = validateTrainingDuration(form.assistance_type, form)
    if (trainingError) { showToast(trainingError, 'error'); return }

    const assistanceType = form.assistance_type === 'Other' ? form.assistance_type_other.trim() : form.assistance_type
    const unit = isCashType ? 'PHP' : (form.unit === 'Other' ? form.unit_other.trim() : form.unit)

    const selectedYear = new Date(form.date_received).getFullYear()

    // This model has no dedicated unit/status fields — folded into remarks
    // below so the info the clerk entered isn't silently discarded (Batch 6:
    // was fisheries.FisheriesAssistanceRecord).
    const unitNote = !isCashType && !isTraining && unit ? `Unit: ${unit}` : ''
    const statusNote = form.status ? `Status: ${form.status}` : ''
    const combinedRemarks = [statusNote, unitNote, form.remarks].filter(Boolean).join(' | ')

    const payload = {
      fisherfolk: selectedFisherfolk.id,
      assistance_type: assistanceType,
      source_agencies: form.source_agencies,
      date_given: form.date_received,
      year: selectedYear,
      quantity: isTraining ? '' : form.quantity,
      description: form.description || '',
      remarks: combinedRemarks,
      ...buildTypeConditionalPayload(form.assistance_type, form, { allowSeedFertilizer: false }),
    }

    setIsSubmitting(true)
    try {
      await api.post('/interventions/fisherfolk-beneficiaries/adhoc/', payload)
      showToast('Assistance logged successfully.')
      onSuccess?.()
      onClose?.()
    } catch (error) {
      console.log('PAYLOAD SENT:', payload)
      console.log('BACKEND ERROR:', error.response?.data)

      const backendData = error.response?.data
      let message = 'Failed to log assistance.'

      if (typeof backendData === 'string') {
        message = backendData
      } else if (backendData && typeof backendData === 'object') {
        const flattened = Object.entries(backendData)
          .map(([field, detail]) => {
            if (Array.isArray(detail)) return `${field}: ${detail.join(', ')}`
            if (typeof detail === 'string') return `${field}: ${detail}`
            return `${field}: ${JSON.stringify(detail)}`
          })
          .join(' | ')
        if (flattened) message = flattened
      }

      showToast(message, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell title="Log Individual Assistance" onClose={onClose} widthClassName="max-w-4xl">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="relative z-10">
          <label className="block text-xs text-slate-500 mb-1">
            Find Fisherfolk <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className={baseInputClasses}
            value={searchTerm}
            onChange={(e) => {
              const val = e.target.value
              setSearchTerm(val)
              setIsDropdownOpen(true)
              if (!val.trim()) setSelectedFisherfolk(null)
            }}
            onFocus={() => setIsDropdownOpen(true)}
            placeholder="Search by name or LGU registration number"
          />
          {isDropdownOpen && (
            <div className="absolute left-0 right-0 mt-1 max-h-52 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm z-20">
              {filteredFisherfolk.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-500">No fisherfolk found.</div>
              ) : (
                filteredFisherfolk.map((ff) => (
                  <button
                    key={ff.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-slate-50"
                    onClick={() => {
                      setSelectedFisherfolk(ff)
                      setSearchTerm(ff.full_name || `${ff.first_name || ''} ${ff.last_name || ''}`.trim())
                      setIsDropdownOpen(false)
                    }}
                  >
                    <div className="text-sm font-medium text-slate-700">{ff.full_name || `${ff.first_name || ''} ${ff.last_name || ''}`.trim()}</div>
                    <div className="text-xs text-slate-500">
                      LGU: {ff.lgu_registration_number || '—'} • {ff.barangay || 'No barangay'}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Barangay">
            <input className={baseInputClasses} value={selectedFisherfolk?.barangay || ''} readOnly />
          </FormField>

          <FormField label="Date Received" required>
            <input
              type="date"
              className={baseInputClasses}
              value={form.date_received}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => set('date_received', e.target.value)}
            />
          </FormField>

          <FormField label="Assistance Type" required>
            <ComboboxWithOther
              options={ASSISTANCE_TYPE_OPTIONS.filter(o => o !== 'Other')}
              value={form.assistance_type}
              otherValue={form.assistance_type_other}
              onChange={setAssistanceType}
              onOtherChange={(v) => set('assistance_type_other', v)}
              placeholder="Select Assistance Type"
            />
          </FormField>

          {!isTraining && (
            <FormField label={isCashType ? 'Amount Received (₱)' : 'Quantity / Amount'} required>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className={baseInputClasses}
                value={form.quantity}
                onChange={(e) => set('quantity', e.target.value)}
              />
            </FormField>
          )}

          {!isCashType && !isTraining && (
            <FormField label="Unit" required>
              <ComboboxWithOther
                options={UNIT_OPTIONS}
                value={form.unit}
                otherValue={form.unit_other}
                onChange={(v) => set('unit', v)}
                onOtherChange={(v) => set('unit_other', v)}
                placeholder="Select Unit"
              />
            </FormField>
          )}

          <TypeConditionalFields assistanceType={form.assistance_type} form={form} set={set} allowSeedFertilizer={false} />

          <FormField label="Status" required>
            <select
              className={baseInputClasses}
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
            >
              {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </FormField>
        </div>

        <FormField label="Source of Assistance">
          <SourceAgencyMultiSelect value={form.source_agencies} onChange={(v) => set('source_agencies', v)} />
        </FormField>

        <FormField label="Description">
          <textarea
            rows={2}
            className={baseInputClasses}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </FormField>

        <FormField label="Remarks">
          <textarea
            rows={2}
            className={baseInputClasses}
            value={form.remarks}
            onChange={(e) => set('remarks', e.target.value)}
          />
        </FormField>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Save Log</Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default LogGovernmentAssistanceModal
