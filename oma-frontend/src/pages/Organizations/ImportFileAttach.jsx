import { useRef, useState } from 'react'
import { Download, FileSpreadsheet, Upload, X } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import { downloadFile } from '../../utils/fileDownload.js'

// A file attached on the organization registration form to be imported once the organization is saved (equipment): choose it, download the
// template, or remove it. Nothing is sent from here; after saving, the Import window of the new organization opens with the file (preview first).
const BUTTON = 'inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold'

export default function ImportFileAttach({ chooseLabel, templateUrl, templateFilename, file, onFile }) {
  const { showToast } = useToast()
  const inputRef = useRef(null)
  const [isDownloading, setIsDownloading] = useState(false)

  const download = async () => {
    setIsDownloading(true)
    try {
      await downloadFile(api, templateUrl, templateFilename)
    } catch {
      showToast('Failed to download the template.', 'error')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
        onChange={(e) => { const chosen = e.target.files?.[0] || null; e.target.value = ''; if (chosen) onFile(chosen) }} />
      <button type="button" onClick={() => inputRef.current?.click()}
        className={`${BUTTON} border border-[#1B4D2E]/30 bg-[#EBF5EE]/50 text-[#1B4D2E] hover:bg-[#EBF5EE]`}>
        <Upload size={13} aria-hidden="true" /> {file ? 'Change file' : chooseLabel}
      </button>
      <button type="button" onClick={download} disabled={isDownloading}
        className={`${BUTTON} border border-[#D8E2D8] bg-white font-medium text-[#1B4D2E] hover:bg-[#F5F7F5] disabled:opacity-60`}>
        <Download size={13} aria-hidden="true" /> {isDownloading ? 'Downloading…' : 'Download template'}
      </button>
      {file && (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] text-[#1A2B1A] ring-1 ring-[#E2E8E2]">
          <FileSpreadsheet size={13} className="text-[#1B4D2E]" aria-hidden="true" /> {file.name}
          <button type="button" aria-label="Remove the file" title="Remove the file" onClick={() => onFile(null)} className="text-rose-500 hover:text-rose-700"><X size={13} /></button>
        </span>
      )}
    </div>
  )
}
