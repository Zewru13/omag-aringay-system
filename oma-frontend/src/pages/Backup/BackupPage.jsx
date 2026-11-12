import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, HardDriveDownload, History, Loader2, Pencil, Upload } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ImportFileModal from '../../components/ImportFileModal.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import CardHeader from '../../components/UI/CardHeader.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { downloadFile } from '../../utils/fileDownload.js'
import { CycleField, CycleRow, CycleRows, CycleSection } from '../Monitoring/CycleFormTable.jsx'
import BackupGroups from './BackupGroups.jsx'
import RestoreModal from './RestoreModal.jsx'
import {
  backupSummary, fileNote, formatBytes, formatDate, formatTime, nextAutoDownload, notesProblem, runningMessage,
} from './backupFormat.js'

// Admin > Backup & Restore, one page with three buttons. DOWNLOAD BACKUP: a backup is one file (.zip) with the whole database (and, if the Admin ticks it, the
// activity log and notifications) and every uploaded file. It is made only when the Admin presses it, and it is made for download: when it is done the page
// saves it to the computer and the online copy is removed. The history keeps every backup ever made (nothing is deleted) with its name, date, time and the
// place the Admin says the file is kept; those notes can be edited. RESTORE opens a table form: the Admin drops a backup's file, sees what it would change
// and confirms with their password (RestoreModal.jsx); a safety backup of how things are now is made first. IMPORT BACKUP FILE is the shared import window
// (Upload File, Preview, Done) pointed at /backups/import/: a backup made elsewhere is checked and added to the history so that Restore accepts it.
// While a backup or a restore is running, nothing else can be done here.
const TONES = { done: 'green', running: 'teal', failed: 'rose' }
const COLUMNS = [
  { key: 'name', label: 'NAME' },
  { key: 'date', label: 'DATE' },
  { key: 'time', label: 'TIME' },
  { key: 'location', label: 'LOCATION' },
  { key: 'made_by', label: 'MADE BY' },
  { key: 'size', label: 'SIZE' },
  { key: 'status', label: 'STATUS' },
  { key: 'actions', label: 'ACTIONS' },
]
const LOCKED_REASON = 'Wait until the running backup or restore is done.'
const muted = 'text-[12px] text-[#7A8E7A]'
const detail = (err, fallback) => err?.response?.data?.detail || fallback
// A file name may wrap after an underscore, never in the middle of its date.
const breakable = (name) => name.split('_').flatMap((part, i) => (i ? ['_', <wbr key={i} />, part] : [part]))

// The notes of a backup as a table of labelled rows: the same form starts a new backup (`backup` empty) and edits one.
function BackupNotesModal({ backup, onClose, onSubmit }) {
  const isEdit = Boolean(backup)
  const [form, setForm] = useState({ name: backup?.name || '', location: backup?.location || '', remarks: backup?.remarks || '' })
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const set = (field, value) => { setForm((f) => ({ ...f, [field]: value })); setError('') }

  const submit = async (e) => {
    e.preventDefault()
    const problem = isEdit ? notesProblem(form) : ''
    if (problem) { setError(problem); return }
    setIsSaving(true)
    try {
      await onSubmit({ name: form.name.trim(), location: form.location.trim(), remarks: form.remarks.trim() })
      onClose()
    } catch (err) {
      setError(detail(err, isEdit ? 'Failed to save the backup details.' : 'Failed to start the backup.'))
      setIsSaving(false)
    }
  }

  return (
    <ModalShell
      title={isEdit ? 'Edit Backup Details' : 'Download Backup'}
      subtitle={isEdit ? 'Its name and where its file is kept. The date, the time and the result cannot be changed.'
        : 'One file with every record and every uploaded file, saved to this computer.'}
      icon={isEdit ? Pencil : HardDriveDownload}
      onClose={isSaving ? () => {} : onClose}
      maxWidth="max-w-2xl"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button type="submit" form="backup-notes-form" isLoading={isSaving} disabled={isSaving}>{isEdit ? 'Update' : 'Start Backup'}</Button>
        </>
      )}
    >
      <form id="backup-notes-form" onSubmit={submit} className="space-y-3" noValidate>
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p>}
        <CycleSection title="Backup Details">
          <CycleRows label="Backup details">
            <CycleRow>
              <CycleField label="Name" required={isEdit} wide
                hint={!isEdit && <p className={`mt-1 ${muted}`}>Leave it empty to name it by its date and time.</p>}>
                <input id="backup-name" className={baseInputClasses} value={form.name} maxLength={120} autoFocus placeholder="e.g. Before the year-end reports"
                  onChange={(e) => set('name', e.target.value)} />
              </CycleField>
            </CycleRow>
            <CycleRow>
              <CycleField label="Location" wide hint={<p className={`mt-1 ${muted}`}>Where the downloaded file is kept, so it can be found again for a restore.</p>}>
                <input id="backup-location" className={baseInputClasses} value={form.location} maxLength={255} placeholder="e.g. Office computer, drive D, Backups folder"
                  onChange={(e) => set('location', e.target.value)} />
              </CycleField>
            </CycleRow>
            <CycleRow>
              <CycleField label="Remarks" wide>
                <input id="backup-remarks" className={baseInputClasses} value={form.remarks} maxLength={255} placeholder="Optional"
                  onChange={(e) => set('remarks', e.target.value)} />
              </CycleField>
            </CycleRow>
            {isEdit && (
              <>
                <CycleRow>
                  <CycleField label="Date"><p className="py-1.5 text-[13px] text-[#1A2B1A]">{formatDate(backup.created_at)}</p></CycleField>
                  <CycleField label="Time"><p className="py-1.5 text-[13px] text-[#1A2B1A]">{formatTime(backup.created_at)}</p></CycleField>
                </CycleRow>
                {backup.file_name && (
                  <CycleRow>
                    <CycleField label="File" wide><p className="break-all py-1.5 text-[13px] text-[#1A2B1A]">{backup.file_name}</p></CycleField>
                  </CycleRow>
                )}
              </>
            )}
          </CycleRows>
        </CycleSection>
      </form>
    </ModalShell>
  )
}

