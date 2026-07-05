import { useState } from 'react'
import { Download, FileText } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { downloadFile } from '../../utils/fileDownload.js'

const labelCls = 'block text-xs font-medium text-slate-600 mb-1'

// ── Signature Modal ────────────────────────────────────────────────────────────

function SignatureModal({ onClose, onGenerate }) {
  const { user } = useAuth()
  const [showReviewer, setShowReviewer] = useState(false)
  const [showNotedBy, setShowNotedBy]   = useState(false)
  const [form, setForm] = useState({
    prepared_by:   user?.full_name || '',
    prepared_role: '',
    reviewed_by:   '',
    reviewed_role: '',
    noted_by:      '',
    noted_role:    '',
  })
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <ModalShell title="Report Signatories" onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-5">
        <p className="text-xs text-slate-500">Provide signatory details for the PDF report header.</p>

        {/* Prepared By — auto-filled, name is read-only */}
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Prepared By</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Name</label>
              <input
                className={`${baseInputClasses} bg-slate-50 text-slate-500`}
                value={form.prepared_by}
                readOnly
                tabIndex={-1}
              />
            </div>
            <div>
              <label className={labelCls}>Position / Role</label>
              <input
                className={baseInputClasses}
                value={form.prepared_role}
                onChange={(e) => set('prepared_role', e.target.value)}
                placeholder="e.g. OMAg Records Officer"
              />
            </div>
          </div>
        </div>

        {/* Optional Reviewed By */}
        <div>
          <button
            type="button"
            onClick={() => setShowReviewer(!showReviewer)}
            className="text-xs font-semibold text-[#1E4620] hover:underline"
          >
            {showReviewer ? '− Remove Reviewer' : '+ Add Reviewer'}
          </button>
          {showReviewer && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Reviewed By</label>
                <input
                  className={baseInputClasses}
                  value={form.reviewed_by}
                  onChange={(e) => set('reviewed_by', e.target.value)}
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className={labelCls}>Position / Role</label>
                <input
                  className={baseInputClasses}
                  value={form.reviewed_role}
                  onChange={(e) => set('reviewed_role', e.target.value)}
                  placeholder="e.g. Agricultural Technician"
                />
              </div>
            </div>
          )}
        </div>

        {/* Optional Noted By */}
        <div>
          <button
            type="button"
            onClick={() => setShowNotedBy(!showNotedBy)}
            className="text-xs font-semibold text-[#1E4620] hover:underline"
          >
            {showNotedBy ? '− Remove Noted By' : '+ Add Noted By'}
          </button>
          {showNotedBy && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Noted By</label>
                <input
                  className={baseInputClasses}
                  value={form.noted_by}
                  onChange={(e) => set('noted_by', e.target.value)}
                  placeholder="Full name"
                />
              </div>
              <div>
                <label className={labelCls}>Position / Role</label>
                <input
                  className={baseInputClasses}
                  value={form.noted_role}
                  onChange={(e) => set('noted_role', e.target.value)}
                  placeholder="e.g. Municipal Agriculturist"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={() => onGenerate(form)}>
            <FileText size={14} className="mr-1" /> Generate PDF
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Harvested Crop Tab ─────────────────────────────────────────────────────────

function HarvestedCropTab() {
  const { showToast } = useToast()
  const [filters, setFilters] = useState({ start_date: '', end_date: '', barangay: '', crop_name: '' })
  const [isDownloading, setIsDownloading] = useState(false)
  const [showSig, setShowSig] = useState(false)

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }))

  const buildUrl = (fmt) => {
    const p = new URLSearchParams({ format: fmt })
    if (filters.start_date) p.set('start_date', filters.start_date)
    if (filters.end_date)   p.set('end_date',   filters.end_date)
    if (filters.barangay)   p.set('barangay',   filters.barangay)
    if (filters.crop_name)  p.set('crop_name',  filters.crop_name)
    return `/reports/production/harvested-crop/?${p}`
  }

  const handleExcel = async () => {
    setIsDownloading(true)
    try {
      await downloadFile(api, buildUrl('excel'), 'harvested_crop_report.xlsx')
    } catch { showToast('Failed to download report.', 'error') }
    finally { setIsDownloading(false) }
  }

  const handlePdf = async (sigForm) => {
    setShowSig(false)
    setIsDownloading(true)
    try {
      const url = buildUrl('pdf')
        + `&prepared_by=${encodeURIComponent(sigForm.prepared_by)}`
        + `&prepared_role=${encodeURIComponent(sigForm.prepared_role)}`
        + (sigForm.noted_by ? `&noted_by=${encodeURIComponent(sigForm.noted_by)}&noted_role=${encodeURIComponent(sigForm.noted_role)}` : '')
      await downloadFile(api, url, 'harvested_crop_report.pdf')
    } catch { showToast('Failed to generate PDF.', 'error') }
    finally { setIsDownloading(false) }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-4 text-sm font-semibold text-slate-700">Filters</p>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className={labelCls}>Date From</label>
            <input type="date" className={baseInputClasses} value={filters.start_date} onChange={(e) => set('start_date', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Date To</label>
            <input type="date" className={baseInputClasses} value={filters.end_date} onChange={(e) => set('end_date', e.target.value)} />
          </div>
          <div className="w-48">
            <label className={labelCls}>Barangay</label>
            <BarangaySelect value={filters.barangay} onChange={(e) => set('barangay', e.target.value)} includeAllOption />
          </div>
          <div>
            <label className={labelCls}>Crop Type</label>
            <input className={baseInputClasses} placeholder="e.g. Palay" value={filters.crop_name} onChange={(e) => set('crop_name', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={handleExcel} isLoading={isDownloading} variant="outline">
          <Download size={14} className="mr-1.5" /> Download Excel
        </Button>
        <Button onClick={() => setShowSig(true)} className="bg-rose-600 hover:bg-rose-700">
          <FileText size={14} className="mr-1.5" /> Preview PDF
        </Button>
      </div>

      {showSig && <SignatureModal onClose={() => setShowSig(false)} onGenerate={handlePdf} />}
    </div>
  )
}

// ── Association List Tab ───────────────────────────────────────────────────────

function AssociationListTab() {
  const { showToast } = useToast()
  const [filters, setFilters] = useState({ barangay: '', type: 'all' })
  const [isDownloading, setIsDownloading] = useState(false)
  const [showSig, setShowSig] = useState(false)

  const set = (k, v) => setFilters((f) => ({ ...f, [k]: v }))

  const buildUrl = (fmt) => {
    const p = new URLSearchParams({ format: fmt, type: filters.type })
    if (filters.barangay) p.set('barangay', filters.barangay)
    return `/reports/associations/list/?${p}`
  }

  const handleExcel = async () => {
    setIsDownloading(true)
    try {
      await downloadFile(api, buildUrl('excel'), 'association_list.xlsx')
    } catch { showToast('Failed to download report.', 'error') }
    finally { setIsDownloading(false) }
  }

  const handlePdf = async (sigForm) => {
    setShowSig(false)
    setIsDownloading(true)
    try {
      let url = buildUrl('pdf')
      if (sigForm.prepared_by) url += `&prepared_by=${encodeURIComponent(sigForm.prepared_by)}&prepared_role=${encodeURIComponent(sigForm.prepared_role)}`
      if (sigForm.noted_by)    url += `&noted_by=${encodeURIComponent(sigForm.noted_by)}&noted_role=${encodeURIComponent(sigForm.noted_role)}`
      await downloadFile(api, url, 'association_list.pdf')
    } catch { showToast('Failed to generate PDF.', 'error') }
    finally { setIsDownloading(false) }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-4 text-sm font-semibold text-slate-700">Filters</p>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className={labelCls}>Association Type</label>
            <select className={baseInputClasses} value={filters.type} onChange={(e) => set('type', e.target.value)}>
              <option value="all">All Associations</option>
              <option value="farmers">Farmers Only</option>
              <option value="fisherfolk">Fisherfolk Only</option>
            </select>
          </div>
          <div className="w-48">
            <label className={labelCls}>Barangay</label>
            <BarangaySelect value={filters.barangay} onChange={(e) => set('barangay', e.target.value)} includeAllOption />
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={handleExcel} isLoading={isDownloading} variant="outline">
          <Download size={14} className="mr-1.5" /> Download Excel
        </Button>
        <Button onClick={() => setShowSig(true)} className="bg-rose-600 hover:bg-rose-700">
          <FileText size={14} className="mr-1.5" /> Preview PDF
        </Button>
      </div>

      {showSig && <SignatureModal onClose={() => setShowSig(false)} onGenerate={handlePdf} />}
    </div>
  )
}

// ── Crop Options Tab ───────────────────────────────────────────────────────────

function CropOptionsTab() {
  const { showToast } = useToast()
  const [isDownloading, setIsDownloading] = useState(false)
  const [showSig, setShowSig] = useState(false)

  const buildUrl = (fmt) => `/reports/production/crop-options/?format=${fmt}`

  const handleExcel = async () => {
    setIsDownloading(true)
    try {
      await downloadFile(api, buildUrl('excel'), 'crop_options_report.xlsx')
    } catch { showToast('Failed to download report.', 'error') }
    finally { setIsDownloading(false) }
  }

  const handlePdf = async (sigForm) => {
    setShowSig(false)
    setIsDownloading(true)
    try {
      let url = buildUrl('pdf')
      if (sigForm.prepared_by) url += `&prepared_by=${encodeURIComponent(sigForm.prepared_by)}&prepared_role=${encodeURIComponent(sigForm.prepared_role)}`
      if (sigForm.noted_by)    url += `&noted_by=${encodeURIComponent(sigForm.noted_by)}&noted_role=${encodeURIComponent(sigForm.noted_role)}`
      await downloadFile(api, url, 'crop_options_report.pdf')
    } catch { showToast('Failed to generate PDF.', 'error') }
    finally { setIsDownloading(false) }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">
          This report lists all registered crop types with their category, subcategory, growth duration, and estimated yield per hectare.
        </p>
      </div>

      <div className="flex gap-3">
        <Button onClick={handleExcel} isLoading={isDownloading} variant="outline">
          <Download size={14} className="mr-1.5" /> Download Excel
        </Button>
        <Button onClick={() => setShowSig(true)} className="bg-rose-600 hover:bg-rose-700">
          <FileText size={14} className="mr-1.5" /> Preview PDF
        </Button>
      </div>

      {showSig && <SignatureModal onClose={() => setShowSig(false)} onGenerate={handlePdf} />}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
  { value: 'harvested',    label: 'Harvested Crop Report' },
  { value: 'associations', label: 'Association List Report' },
  { value: 'crop_options', label: 'Crop Options Report' },
]

function ReportsPage() {
  const [tab, setTab] = useState('harvested')

  return (
    <PageLayout title="Reports" subtitle="Generate and download official reports">
      <div className="space-y-5">
        {/* Tab bar */}
        <div className="flex w-fit overflow-hidden rounded-xl border border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`cursor-pointer border-none px-5 py-2.5 text-sm font-semibold transition-colors ${
                tab === t.value
                  ? 'bg-[#1E4620] text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'harvested'    && <HarvestedCropTab />}
        {tab === 'associations' && <AssociationListTab />}
        {tab === 'crop_options' && <CropOptionsTab />}
      </div>
    </PageLayout>
  )
}

export default ReportsPage
