import { useState } from 'react'
import { History } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { confirmCounts, restoreConfirmProblem } from './backupFormat.js'

// "Are you sure you want to restore?": what will be replaced, the Admin's own password, then POST /backups/restore/ with the file
// and what to restore. The server makes a safety backup of how things are now before it puts anything back.
export default function RestoreConfirmWindow({ file, preview, choice, onClose, onStarted }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSending, setIsSending] = useState(false)
  const scope = choice.id
  const counts = confirmCounts(preview, scope)
  const records = (n) => `${n.toLocaleString('en-US')} record${n === 1 ? '' : 's'}`

  const submit = async (e) => {
    e.preventDefault()
    const problem = restoreConfirmProblem({ file, password })
    if (problem) { setError(problem); return }
    const body = new FormData()
    body.append('file', file)
    body.append('password', password)
    body.append('scope', scope)
    setIsSending(true)
    try {
      const r = await api.post('/backups/restore/', body, { headers: { 'Content-Type': 'multipart/form-data' } })
      onStarted(r.data)
    } catch (err) {
      setError(err?.response?.data?.detail || 'The restore could not be started.')
      setIsSending(false)
    }
  }

  return (
    <ModalShell
      title="Are you sure you want to restore?"
      subtitle={choice.label}
      icon={History}
      onClose={isSending ? () => {} : onClose}
      maxWidth="max-w-xl"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSending}>No</Button>
          <Button type="submit" form="restore-confirm-form" variant="danger" isLoading={isSending} disabled={isSending}>Yes, restore</Button>
        </>
      )}
    >
      <form id="restore-confirm-form" onSubmit={submit} className="space-y-3" noValidate>
        <div className={`rounded-lg border px-3 py-2.5 text-[13px] ${choice.danger ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-[#E2E8E2] bg-[#F6FAF7] text-[#1A2B1A]'}`}>
          <p>{choice.text}</p>
          <p className="mt-1.5">
            The backup holds {records(counts.in_file)}{scope === 'settings' ? ' in these lists' : ''}; the system holds {records(counts.now)} now.
            {scope === 'everything' ? ' The Audit Log is kept.' : ''}
          </p>
          <p className="mt-1.5">A safety backup of how things are now is made first.</p>
        </div>
        <FormSection title="Confirm">
          <FormRows label="Confirm the restore">
            <FormRow>
              <FormCell label="Your Password" required wide>
                <input id="restore-password" type="password" autoComplete="current-password" className={baseInputClasses} value={password} autoFocus
                  onChange={(e) => { setPassword(e.target.value); setError('') }} />
              </FormCell>
            </FormRow>
          </FormRows>
        </FormSection>
        {error && <p className="text-xs text-rose-600" role="alert">{error}</p>}
      </form>
    </ModalShell>
  )
}
