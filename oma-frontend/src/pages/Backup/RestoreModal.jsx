import { useRef, useState } from 'react'
import { History, Loader2, Upload } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { DetailTable, FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { formatBytes, formatDate, formatTime, restoreChange, restoreConfirmProblem, restoreFileProblem, restoreHeadline } from './backupFormat.js'

// Backup & Restore > Restore: a table form. Drag a backup file onto it (or Browse files) and the window reads it: it names the backup of the history the
// file is and counts its records group by group next to the records now (POST /backups/restore/preview/, which changes nothing). Typing the password and
// pressing Restore (POST /backups/restore/) then makes a safety backup of how things are now and puts the backup back. A file the history does not know is
// refused: Import backup file adds it first. `hint` is the backup whose file the Admin chose to restore from the history; `onStarted(entry)` is told when
// the restore starts.
const TONES = {
  added: 'bg-[#EBF5EE] text-[#1B4D2E]',
  removed: 'bg-rose-50 text-rose-700',
  same: 'bg-[#F0F4F0] text-[#4A5E4A]',
  kept: 'bg-[#F0F4F0] text-[#7A8E7A]',
}
const muted = 'text-[12px] text-[#7A8E7A]'
const detail = (err, fallback) => err?.response?.data?.detail || fallback
const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } }

export default function RestoreModal({ hint, locked, onClose, onStarted }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [isReading, setIsReading] = useState(false)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [dragging, setDragging] = useState(false)
  const input = useRef(null)

  const startOver = () => {
    setFile(null)
    setPreview(null)
    setError('')
    setPassword('')
    if (input.current) input.current.value = ''
  }

  // Reading the dropped file changes nothing: the server names the backup it is and counts what is in it.
  const choose = async (picked) => {
    setPreview(null)
    setPassword('')
    const problem = restoreFileProblem(picked)
    if (problem) { setFile(null); setError(problem); return }
    setFile(picked)
    setError('')
    setIsReading(true)
    try {
      const body = new FormData()
      body.append('file', picked)
      const r = await api.post('/backups/restore/preview/', body, MULTIPART)
      setPreview(r.data)
    } catch (err) {
      setFile(null)
      setError(detail(err, 'The file could not be read.'))
      if (input.current) input.current.value = ''
    } finally {
      setIsReading(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    const problem = restoreConfirmProblem({ file, password })
    if (problem) { setError(problem); return }
    const body = new FormData()
    body.append('file', file)
    body.append('password', password)
    setIsSending(true)
    try {
      const r = await api.post('/backups/restore/', body, MULTIPART)
      onStarted(r.data)
      onClose()
    } catch (err) {
      setError(detail(err, 'The restore could not be started.'))
      setIsSending(false)
    }
  }

  const backup = preview?.backup
  const rows = (preview?.groups || []).map((g) => ({ ...g, change: restoreChange(g) }))
  const busy = isReading || isSending

  return (
    <ModalShell
      title="Restore Backup"
      subtitle="Put the records and uploaded files back to how they were when a backup was made."
      icon={History}
      onClose={busy ? () => {} : onClose}
      maxWidth="max-w-3xl"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" form="backup-restore-form" variant="danger" isLoading={isSending} disabled={!preview || busy || locked}>Restore</Button>
        </>
      )}
    >
      <form id="backup-restore-form" onSubmit={submit} className="space-y-3" noValidate>
        <FormSection title="Backup File">
          <FormRows label="Backup file">
            <FormRow>
              <FormCell label="Backup File" required wide error={error}
                hint={hint && !preview ? <p className={`mt-1 break-all ${muted}`}>The file of &ldquo;{hint.name}&rdquo;{hint.file_name ? `: ${hint.file_name}` : ''}.</p> : null}>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files?.[0]) choose(e.dataTransfer.files[0]) }}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-5 text-center ${dragging ? 'border-[#1B4D2E] bg-[#F6FAF7]' : 'border-[#C8D5C8] bg-[#FBFCFB]'}`}
                >
                  {isReading ? (
                    <p role="status" className="flex items-center gap-2 text-[13px] text-[#4A5E4A]"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Reading {file?.name}…</p>
                  ) : (
                    <>
                      <Upload size={20} className="text-[#7A8E7A]" aria-hidden="true" />
                      <p className="text-[13px] font-medium text-[#1A2B1A]">{file && preview ? file.name : 'Drag a backup file here'}</p>
                      <p className={muted}>{file && preview ? `${formatBytes(file.size)}` : 'or browse for the .zip file saved from this page'}</p>
                      <input ref={input} id="restore-file" type="file" className="sr-only" accept=".zip,application/zip,application/x-zip-compressed" tabIndex={-1}
                        onChange={(e) => { if (e.target.files?.[0]) choose(e.target.files[0]) }} />
                      <Button type="button" variant="outline" size="sm" disabled={locked} onClick={() => (preview ? startOver() : input.current?.click())}>
                        {preview ? 'Choose another file' : 'Browse files'}
                      </Button>
                    </>
                  )}
                </div>
              </FormCell>
            </FormRow>
          </FormRows>
        </FormSection>

        {preview && backup && (
          <>
            <DetailTable
              title="Backup"
              fields={[
                { label: 'Name', value: backup.name },
                { label: 'Made', value: `${formatDate(backup.created_at)} at ${formatTime(backup.created_at)} by ${backup.made_by}` },
                { label: 'Location', value: backup.location || '—' },
                { label: 'File', value: `${preview.file.name} (${formatBytes(preview.file.size_bytes)})` },
                { label: 'Holds', value: restoreHeadline(preview), wide: true },
              ]}
            />

            <FormSection title="What a Restore Does">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[30rem] text-sm" aria-label="What this restore would change">
                  <thead className="bg-[#F9FAF9] text-[#4A5E4A]">
                    <tr>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold tracking-[0.06em]">Records</th>
                      <th className="px-3 py-2 text-right text-[11px] font-semibold tracking-[0.06em]">In this backup</th>
                      <th className="px-3 py-2 text-right text-[11px] font-semibold tracking-[0.06em]">Now</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold tracking-[0.06em]">A restore</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((g) => (
                      <tr key={g.key} className="border-t border-[#F0F4F0]">
                        <td className="px-3 py-2 text-[13px] font-medium text-[#1A2B1A]">{g.label}</td>
                        <td className="px-3 py-2 text-right text-[13px] tabular-nums text-[#4A5E4A]">{g.in_file === null ? '—' : g.in_file.toLocaleString('en-US')}</td>
                        <td className="px-3 py-2 text-right text-[13px] tabular-nums text-[#4A5E4A]">{g.now.toLocaleString('en-US')}</td>
                        <td className="px-3 py-2"><span className={`inline-block rounded-full px-2 py-0.5 text-[11.5px] font-medium ${TONES[g.change.tone]}`}>{g.change.text}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </FormSection>

            <FormSection title="Confirm">
              <FormRows label="Confirm the restore">
                <FormRow>
                  <FormCell label="Your Password" required wide>
                    <input id="restore-password" type="password" autoComplete="current-password" className={baseInputClasses} value={password}
                      onChange={(e) => { setPassword(e.target.value); setError('') }} />
                  </FormCell>
                </FormRow>
              </FormRows>
            </FormSection>
          </>
        )}
      </form>
    </ModalShell>
  )
}
