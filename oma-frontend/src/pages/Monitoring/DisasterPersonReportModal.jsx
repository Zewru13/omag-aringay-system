import { useEffect, useState } from 'react'
import { Download, FileText, Printer } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import useDisasterReportActions from '../../hooks/useDisasterReportActions.js'
import { disasterReportUrl } from '../../utils/disasterReport.js'
import { DocumentView } from '../Reports/DocumentReport.jsx'

// The ⋮ menu of a farmer / fisherfolk on the Disaster tables > View Report: every disaster of that one person (within the table's filters), as the
// document of Reports > Disaster (summary figures and one line per disaster), with Print and Download of the same PDF. Read-only.
//   kind: 'crops' | 'fisheries'   person: { kind: 'farmer' | 'fisherfolk', id, name }   filters: the table's filter state
export default function DisasterPersonReportModal({ kind, person, filters, onClose }) {
  const [state, setState] = useState({ doc: null, failed: false })
  const { busy, print, download } = useDisasterReportActions(kind, filters, person)
  const url = disasterReportUrl(kind, filters, person, 'json')

  useEffect(() => {
    let alive = true
    api.get(url)
      .then((r) => alive && setState({ doc: r.data, failed: false }))
      .catch(() => alive && setState({ doc: null, failed: true }))
    return () => { alive = false }
  }, [url])

  const { doc, failed } = state
  return (
    <ModalShell
      title={kind === 'crops' ? 'Farmer Disaster Report' : 'Fisherfolk Disaster Report'}
      subtitle={person.name}
      icon={FileText}
      onClose={onClose}
      maxWidth="max-w-5xl"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          <Button type="button" variant="outline" isLoading={busy === 'print'} disabled={!doc || Boolean(busy)} onClick={print}>
            <Printer size={15} className="mr-1" /> Print Report
          </Button>
          <Button type="button" isLoading={busy === 'download'} disabled={!doc || Boolean(busy)} onClick={download}>
            <Download size={15} className="mr-1" /> Download Report
          </Button>
        </>
      )}
    >
      {failed
        ? <p className="text-sm text-rose-600" role="alert">The report could not be loaded. Please try again.</p>
        : <DocumentView doc={doc} isLoading={!doc} emptyText="No disasters match these filters." />}
    </ModalShell>
  )
}