export default function BackupPage() {
  const { showToast } = useToast()
  const [restoring, setRestoring] = useState(null)   // null = closed, {} = Restore from any file, a row = the backup whose file was asked for
  const [importing, setImporting] = useState(false)
  const [groups, setGroups] = useState(null)      // what a backup holds, from the server (null while loading)
  const [includeAudit, setIncludeAudit] = useState(false)   // the activity log and notifications go in the backup only when the Admin ticks it
  const [rows, setRows] = useState(null)          // null while loading
  const [busy, setBusy] = useState(false)         // a backup or a restore is running (the server says so)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState(null)  // the backup whose file is being saved to the computer
  const [notes, setNotes] = useState(null)        // null = closed, {} = a new backup, a row = editing it
  // What this page started and still has to finish: files to save by itself, and the entry whose end it announces.
  const wanted = useRef({ ids: [], safety: false, watch: null })

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

  const download = useCallback(async (row) => {
    wanted.current.ids = wanted.current.ids.filter((id) => id !== row.id)
    if (row.kind === 'safety') wanted.current.safety = false
    setSavingId(row.id)
    try {
      await downloadFile(api, `/backups/${row.id}/download/`, row.file_name || `oma_backup_${row.id}.zip`)
      // The whole file is here: the online copy can go. The entry stays in the list.
      await api.post(`/backups/${row.id}/downloaded/`)
      showToast(`Saved to this computer as ${row.file_name || 'a .zip file'}. Keep it somewhere safe.`, 'success')
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
      else if (watched.kind === 'restore') showToast('The restore is done. The records and files are back to that backup.', 'success')
    }
    const file = nextAutoDownload(got.list, wanted.current)
    if (file) await download(file)
  }, [load, download, showToast])

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
  }, [])
  // While one is running the list asks again every few seconds.
  useEffect(() => {
    if (!busy) return undefined
    const timer = setInterval(refresh, 4000)
    return () => clearInterval(timer)
  }, [busy, refresh])

  const startBackup = async (body) => {
    const r = await api.post('/backups/', { ...body, include_audit: includeAudit })
    wanted.current.ids.push(r.data.id)
    wanted.current.watch = r.data.id
    showToast('The backup has started. It can take a few minutes; the file is saved to this computer when it is done.', 'success')
    refresh()
  }

  const saveNotes = async (body) => {
    await api.patch(`/backups/${notes.id}/`, body)
    showToast('Backup details updated.', 'success')
    load()
  }

  const restoreStarted = (entry) => {
    wanted.current.safety = true
    wanted.current.watch = entry.id
    showToast('The restore has started: a safety backup first, then the backup is put back. Keep this page open.', 'success')
    refresh()
  }

  const list = rows || []
  const locked = busy || savingId !== null
  const data = list.map((row) => ({
    id: row.id,
    name: (
      <div className="min-w-0 md:min-w-[165px]">
        <p className="break-words font-medium text-[#1A2B1A]">{row.name}</p>
        <p className={`break-words ${muted}`}>{backupSummary(row)}</p>
        {row.remarks && <p className={`break-words ${muted}`}>{row.remarks}</p>}
      </div>
    ),
    date: <span className="whitespace-nowrap">{formatDate(row.created_at)}</span>,
    time: <span className="whitespace-nowrap">{formatTime(row.created_at)}</span>,
    location: (
      <div className="min-w-0 md:min-w-[160px]">
        <p className="break-words">{row.location || <span className="text-[#A8BCA8]">—</span>}</p>
        {row.file_name && <p className={`break-words ${muted}`}>{breakable(row.file_name)}</p>}
      </div>
    ),
    made_by: (
      <div>
        <p>{row.made_by}</p>
        <p className={`whitespace-nowrap ${muted}`}>{row.kind_label}</p>
      </div>
    ),
    size: <span className="whitespace-nowrap tabular-nums">{row.kind !== 'restore' && row.status === 'done' ? formatBytes(row.size_bytes) : '—'}</span>,
    status: (
      <div>
        <StatusPill tone={TONES[row.status] || 'slate'}>{row.status_label}</StatusPill>
        {fileNote(row) && <p className={`mt-1 whitespace-nowrap ${row.has_file ? 'text-[12px] font-medium text-[#1B4D2E]' : muted}`}>{fileNote(row)}</p>}
      </div>
    ),
    actions: (
      <RowActions alwaysMenu actions={[
        row.has_file && { key: 'download', label: savingId === row.id ? 'Saving…' : 'Download', icon: Download, onClick: () => download(row), disabled: locked, disabledReason: LOCKED_REASON },
        row.status !== 'running' && { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setNotes(row), disabled: locked, disabledReason: LOCKED_REASON },
        row.can_restore && { key: 'restore', label: 'Restore', icon: History, onClick: () => setRestoring(row), disabled: locked, disabledReason: LOCKED_REASON, group: 'restore' },
      ]} />
    ),
  }))

  return (
    <PageLayout title="Backup & Restore" subtitle="Save a copy of the whole system, or put one back">
      <div className="space-y-4">
        <section aria-label="Backup" className="space-y-4 rounded-xl border border-[#E2E8E2] bg-white p-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 basis-64 text-[13px] text-[#4A5E4A]">One file (.zip) with every record below and every uploaded photo and file.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" icon={Download} disabled={locked || rows === null} onClick={() => setNotes({})}>
                {busy ? 'Please wait…' : 'Download backup'}
              </Button>
              <Button type="button" variant="outline" icon={History} disabled={locked} onClick={() => setRestoring({})}>Restore</Button>
              <Button type="button" variant="outline" icon={Upload} disabled={locked} onClick={() => setImporting(true)}>Import backup file</Button>
            </div>
          </div>
          <BackupGroups groups={groups} includeAudit={includeAudit} onIncludeAudit={setIncludeAudit} disabled={locked} />
        </section>

        {busy && (
          <div role="status" className="flex items-center gap-3 rounded-xl border border-[#E2E8E2] bg-white px-4 py-3 text-[13px] text-[#4A5E4A]">
            <Loader2 size={18} className="shrink-0 animate-spin text-[#1B4D2E]" aria-hidden="true" />
            <p><span className="font-semibold text-[#1A2B1A]">{runningMessage(list) || 'A backup or a restore is running.'}</span> Please wait: nothing else can be done here until it is finished.</p>
          </div>
        )}
        {error && <ErrorMessage message={error} />}

        <div className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <CardHeader title="Backup history" count={list.length} />
          <DataTable bare columns={COLUMNS} data={data} isLoading={rows === null} phoneTitleKey="name" phoneSubtitleKey="date"
            emptyState={<p className="px-5 py-8 text-center text-sm text-slate-500">No backup yet. Press Download backup to make the first one.</p>} />
        </div>
      </div>

      {notes && !notes.id && <BackupNotesModal onClose={() => setNotes(null)} onSubmit={startBackup} />}
      {notes?.id && <BackupNotesModal backup={notes} onClose={() => setNotes(null)} onSubmit={saveNotes} />}
      {restoring && <RestoreModal hint={restoring.id ? restoring : null} locked={locked} onClose={() => setRestoring(null)} onStarted={restoreStarted} />}
      {importing && (
        <ImportFileModal
          title="Import Backup File"
          subtitle="Check a backup file made elsewhere and add it to the history. No record is changed."
          importUrl="/backups/import/"
          accept=".zip,application/zip,application/x-zip-compressed"
          chooseText="Click to choose a backup file (.zip)"
          fileHint="The .zip file saved from Backup & Restore, on this or another copy of the system"
          rowWord="Check"
          createdText={(r) => (r.created ? 'Added to the Backup history as an Imported entry' : 'Nothing was added: the file is already in the history')}
          icon={Upload}
          onClose={() => setImporting(false)}
          onImported={load}
        />
      )}
    </PageLayout>
  )
}
