import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HardDriveDownload, History } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import PillTabs from '../../components/UI/PillTabs.jsx'
import WorkLockScreen from '../../components/UI/WorkLockScreen.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useLeaveGuard from '../../hooks/useLeaveGuard.js'
import { downloadFile } from '../../utils/fileDownload.js'
import CreateBackupTab from './CreateBackupTab.jsx'
import RestoreTab from './RestoreTab.jsx'
import { nextAutoDownload, runningMessage, savedMessage, suggestedFileName } from './backupFormat.js'
import { askWhereToSave, writeToHandle } from './saveToComputer.js'

// Admin > Backup & Restore, two tabs. CREATE BACKUP: a backup is one file (.zip) with the whole database (and, if the Admin ticks it, the Audit Log and
// notifications) and every uploaded file. It is made only when the Admin presses Download backup, which opens the browser's Save As window at once (where a
// browser has none, the file downloads the usual way); once the file is written the online copy is removed. The history keeps every backup ever made
// (nothing is deleted) with its name, date, time and saved file. RESTORE: the Admin adds a backup's file, sees what it would change and confirms with
// their password; a safety backup of how things are now is made first. A backup made elsewhere is restored the same way.
// While a backup is being made, its file is being saved, or a restore is running, the whole screen is held (WorkLockScreen) and the browser is told not to
// close, reload or go back (useLeaveGuard): the Admin cannot go to another page or do anything else in the system until it is finished.
const TABS = [
  { id: 'create', label: 'Create backup', icon: HardDriveDownload },
  { id: 'restore', label: 'Restore', icon: History },
]

