import { useRef, useState } from 'react'
import { History, Loader2, Upload } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { formatBytes, formatDate, formatTime, restoreChange, restoreConfirmProblem, restoreFileProblem, restoreHeadline } from './backupFormat.js'

// Backup & Restore > Restore: drop a backup file (or browse for it), see what it would change, then confirm. Nothing is written until the Admin
// confirms with their password: dropping the file only reads it (POST /backups/restore/preview/ names the backup of the list it is and counts its
// records group by group next to the records now). Restore (POST /backups/restore/) then makes a safety backup of how things are now and puts the
// backup back. `hint` is the backup whose file the Admin said they want to restore from the history list; `onStarted(entry)` is told when it starts.
const TONES = {
  added: 'bg-[#EBF5EE] text-[#1B4D2E]',
  removed: 'bg-rose-50 text-rose-700',
  same: 'bg-[#F0F4F0] text-[#4A5E4A]',
  kept: 'bg-amber-50 text-amber-800',
}
const muted = 'text-[12px] text-[#7A8E7A]'
const LOCKED_REASON = 'Wait until the running backup or restore is done.'
const detail = (err, fallback) => err?.response?.data?.detail || fallback
const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } }

export default function RestoreTab({ locked, hint, onStarted }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [isReading, setIsReading] = useState(false)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [dragging, setDragging] = useState(false)
  const input = useRef(null)

  const reset = () => {
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
      reset()
    } catch (err) {
      setError(detail(err, 'The restore could not be started.'))
    } finally {
      setIsSending(false)
    }
  }

  const rows = (preview?.groups || []).map((g) => ({ ...g, change: restoreChange(g) }))
  const backup = preview?.backup

  return (
    <section aria-label="Restore" className="space-y-4 rounded-xl border border-[#E2E8E2] bg-white p-4">
      <p className="text-[13px] text-[#4A5E4A]">Add a backup file to see what it would change. Nothing is written until you confirm.</p>

      {hint && !preview && (
        <p className="rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-2 text-[12.5px] text-[#4A5E4A]">
          To restore &ldquo;{hint.name}&rdquo;, add its file{hint.file_name ? <>: <span className="break-all font-medium">{hint.file_name}</span></> : ''}.
        </p>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); if (!locked) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (!locked && e.dataTransfer.files?.[0]) choose(e.dataTransfer.files[0]) }}
        className={`flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center ${dragging ? 'border-[#1B4D2E] bg-[#F6FAF7]' : 'border-[#C8D5C8] bg-[#FBFCFB]'}`}
      >
        {isReading ? (
          <p role="status" className="flex items-center gap-2 text-[13px] text-[#4A5E4A]"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Reading {file?.name}…</p>
        ) : (
          <>
            <Upload size={22} className="text-[#7A8E7A]" aria-hidden="true" />
            <p className="text-[13px] font-medium text-[#1A2B1A]">Drag a backup file here</p>
            <p className={muted}>or browse for the .zip file saved from this page</p>
            <input ref={input} id="restore-file" type="file" className="sr-only" accept=".zip,application/zip,application/x-zip-compressed" tabIndex={-1}
              onChange={(e) => { if (e.target.files?.[0]) choose(e.target.files[0]) }} />
            <Button type="button" variant="outline" disabled={locked} title={locked ? LOCKED_REASON : undefined} onClick={() => input.current?.click()}>
              Browse files
            </Button>
            {file && !preview && <p className={muted}>{file.name}</p>}
          </>
        )}
      </div>

      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p>}

      {preview && backup && (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="rounded-lg border border-[#E2E8E2] px-3 py-2.5">
            <p className="text-[13px] font-semibold text-[#1A2B1A]">{backup.name}</p>
            <p className={muted}>
              Made {formatDate(backup.created_at)} at {formatTime(backup.created_at)} by {backup.made_by}
              {backup.location ? ` · kept at ${backup.location}` : ''} · {preview.file.name} ({formatBytes(preview.file.size_bytes)})
            </p>
            <p className="mt-1 text-[12.5px] text-[#4A5E4A]">{restoreHeadline(preview)}</p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#E2E8E2]">
            <table className="w-full min-w-[34rem] text-sm" aria-label="What this restore would change">
              <thead className="bg-[#F0F4F0] text-[#4A5E4A]">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold tracking-[0.06em]">Records</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold tracking-[0.06em]">In this backup</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold tracking-[0.06em]">Now</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold tracking-[0.06em]">A restore</th>
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

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-900">
            <p className="font-semibold">Everything recorded after this backup will be replaced.</p>
            <p>
              Records, uploaded files, user accounts and passwords go back to what this backup holds. A safety backup of how things are now is made first and
              saved to this computer. Do this when nobody else is using the system; everyone signs in again afterwards.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[14rem] flex-1">
              <label htmlFor="restore-password" className="mb-1 block text-[12px] font-medium text-[#4A5E4A]">Your password <span className="text-red-500">*</span></label>
              <input id="restore-password" type="password" autoComplete="current-password" className={baseInputClasses} value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }} />
            </div>
            <Button type="button" variant="outline" onClick={reset} disabled={isSending}>Choose another file</Button>
            <Button type="submit" variant="danger" icon={History} isLoading={isSending} disabled={isSending || locked} title={locked ? LOCKED_REASON : undefined}>Restore</Button>
          </div>
        </form>
      )}
    </section>
  )
}
