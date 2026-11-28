import { useRef, useState } from 'react'
import { FileArchive, History, Loader2, Upload } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import RestoreConfirmWindow from './RestoreConfirmWindow.jsx'
import RestoreResult from './RestoreResult.jsx'
import {
  RESTORE_SCOPES, defaultScope, formatBytes, keptWords, offersSettings, previewRows, restoreFileProblem, takenLine,
} from './backupFormat.js'

// Backup & Restore > Restore. The Admin adds a backup's file and the page says what it would change (POST /backups/restore/preview/,
// which changes nothing): by list for "Settings and lists", by group of records for "Everything". The restore itself is confirmed
// with the password (RestoreConfirmWindow). `result` is the entry of the restore that has just ended.
const muted = 'text-[12px] text-[#7A8E7A]'
const head = 'px-3 py-2 text-[11px] font-semibold tracking-[0.06em]'
const cell = 'px-3 py-2 text-[13px]'

export default function RestoreTab({ locked, result, onStarted, onClearResult }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [scope, setScope] = useState('everything')
  const [isReading, setIsReading] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const input = useRef(null)
  const latest = useRef(0)          // only the answer about the file added last counts

  const browse = () => input.current?.click()

  const startOver = () => {
    latest.current += 1
    setFile(null)
    setPreview(null)
    setIsReading(false)
    setError('')
    setConfirming(false)
  }

  // Reading the file changes nothing: the server names the backup it is and counts what is in it.
  const choose = async (picked) => {
    startOver()
    const problem = restoreFileProblem(picked)
    if (problem) { setError(problem); return }
    const asked = latest.current
    setFile(picked)
    setIsReading(true)
    try {
      const body = new FormData()
      body.append('file', picked)
      const r = await api.post('/backups/restore/preview/', body, { headers: { 'Content-Type': 'multipart/form-data' } })
      if (asked !== latest.current) return
      setPreview(r.data)
      setScope(defaultScope(r.data))
    } catch (err) {
      if (asked !== latest.current) return
      setFile(null)
      setError(err?.response?.data?.detail || 'The file could not be read.')
    } finally {
      if (asked === latest.current) setIsReading(false)
    }
  }

  const started = (entry) => {
    startOver()
    onStarted(entry)
  }

  const choices = offersSettings(preview) ? RESTORE_SCOPES : RESTORE_SCOPES.filter((s) => s.id === 'everything')
  const choice = choices.find((s) => s.id === scope) || choices[0]
  const shown = previewRows(preview, choice.id)

  if (result) {
    return (
      <section aria-label="Restore" className="space-y-4 rounded-xl border border-[#E2E8E2] bg-white p-4">
        <RestoreResult entry={result} />
        <Button type="button" variant="outline" icon={History} onClick={onClearResult}>Restore another file</Button>
      </section>
    )
  }

  return (
    <section aria-label="Restore" className="space-y-4 rounded-xl border border-[#E2E8E2] bg-white p-4">
      <p className="text-[13px] text-[#4A5E4A]">Add a backup file to see what it would change. Nothing is written until you confirm.</p>

      <input ref={input} id="restore-file" type="file" className="sr-only" accept=".zip,application/zip,application/x-zip-compressed" tabIndex={-1} aria-label="Backup file"
        onChange={(e) => { const picked = e.target.files?.[0]; e.target.value = ''; if (picked) choose(picked) }} />

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (!locked && e.dataTransfer.files?.[0]) choose(e.dataTransfer.files[0]) }}
      >
        {file ? (
          <div className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-3 ${dragging ? 'border-[#1B4D2E] bg-[#F6FAF7]' : 'border-[#E2E8E2] bg-[#FBFCFB]'}`}>
            <FileArchive size={22} className="flex-none text-[#1B4D2E]" aria-hidden="true" />
            <div className="min-w-0 flex-1 basis-48">
              <p className="break-all text-[13px] font-semibold text-[#1A2B1A]">{file.name}</p>
              <p className={muted}>{preview ? takenLine(preview) : formatBytes(file.size)}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={locked} onClick={browse}>Change file</Button>
              <Button type="button" variant="outline" size="sm" disabled={locked} onClick={startOver}>Remove</Button>
            </div>
          </div>
        ) : (
          <div className={`flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center ${dragging ? 'border-[#1B4D2E] bg-[#F6FAF7]' : 'border-[#C8D5C8] bg-[#FBFCFB]'}`}>
            <Upload size={22} className="text-[#7A8E7A]" aria-hidden="true" />
            <p className="text-[13px] text-[#1A2B1A]">Drag a backup file here, or browse for a .zip file saved from this page.</p>
            <Button type="button" variant="outline" size="sm" disabled={locked} onClick={browse}>Browse files</Button>
          </div>
        )}
      </div>

      {error && <p className="text-[13px] text-rose-600" role="alert">{error}</p>}
      {isReading && (
        <p role="status" className="flex items-center gap-2 text-[13px] text-[#4A5E4A]"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Checking what would change…</p>
      )}

      {preview && (
        <>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-[13px] font-semibold text-[#1A2B1A]">What to restore</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {choices.map((option) => {
                const picked = option.id === choice.id
                const danger = Boolean(option.danger)
                const border = picked ? (danger ? 'border-rose-500 bg-rose-50' : 'border-[#1B4D2E] bg-[#F6FAF7]') : 'border-[#E2E8E2] bg-white'
                return (
                  <label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 ${border}`}>
                    <input type="radio" name="restore-scope" value={option.id} checked={picked} onChange={() => setScope(option.id)}
                      className={`mt-0.5 h-4 w-4 flex-none ${danger ? 'accent-rose-600' : 'accent-[#1B4D2E]'}`} />
                    <span className="min-w-0">
                      <span className={`block text-[13px] font-semibold ${danger ? 'text-rose-700' : 'text-[#1A2B1A]'}`}>{option.label}</span>
                      <span className={`block text-[12px] leading-snug ${danger ? 'text-rose-700' : 'text-[#7A8E7A]'}`}>{option.text}</span>
                    </span>
                  </label>
                )
              })}
            </div>
            {!offersSettings(preview) && <p className={muted}>The server is still being updated. Settings and lists will be available in a few minutes.</p>}
          </fieldset>

          <div className="overflow-x-auto rounded-lg border border-[#E2E8E2]">
            <table className="w-full text-sm" aria-label="What this restore would change">
              <thead className="bg-[#F9FAF9] text-[#4A5E4A]">
                <tr>
                  <th className={`${head} text-left`}>Records</th>
                  <th className={`${head} text-right`}>In this backup</th>
                  <th className={`${head} text-right`}>In the system now</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.key} className="border-t border-[#F0F4F0]">
                    <td className={`${cell} font-medium text-[#1A2B1A]`}>{row.label}</td>
                    <td className={`${cell} text-right tabular-nums text-[#4A5E4A]`}>
                      {row.kept ? <span className="text-[#7A8E7A]">{keptWords(choice.id)}</span> : row.in_file.toLocaleString('en-US')}
                    </td>
                    <td className={`${cell} text-right tabular-nums text-[#4A5E4A]`}>{row.now.toLocaleString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="danger" icon={History} disabled={locked} onClick={() => setConfirming(true)}>{choice.button}</Button>
          </div>
        </>
      )}

      {confirming && preview && (
        <RestoreConfirmWindow file={file} preview={preview} choice={choice} onClose={() => setConfirming(false)} onStarted={started} />
      )}
    </section>
  )
}
