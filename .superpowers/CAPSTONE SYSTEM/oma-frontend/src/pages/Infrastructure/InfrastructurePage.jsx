import { useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import EmptyState from '../../components/UI/EmptyState.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import LoadingSpinner from '../../components/UI/LoadingSpinner.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'

// ─── Static data ──────────────────────────────────────────────────────────────

const BARANGAYS = [
  'Alaska', 'Basca', 'Dulao', 'Gallano', 'Macabato', 'Manga',
  'Pangao-aoan East', 'Pangao-aoan West', 'Poblacion', 'Samara',
  'San Antonio', 'San Benito Norte', 'San Benito Sur', 'San Eugenio',
  'San Juan East', 'San Juan West', 'San Simon East', 'San Simon West',
  'Santa Cecilia', 'Santa Lucia', 'Santa Rita East', 'Santa Rita West',
  'Santo Rosario East', 'Santo Rosario West',
]

const FACILITY_STATUS = ['Operational', 'Non-Operational', 'Under Repair']
const ROAD_STATUS     = ['Good Condition', 'Needs Repair', 'Under Construction']

// ─── Tab configuration ────────────────────────────────────────────────────────

const TAB_CONFIGS = [
  {
    key: 'irrigation',
    label: 'Irrigation Facilities',
    endpoint: '/infrastructure/irrigation/',
    recordLabel: 'Irrigation Facility',
    emptyMsg: 'No irrigation facilities recorded.',
    columns: [
      { key: 'barangay',              label: 'Barangay' },
      { key: 'facility_name',         label: 'Facility Name' },
      { key: 'facility_type',         label: 'Type' },
      { key: 'service_area_hectares', label: 'Service Area (ha)' },
      { key: 'status',                label: 'Status' },
    ],
    fields: [
      { name: 'barangay',              label: 'Barangay',        type: 'select',  options: BARANGAYS, required: true },
      { name: 'facility_name',         label: 'Facility Name',   type: 'text',    required: true },
      { name: 'facility_type',         label: 'Facility Type',   type: 'select',  options: ['Communal Irrigation System', 'Small Water Impounding System', 'Solar-Powered Irrigation Pump', 'Diesel/Gas Pump', 'Other'], required: true },
      { name: 'service_area_hectares', label: 'Service Area (ha)', type: 'decimal', required: true },
      { name: 'status',                label: 'Status',          type: 'select',  options: FACILITY_STATUS, required: true },
      { name: 'remarks',               label: 'Remarks',         type: 'textarea', required: false },
    ],
  },
  {
    key: 'roads',
    label: 'Farm-to-Market Roads',
    endpoint: '/infrastructure/roads/',
    recordLabel: 'Road',
    emptyMsg: 'No farm-to-market roads recorded.',
    columns: [
      { key: 'barangay',  label: 'Barangay' },
      { key: 'road_name', label: 'Road Name' },
      { key: 'length_km', label: 'Length (km)' },
      { key: 'road_type', label: 'Road Type' },
      { key: 'status',    label: 'Status' },
    ],
    fields: [
      { name: 'barangay',  label: 'Barangay',    type: 'select',  options: BARANGAYS, required: true },
      { name: 'road_name', label: 'Road Name',   type: 'text',    required: true },
      { name: 'length_km', label: 'Length (km)', type: 'decimal', required: true },
      { name: 'road_type', label: 'Road Type',   type: 'select',  options: ['Concrete', 'Gravel', 'Earth/Unpaved', 'Asphalt'], required: true },
      { name: 'status',    label: 'Status',      type: 'select',  options: ROAD_STATUS, required: true },
      { name: 'remarks',   label: 'Remarks',     type: 'textarea', required: false },
    ],
  },
  {
    key: 'postHarvest',
    label: 'Post-Harvest Facilities',
    endpoint: '/infrastructure/post-harvest/',
    recordLabel: 'Post-Harvest Facility',
    emptyMsg: 'No post-harvest facilities recorded.',
    columns: [
      { key: 'barangay',     label: 'Barangay' },
      { key: 'facility_name', label: 'Facility Name' },
      { key: 'facility_type', label: 'Type' },
      { key: 'capacity',     label: 'Capacity' },
      { key: 'status',       label: 'Status' },
    ],
    fields: [
      { name: 'barangay',      label: 'Barangay',      type: 'select',  options: BARANGAYS, required: true },
      { name: 'facility_name', label: 'Facility Name', type: 'text',    required: true },
      { name: 'facility_type', label: 'Facility Type', type: 'select',  options: ['Multi-Purpose Drying Pavement', 'Warehouse/Storage', 'Rice Mill', 'Corn Mill', 'Cold Storage', 'Other'], required: true },
      { name: 'capacity',      label: 'Capacity',      type: 'text',    required: true, placeholder: 'e.g. 50 metric tons' },
      { name: 'status',        label: 'Status',        type: 'select',  options: FACILITY_STATUS, required: true },
      { name: 'remarks',       label: 'Remarks',       type: 'textarea', required: false },
    ],
  },
  {
    key: 'livestock',
    label: 'Community Livestock',
    endpoint: '/infrastructure/community-livestock/',
    recordLabel: 'Livestock Record',
    emptyMsg: 'No community livestock records found.',
    columns: [
      { key: 'barangay',           label: 'Barangay' },
      { key: '_type_display',      label: 'Type' },
      { key: 'total_head_count',   label: 'Total Head Count' },
      { key: 'year',               label: 'Year' },
    ],
    fields: [
      { name: 'barangay',             label: 'Barangay',       type: 'select', options: BARANGAYS, required: true },
      { name: 'livestock_type',       label: 'Livestock Type', type: 'select', options: ['Carabao', 'Cattle', 'Goat', 'Swine', 'Chicken', 'Duck', 'Other'], required: true },
      { name: 'livestock_type_other', label: 'Specify Type',  type: 'text',   required: false, showWhen: { field: 'livestock_type', value: 'Other' } },
      { name: 'total_head_count',     label: 'Total Head Count', type: 'number', required: true },
      { name: 'year',                 label: 'Year',           type: 'number', required: true },
    ],
    processRow: (row) => ({
      ...row,
      _type_display: row.livestock_type === 'Other' && row.livestock_type_other
        ? `Other — ${row.livestock_type_other}`
        : row.livestock_type,
    }),
  },
  {
    key: 'machinery',
    label: 'Community Machinery',
    endpoint: '/infrastructure/community-machinery/',
    recordLabel: 'Machinery Record',
    emptyMsg: 'No community machinery records found.',
    columns: [
      { key: 'barangay',      label: 'Barangay' },
      { key: '_type_display', label: 'Type' },
      { key: 'quantity',      label: 'Quantity' },
      { key: 'owner_type',    label: 'Owner Type' },
      { key: 'status',        label: 'Status' },
    ],
    fields: [
      { name: 'barangay',             label: 'Barangay',      type: 'select', options: BARANGAYS, required: true },
      { name: 'machinery_type',       label: 'Machinery Type', type: 'select', options: ['Hand Tractor', 'Four-Wheel Tractor', 'Thresher', 'Water Pump', 'Harvester', 'Rice Mill', 'Hauling Truck', 'Other'], required: true },
      { name: 'machinery_type_other', label: 'Specify Type',  type: 'text',   required: false, showWhen: { field: 'machinery_type', value: 'Other' } },
      { name: 'quantity',             label: 'Quantity',      type: 'number', required: true },
      { name: 'owner_type',           label: 'Owner Type',    type: 'select', options: ['LGU-Owned', 'Association-Owned', 'Privately-Owned'], required: true },
      { name: 'status',               label: 'Status',        type: 'select', options: FACILITY_STATUS, required: true },
    ],
    processRow: (row) => ({
      ...row,
      _type_display: row.machinery_type === 'Other' && row.machinery_type_other
        ? `Other — ${row.machinery_type_other}`
        : row.machinery_type,
    }),
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls =
  'mt-1 w-full rounded-md border border-green-100 px-3 py-2 text-sm outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-green-100'
const labelCls = 'block text-sm font-medium text-slate-700'

function buildEmpty(fields) {
  const form = {}
  fields.forEach((f) => {
    form[f.name] = f.type === 'select' ? f.options[0] : ''
  })
  return form
}

function buildFromRecord(fields, record) {
  const form = {}
  fields.forEach((f) => {
    const v = record[f.name]
    form[f.name] = v !== undefined && v !== null ? String(v) : (f.type === 'select' ? f.options[0] : '')
  })
  return form
}

// ─── Single form field renderer ───────────────────────────────────────────────

function FormField({ field, value, onChange, form }) {
  if (field.showWhen && form[field.showWhen.field] !== field.showWhen.value) return null

  const id = `infra_${field.name}`

  return (
    <div>
      <label className={labelCls} htmlFor={id}>
        {field.label}
        {!field.required && <span className="ml-1 font-normal text-slate-400">(optional)</span>}
      </label>

      {field.type === 'select' && (
        <select id={id} className={inputCls} value={value} onChange={(e) => onChange(field.name, e.target.value)}>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}

      {(field.type === 'text') && (
        <input
          id={id}
          className={inputCls}
          type="text"
          required={field.required}
          placeholder={field.placeholder || ''}
          value={value}
          onChange={(e) => onChange(field.name, e.target.value)}
        />
      )}

      {(field.type === 'decimal') && (
        <input
          id={id}
          className={inputCls}
          type="number"
          step="0.01"
          min="0"
          required={field.required}
          value={value}
          onChange={(e) => onChange(field.name, e.target.value)}
        />
      )}

      {(field.type === 'number') && (
        <input
          id={id}
          className={inputCls}
          type="number"
          min="0"
          required={field.required}
          value={value}
          onChange={(e) => onChange(field.name, e.target.value)}
        />
      )}

      {field.type === 'textarea' && (
        <textarea
          id={id}
          className={`${inputCls} resize-none`}
          rows={2}
          value={value}
          onChange={(e) => onChange(field.name, e.target.value)}
        />
      )}
    </div>
  )
}

// ─── Add / Edit modal ─────────────────────────────────────────────────────────

function RecordModal({ config, mode, record, onClose, onSuccess }) {
  const { showToast } = useToast()
  const isEdit = mode === 'edit'

  const [form, setForm] = useState(() =>
    isEdit ? buildFromRecord(config.fields, record) : buildEmpty(config.fields)
  )
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const updateField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      // Build payload — omit conditional "other" fields when not applicable
      const payload = { ...form }
      config.fields.forEach((f) => {
        if (f.showWhen && form[f.showWhen.field] !== f.showWhen.value) {
          delete payload[f.name]
        }
      })

      if (isEdit) {
        await api.patch(`${config.endpoint}${record.id}/`, payload)
        showToast(`${config.recordLabel} updated successfully.`, 'success')
      } else {
        await api.post(config.endpoint, payload)
        showToast(`${config.recordLabel} added successfully.`, 'success')
      }

      onSuccess()
      onClose()
    } catch (err) {
      const data = err.response?.data
      const first = data && Object.values(data)[0]
      setError(
        typeof first === 'string' ? first
        : Array.isArray(first) ? first[0]
        : 'Unable to save record. Please check the form.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  // Split fields into two columns; textarea + conditional fields stay full-width
  const fullWidthTypes = new Set(['textarea'])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="border-b border-green-100 px-6 py-4">
          <h2 className="text-xl font-bold text-slate-950">
            {isEdit ? `Edit ${config.recordLabel}` : `Add ${config.recordLabel}`}
          </h2>
        </div>

        <form className="space-y-4 p-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            {config.fields.map((field) => {
              const isFullWidth = fullWidthTypes.has(field.type) || Boolean(field.showWhen)
              return (
                <div key={field.name} className={isFullWidth ? 'md:col-span-2' : ''}>
                  <FormField
                    field={field}
                    value={form[field.name]}
                    onChange={updateField}
                    form={form}
                  />
                </div>
              )
            })}
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 border-t border-green-100 pt-5">
            <button
              className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-[#16a34a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#15803d] disabled:cursor-not-allowed disabled:bg-green-300"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Data table with action buttons ──────────────────────────────────────────

function InfraTable({ columns, data, isAdmin, onEdit, onDelete }) {
  return (
    <div className="overflow-hidden rounded-lg border border-green-100 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-green-100 text-left text-sm">
          <thead className="bg-green-50 text-xs font-semibold uppercase tracking-wide text-green-800">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-4 py-3">{c.label}</th>
              ))}
              {isAdmin && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-green-50">
            {data.map((row, i) => (
              <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#f0fdf4]'}>
                {columns.map((c) => (
                  <td key={c.key} className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {row[c.key] ?? '—'}
                  </td>
                ))}
                {isAdmin && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                        onClick={() => onEdit(row)}
                        type="button"
                      >
                        <Pencil size={12} />
                        Edit
                      </button>
                      <button
                        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
                        onClick={() => onDelete(row.id)}
                        type="button"
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

function InfrastructurePage() {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()

  const [activeKey, setActiveKey] = useState('irrigation')
  const [barangayFilter, setBarangayFilter] = useState('')
  const [data, setData] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [modal, setModal] = useState(null) // null | { mode: 'add'|'edit', record: null|object }

  const config = TAB_CONFIGS.find((t) => t.key === activeKey)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      setError('')
      try {
        const params = new URLSearchParams()
        if (barangayFilter) params.append('barangay', barangayFilter)
        const response = await api.get(`${config.endpoint}?${params.toString()}`)
        if (!cancelled) setData(response.data)
      } catch {
        if (!cancelled) setError(`Unable to load ${config.label.toLowerCase()}.`)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [activeKey, barangayFilter, refreshKey, config.endpoint, config.label])

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this record? This cannot be undone.')) return
    try {
      await api.delete(`${config.endpoint}${id}/`)
      showToast('Record deleted.', 'success')
      setRefreshKey((k) => k + 1)
    } catch {
      showToast('Unable to delete record.', 'error')
    }
  }

  const handleModalSuccess = () => setRefreshKey((k) => k + 1)

  const tableData = config.processRow ? data.map(config.processRow) : data

  return (
    <PageLayout title="Agricultural Infrastructure">
      <div className="space-y-5">
        {/* Tabs + Add button */}
        <div className="flex items-end justify-between border-b border-green-200">
          <div className="flex gap-1">
            {TAB_CONFIGS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setActiveKey(tab.key); setData([]) }}
                className={`px-4 py-2.5 text-sm font-medium transition ${
                  activeKey === tab.key
                    ? 'border-b-2 border-[#16a34a] text-[#16a34a]'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {isAdmin && (
            <div className="pb-1">
              <button
                className="rounded-md bg-[#16a34a] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#15803d]"
                onClick={() => setModal({ mode: 'add', record: null })}
              >
                Add Record
              </button>
            </div>
          )}
        </div>

        {/* Barangay filter */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-700">Filter by Barangay:</label>
          <select
            className="rounded-md border border-green-100 px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-[#16a34a] focus:ring-2 focus:ring-green-100"
            value={barangayFilter}
            onChange={(e) => setBarangayFilter(e.target.value)}
          >
            <option value="">All Barangays</option>
            {BARANGAYS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          {barangayFilter && (
            <button
              className="text-xs font-medium text-slate-500 hover:text-slate-700 hover:underline"
              onClick={() => setBarangayFilter('')}
              type="button"
            >
              Clear
            </button>
          )}
        </div>

        {/* Content */}
        {isLoading && <LoadingSpinner message={`Loading ${config.label.toLowerCase()}...`} />}

        {!isLoading && error && (
          <ErrorMessage message={error} onRetry={() => setRefreshKey((k) => k + 1)} />
        )}

        {!isLoading && !error && tableData.length === 0 && (
          <EmptyState message={config.emptyMsg} />
        )}

        {!isLoading && !error && tableData.length > 0 && (
          <InfraTable
            columns={config.columns}
            data={tableData}
            isAdmin={isAdmin}
            onEdit={(row) => setModal({ mode: 'edit', record: row })}
            onDelete={handleDelete}
          />
        )}
      </div>

      {modal && (
        <RecordModal
          config={config}
          mode={modal.mode}
          record={modal.record}
          onClose={() => setModal(null)}
          onSuccess={handleModalSuccess}
        />
      )}
    </PageLayout>
  )
}

export default InfrastructurePage
