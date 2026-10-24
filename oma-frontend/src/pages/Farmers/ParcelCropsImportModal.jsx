import { useState } from 'react'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { downloadFile } from '../../utils/fileDownload.js'

// "Import crops" / "Import machinery" inside the Add Farm Parcels page: upload the spreadsheet, and the rows in it are added to the list
// of the parcel being filled in. Nothing is saved here (the parcel is saved on submit), so a wrong file costs nothing: remove the rows
// from the list, or cancel. The crops import is the default; `kind` switches the words, the template and the check to another list.
const KINDS = {
  crops: {
    title: 'Import Crops', subtitle: 'Add the crops grown on this parcel from a spreadsheet.', addLabel: 'Add Crops',
    hint: 'One row per crop. The crops are added to this parcel\'s list so you can check them before the parcel is saved.',
    templateUrl: '/farmers/parcel-crops/template/', templateFilename: 'farm_parcel_crops_import_template.xlsx', parseUrl: '/farmers/parcel-crops/parse/', resultKey: 'crops',
  },
  machinery: {
    title: 'Import Machinery', subtitle: 'Add the machinery used on this parcel from a spreadsheet.', addLabel: 'Add Machinery',
    hint: 'One row per kind of machinery. The machinery is added to this parcel\'s list so you can check it before the parcel is saved.',
    templateUrl: '/farmers/parcel-machinery/template/', templateFilename: 'farm_parcel_machinery_import_template.xlsx', parseUrl: '/farmers/parcel-machinery/parse/', resultKey: 'machinery',
  },
}

export default function ParcelCropsImportModal({ onClose, onRows, kind = 'crops' }) {
  const config = KINDS[kind]
  const { showToast } = useToast()
  const [file, setFile] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState('')
  const [rowErrors, setRowErrors] = useState([])

  const downloadTemplate = async () => {
    setIsDownloading(true)
    try {
      await downloadFile(api, config.templateUrl, config.templateFilename)
    } catch {
      showToast('Failed to download the template.', 'error')
    } finally {
      setIsDownloading(false)
    }
  }

  const readFile = async () => {
    if (!file) return
    setIsBusy(true)
    setError('')
    setRowErrors([])
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post(config.parseUrl, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      onRows(data[config.resultKey])
    } catch (err) {
      const data = err?.response?.data
      setRowErrors(Array.isArray(data?.errors) ? data.errors : [])
      setError(Array.isArray(data?.errors) ? 'Nothing was added. Fix these rows in the file and choose it again.' : (data?.error || data?.detail || 'Failed to read the file.'))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <ModalShell
      title={config.title}
      subtitle={config.subtitle}
      icon={FileSpreadsheet}
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" isLoading={isBusy} disabled={!file} onClick={readFile}>{config.addLabel}</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <p className="text-[13px] text-[#4A5A4C]">{config.hint}</p>
        <button
          type="button"
          onClick={downloadTemplate}
          disabled={isDownloading}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg text-[12.5px] font-medium text-[#1B4D2E] hover:underline disabled:opacity-50"
        >
          <Download size={14} aria-hidden="true" />
          {isDownloading ? 'Downloading…' : 'Download the Excel template'}
        </button>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#D8E2D8] bg-[#F9FAF9] px-4 py-8 text-center transition-colors hover:bg-[#F0F4F0]">
          <Upload size={22} className="text-[#7A8E7A]" aria-hidden="true" />
          <span className="break-all text-[13px] font-medium text-[#1A2B1A]">{file ? file.name : 'Click to choose a .xlsx, .xls, or .csv file'}</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] || null); setError(''); setRowErrors([]) }} />
        </label>
        {error && (
          <div role="alert" className="rounded-lg border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-[13px] font-medium text-[#991B1B]">
            <p>{error}</p>
            {rowErrors.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 font-normal">
                {rowErrors.map((e) => <li key={e.row}>Row {e.row}: {e.error}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
