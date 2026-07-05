import { useEffect, useMemo, useState } from 'react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const ASSISTANCE_TYPE_OPTIONS = [
  'Cash Assistance',
  'Fuel Subsidy',
  'Fishing Gear',
  'Fishing Nets',
  'Boat',
  'Boat Repair',
  'Fish Cage',
  'Fingerlings',
  'Feeds',
  'Livelihood Assistance',
  'Training / Seminar',
  'Insurance Assistance',
  'Financial Assistance',
  'Equipment',
  'Others',
]

const SOURCE_OPTIONS = [
  'LGU',
  'MAO',
  'BFAR',
  'DA',
  'NGO',
  'Private Donor',
  'Others',
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
  'Others',
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
    source_of_assistance: '',
    source_of_assistance_other: '',
    date_received: '',
    quantity: '',
    unit: '',
    unit_other: '',
    status: 'Pending',
    remarks: '',
    description: '',
  })

  useEffect(() => {
    let mounted = true
    const loadFisherfolk = async () => {
      try {
        const r = await api.get('/fisheries/')
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

  const isCashType = form.assistance_type === 'Cash Assistance' || form.assistance_type === 'Financial Assistance'

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!selectedFisherfolk) {
      showToast('Select a fisherfolk record first.', 'error')
      return
    }

    if (!form.assistance_type || !form.source_of_assistance || !form.quantity || !form.status) {
      showToast('Fill in all required fields.', 'error')
      return
    }

    if (!form.date_received) {
      showToast('Date Received is required.', 'error')
      return
    }

    if (isCashType && (!form.quantity || Number(form.quantity) <= 0)) {
      showToast('Cash assistance requires a valid amount received.', 'error')
      return
    }

    if (!isCashType && (!form.quantity || Number(form.quantity) <= 0)) {
      showToast('Quantity / Amount must be greater than 0.', 'error')
      return
    }

    if (!isCashType && !form.unit) {
      showToast('Unit is required.', 'error')
      return
    }

    if (form.assistance_type === 'Others' && !form.assistance_type_other.trim()) {
      showToast('Specify Assistance Type.', 'error')
      return
    }

    if (form.source_of_assistance === 'Others' && !form.source_of_assistance_other.trim()) {
      showToast('Specify Source of Assistance.', 'error')
      return
    }

    if (!isCashType && form.unit === 'Others' && !form.unit_other.trim()) {
      showToast('Specify Unit.', 'error')
      return
    }

    const assistanceType = form.assistance_type === 'Others' ? form.assistance_type_other.trim() : form.assistance_type
    const source = form.source_of_assistance === 'Others' ? form.source_of_assistance_other.trim() : form.source_of_assistance
    const unit = isCashType ? 'PHP' : (form.unit === 'Others' ? form.unit_other.trim() : form.unit)

    const selectedYear = new Date(form.date_received).getFullYear()

    const payload = {
      fisherfolk: selectedFisherfolk.id,
      assistance_type: assistanceType,
      source_of_assistance: source,
      date_received: form.date_received,
      year: selectedYear,
      quantity: form.quantity,
      unit,
      status: form.status,
      description: form.description || '',
      remarks: form.remarks || '',
    }

    setIsSubmitting(true)
    try {
      await api.post('/monitoring/fisheries-assistance/', payload)
      showToast('Government assistance logged successfully.')
      onSuccess?.()
      onClose?.()
    } catch (error) {
      console.log('PAYLOAD SENT:', payload)
      console.log('BACKEND ERROR:', error.response?.data)

      const backendData = error.response?.data
      let message = 'Failed to log government assistance.'

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
    <ModalShell title="Log Government Assistance" onClose={onClose} widthClassName="max-w-4xl">
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
              onChange={(e) => set('date_received', e.target.value)}
            />
          </FormField>

          <FormField label="Assistance Type" required>
            <select
              className={baseInputClasses}
              value={form.assistance_type}
              onChange={(e) => {
                const value = e.target.value
                set('assistance_type', value)
                if (value !== 'Others') set('assistance_type_other', '')
              }}
            >
              <option value="">Select Assistance Type</option>
              {ASSISTANCE_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            {form.assistance_type === 'Others' && (
              <input
                type="text"
                className={`${baseInputClasses} mt-2`}
                placeholder="Specify Assistance Type"
                value={form.assistance_type_other}
                onChange={(e) => set('assistance_type_other', e.target.value)}
              />
            )}
          </FormField>

          <FormField label="Source of Assistance" required>
            <select
              className={baseInputClasses}
              value={form.source_of_assistance}
              onChange={(e) => {
                const value = e.target.value
                set('source_of_assistance', value)
                if (value !== 'Others') set('source_of_assistance_other', '')
              }}
            >
              <option value="">Select Source</option>
              {SOURCE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            {form.source_of_assistance === 'Others' && (
              <input
                type="text"
                className={`${baseInputClasses} mt-2`}
                placeholder="Specify Source of Assistance"
                value={form.source_of_assistance_other}
                onChange={(e) => set('source_of_assistance_other', e.target.value)}
              />
            )}
          </FormField>

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

          {!isCashType && (
            <FormField label="Unit" required>
              <select
                className={baseInputClasses}
                value={form.unit}
                onChange={(e) => {
                  const value = e.target.value
                  set('unit', value)
                  if (value !== 'Others') set('unit_other', '')
                }}
              >
                <option value="">Select Unit</option>
                {UNIT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              {form.unit === 'Others' && (
                <input
                  type="text"
                  className={`${baseInputClasses} mt-2`}
                  placeholder="Specify Unit"
                  value={form.unit_other}
                  onChange={(e) => set('unit_other', e.target.value)}
                />
              )}
            </FormField>
          )}

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