export default function BackupPage() {
  const { showToast } = useToast()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'restore' ? 'restore' : 'create'
  const setTab = useCallback((id) => setParams(id === 'restore' ? { tab: 'restore' } : {}, { replace: true }), [setParams])
  const [result, setResult] = useState(null)      // the entry of the restore this page has just seen end
  const [summaryVersion, setSummaryVersion] = useState(0)   // a restore changes the counts on the cards
  const [groups, setGroups] = useState(null)      // what a backup holds, from the server (null while loading)
  const [includeAudit, setIncludeAudit] = useState(false)   // the Audit Log and notifications go in the backup only when the Admin ticks it
  const [rows, setRows] = useState(null)          // null while loading
  const [busy, setBusy] = useState(false)         // a backup or a restore is running (the server says so)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState(null)  // the backup whose file is being saved to the computer
  const [starting, setStarting] = useState(false)   // Save As is open, or the backup is being asked for
  // What this page started and still has to finish: files to save by itself (and where the Admin chose to put each), and the
  // entry whose end it announces.
  const wanted = useRef({ ids: [], safety: false, watch: null, places: {} })

  const load = useCallback(async () => {
    try {
      const r = await api.get('/backups/')
      const list = r.data.results || []
      setRows(list)
      setBusy(Boolean(r.data.busy))
      setError('')
      return { list, busy: Boolean(r.data.busy) }
    } catch {
      setError('Failed to load the backups.')
      setRows((prev) => prev || [])
      return null
    }
  }, [])

  // `place` is the Save As window's answer; without one (the safety backup: there is no click to open a window from) the file
  // downloads the usual way. The online copy is removed only once the whole file is where it should be.
  const download = useCallback(async (row, place) => {
    wanted.current.ids = wanted.current.ids.filter((id) => id !== row.id)
    if (row.kind === 'safety') wanted.current.safety = false
    setSavingId(row.id)
    try {
      if (place?.kind === 'picked') {
        const file = await api.get(`/backups/${row.id}/download/`, { responseType: 'blob' })
        try {
          await writeToHandle(place.handle, file.data)
        } catch {
          showToast('The backup could not be saved to the file you chose. It is still online: press Download to try again.', 'error')
          return
        }
        await api.post(`/backups/${row.id}/downloaded/`, { file_name: place.handle.name })
      } else {
        await downloadFile(api, `/backups/${row.id}/download/`, row.file_name || `omag-backup-${row.id}.zip`)
        await api.post(`/backups/${row.id}/downloaded/`)
      }
      showToast(row.kind === 'safety'
        ? `The safety backup was saved to your computer${row.file_name ? ` as ${row.file_name}` : ''}. Keep it somewhere safe.`
        : savedMessage(row), 'success')
    } catch {
      showToast('The backup file could not be downloaded. It is still online: press Download to try again.', 'error')
    } finally {
      setSavingId(null)
      load()
    }
  }, [load, showToast])

  // Ask for the list again; when nothing is running any more, say how what this page started ended and save its file.
  const refresh = useCallback(async () => {
    const got = await load()
    if (!got || got.busy) return
    const watched = got.list.find((r) => r.id === wanted.current.watch)
    if (watched && watched.status !== 'running') {
      wanted.current.watch = null
      const what = watched.kind === 'restore' ? 'restore' : 'backup'
      if (watched.status === 'failed') showToast(`The ${what} did not finish. ${watched.detail || ''}`.trim(), 'error')
      else if (watched.kind === 'restore') showToast('The restore is done.', 'success')
      if (watched.kind === 'restore') {
        setResult(watched)
        setTab('restore')
        setSummaryVersion((v) => v + 1)
      }
    }
    const file = nextAutoDownload(got.list, wanted.current)
    if (file) {
      const place = wanted.current.places[file.id]
      delete wanted.current.places[file.id]
      await download(file, place)
    }
  }, [load, download, showToast, setTab])

  useEffect(() => {
    let alive = true
    api.get('/backups/')
      .then((r) => { if (alive) { setRows(r.data.results || []); setBusy(Boolean(r.data.busy)); setError('') } })
      .catch(() => { if (alive) { setError('Failed to load the backups.'); setRows((prev) => prev || []) } })
    return () => { alive = false }
  }, [])
  useEffect(() => {
    let alive = true
    api.get('/backups/summary/')
      .then((r) => { if (alive) setGroups(r.data.groups || []) })
      .catch(() => { if (alive) setGroups([]) })
    return () => { alive = false }
  }, [summaryVersion])
  // While one is running the list asks again every few seconds.
  useEffect(() => {
    if (!busy) return undefined
    const timer = setInterval(refresh, 4000)
    return () => clearInterval(timer)
  }, [busy, refresh])

  // Download backup opens Save As straight away. That window must open at the click itself (a browser refuses it minutes later),
  // so nothing comes before it; closing it starts nothing. The server names the backup by its date and time.
  const startBackup = async () => {
    setStarting(true)
    try {
      const place = await askWhereToSave(suggestedFileName(new Date()))
      if (place.kind === 'cancelled') return
      const r = await api.post('/backups/', { include_audit: includeAudit })
      wanted.current.ids.push(r.data.id)
      wanted.current.places[r.data.id] = place
      wanted.current.watch = r.data.id
      showToast(place.kind === 'picked' ? 'The backup has started. It can take a few minutes; then it is saved where you chose.'
        : 'The backup has started. It can take a few minutes; then the file downloads to this computer.', 'success')
      setBusy(true)
      refresh()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to start the backup.', 'error')
    } finally {
      setStarting(false)
    }
  }

  const downloadFromHistory = async (row) => {
    const place = await askWhereToSave(row.file_name || suggestedFileName(new Date(row.created_at)))
    if (place.kind !== 'cancelled') await download(row, place)
  }

  const restoreStarted = (entry) => {
    setResult(null)
    wanted.current.safety = true
    wanted.current.watch = entry.id
    showToast('The restore has started: a safety backup first, then the backup is put back. Keep this page open.', 'success')
    setBusy(true)
    refresh()
  }

  const list = rows || []
  const locked = busy || savingId !== null
  useLeaveGuard(locked)
  const restoreRunning = runningMessage(list).includes('restore')
  const lockVariant = savingId !== null && !busy ? 'saving' : (restoreRunning ? 'restore' : 'backup')
  const lockTitle = lockVariant === 'saving' ? 'Saving the backup file to this computer' : (restoreRunning ? 'Restoring data' : 'Creating backup')
  const lockMessage = savingId !== null && !busy ? 'The file is being downloaded.' : 'It can take a few minutes.'

  return (
    <PageLayout title="Backup & Restore" subtitle="Save a copy of the whole system, or put one back">
      <div className="space-y-4">
        <div className="flex justify-end">
          <PillTabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Backup and restore" />
        </div>

        {tab === 'create' ? (
          <CreateBackupTab
            groups={groups}
            includeAudit={includeAudit}
            onIncludeAudit={setIncludeAudit}
            locked={locked}
            busy={busy}
            starting={starting}
            error={error}
            onNew={startBackup}
            history={{ rows, savingId, locked, onDownload: downloadFromHistory }}
          />
        ) : (
          <>
            {error && <ErrorMessage message={error} />}
            <RestoreTab locked={locked} result={result} onStarted={restoreStarted} onClearResult={() => setResult(null)} />
          </>
        )}
      </div>

      {locked && <WorkLockScreen variant={lockVariant} title={lockTitle} message={lockMessage} />}
    </PageLayout>
  )
}
