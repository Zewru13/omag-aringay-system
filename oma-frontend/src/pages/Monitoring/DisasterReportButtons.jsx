import { Download, Printer } from 'lucide-react'
import useDisasterReportActions from '../../hooks/useDisasterReportActions.js'

// Print Report and Download Report above a Disaster table (Crop Disaster / Fisheries Disaster): the report of the rows the table's filters
// match, as the PDF of Reports > Disaster. `kind` is 'crops' | 'fisheries'; `filters` is the page's filter state (utils/disasterReport.js).
const BUTTON = 'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#D8E2D8] bg-white px-4 py-2 text-[13px] font-medium text-[#1B4D2E] transition-colors hover:bg-[#F5F7F5] disabled:cursor-wait disabled:opacity-60'

export default function DisasterReportButtons({ kind, filters }) {
  const { busy, print, download } = useDisasterReportActions(kind, filters)
  return (
    <>
      <button type="button" className={BUTTON} onClick={print} disabled={Boolean(busy)}>
        <Printer size={16} aria-hidden="true" /> {busy === 'print' ? 'Preparing…' : 'Print Report'}
      </button>
      <button type="button" className={BUTTON} onClick={download} disabled={Boolean(busy)}>
        <Download size={16} aria-hidden="true" /> {busy === 'download' ? 'Preparing…' : 'Download Report'}
      </button>
    </>
  )
}
