import { useCallback, useEffect, useState } from 'react'
import { Download, HardDriveDownload, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import CardHeader from '../../components/UI/CardHeader.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { downloadFile } from '../../utils/fileDownload.js'
import { backupSummary, formatBytes, isRunning } from './backupFormat.js'

// Admin > Backup: one file with the whole database and every uploaded file. Back up now starts one in the background (the list shows it Running
// and refreshes by itself); each finished backup can be downloaded or deleted. The newest 14 are kept. See docs/BACKUP_AND_RESTORE.md to restore.
const TONES = { done: 'green', running: 'amber', failed: 'red' }
const fmtWhen = (v) => (v ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(v)) : '—')

export default function BackupPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState(null)          // null while loading
  const [error, setError] = useState('')
  const [isStarting, setIsStarting] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const load = useCallback(async () => {
    try {
      const r = await api.get('/backups/')
      setRows(r.data.results || [])
      setError('')
    } catch {
      setError('Failed to load the backups.')
      setRows((prev) => prev || [])
    }
  }, [])

  useEffect(() => {
    let alive = true
    api.get('/backups/')
      .then((r) => { if (alive) { setRows(r.data.results || []); setError('') } })
      .catch(() => { if (alive) { setError('Failed to load the backups.'); setRows((prev) => prev || []) } })
    return () => { alive = false }
  }, [])
  // While a backup is running the list asks again every few seconds.
  const running = rows ? isRunning(rows) : false
  useEffect(() => {
    if (!running) return undefined
    const timer = setInterval(load, 4000)
    return () => clearInterval(timer)
  }, [running, load])

  const start = async () => {
    setIsStarting(true)
    try {
      await api.post('/backups/')
      showToast('The backup has started. It can take a few minutes.', 'success')
      await load()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to start the backup.', 'error')
    } finally {
      setIsStarting(false)
    }
  }

  const download = async (row) => {
    setBusyId(row.id)
    try {
      await downloadFile(api, `/backups/${row.id}/download/`, `oma_backup_${row.id}.zip`)
    } catch {
      showToast('The backup file could not be downloaded.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async () => {
    const row = deleting
    setDeleting(null)
    try {
      await api.delete(`/backups/${row.id}/`)
      showToast('Backup deleted.', 'success')
      load()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to delete the backup.', 'error')
    }
  }

  return (
    <PageLayout title="Backup" subtitle="A copy of the whole system: every record and every uploaded file, in one download">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#E2E8E2] bg-white p-4">
          <div className="min-w-0 flex-1 basis-72">
            <p className="text-[13px] font-semibold text-[#1A2B1A]">Back up now</p>
            <p className="text-[12.5px] text-[#7A8E7A]">
              Makes one file (.zip) with the database and the uploaded photos and files. It holds personal records and login password hashes, so keep the
              download somewhere safe. The latest 14 backups are kept here.
            </p>
          </div>
          <Button type="button" icon={HardDriveDownload} isLoading={isStarting} disabled={isStarting || running} onClick={start}>
            {running ? 'Backup running…' : 'Back up now'}
          </Button>
        </div>

        {error && <ErrorMessage message={error} />}

        <div className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <CardHeader title="Backups" count={rows ? rows.length : 0} />
          {rows === null && <p className="px-5 py-8 text-center text-sm text-slate-500">Loading…</p>}
          {rows && rows.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-500">No backup yet. Press Back up now to make the first one.</p>}
          <ul className="divide-y divide-[#F0F4F0]">
            {(rows || []).map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-[13.5px] font-medium text-[#1A2B1A]">{fmtWhen(row.created_at)}</p>
                  <p className="break-words text-[12.5px] text-[#7A8E7A]">{backupSummary(row)}</p>
                </div>
                <span className="text-[12.5px] text-[#4A5E4A]">{row.kind_label} · {row.created_by_name}</span>
                <span className="w-20 text-[12.5px] tabular-nums text-[#4A5E4A]">{row.status === 'done' ? formatBytes(row.size_bytes) : '—'}</span>
                <StatusPill tone={TONES[row.status] || 'slate'}>{row.status_label}</StatusPill>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" icon={Download} disabled={!row.can_download || busyId === row.id} isLoading={busyId === row.id}
                    onClick={() => download(row)}>Download</Button>
                  <Button type="button" size="sm" variant="outline" icon={Trash2} disabled={row.status === 'running'} onClick={() => setDeleting(row)}>Delete</Button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[12px] text-[#7A8E7A]">
          To restore from a backup, follow docs/BACKUP_AND_RESTORE.md. To make backups automatically, schedule <code>python manage.py backup_system</code> once a day
          (for example a Render cron job); they appear in this list as Scheduled.
        </p>
      </div>

      {deleting && (
        <ConfirmDialog title="Delete Backup" message={`Delete the backup of ${fmtWhen(deleting.created_at)}? Its file is removed and cannot be recovered.`}
          confirmLabel="Delete" variant="danger" onConfirm={remove} onCancel={() => setDeleting(null)} />
      )}
    </PageLayout>
  )
}
