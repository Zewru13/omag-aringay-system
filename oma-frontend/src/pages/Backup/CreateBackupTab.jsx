import { Download, TriangleAlert } from 'lucide-react'
import Button from '../../components/UI/Button.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import BackupGroups from './BackupGroups.jsx'
import BackupHistory from './BackupHistory.jsx'

// Backup & Restore > Create backup: what the file will hold, what it cannot hold, and the history of every backup. `history` is
// passed to BackupHistory as it is.
export default function CreateBackupTab({ groups, includeAudit, onIncludeAudit, locked, busy, error, onNew, history }) {
  return (
    <div className="space-y-4">
      <section aria-label="Create backup" className="space-y-4 rounded-xl border border-[#E2E8E2] bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 basis-64 text-[13px] text-[#4A5E4A]">
            Saves one file (.zip) holding every record below and every uploaded file. You choose where it goes. Keep it somewhere off this computer.
          </p>
          <Button type="button" icon={Download} disabled={locked || history.rows === null} onClick={onNew}>
            {busy ? 'Please wait…' : 'Download backup'}
          </Button>
        </div>
        <BackupGroups groups={groups} includeAudit={includeAudit} onIncludeAudit={onIncludeAudit} disabled={locked} />
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-900">
            <TriangleAlert size={15} aria-hidden="true" className="flex-none" /> Two things this file cannot hold
          </p>
          <ul className="mt-1.5 grid gap-2 sm:grid-cols-2">
            <li className="text-[12px] leading-snug text-amber-900">
              <span className="block font-semibold">The system itself</span>
              The program and the design of the database are in the project&rsquo;s code; this file holds records and uploaded files.
            </li>
            <li className="text-[12px] leading-snug text-amber-900">
              <span className="block font-semibold">Server settings and keys</span>
              Such as the e-mail and file storage keys, which are kept on the server.
            </li>
          </ul>
        </div>
      </section>

      {error && <ErrorMessage message={error} />}

      <BackupHistory {...history} />
    </div>
  )
}
