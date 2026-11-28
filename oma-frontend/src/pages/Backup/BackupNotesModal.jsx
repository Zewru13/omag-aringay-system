import { useState } from 'react'
import { HardDriveDownload, Pencil } from 'lucide-react'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { CycleField, CycleRow, CycleRows, CycleSection } from '../Monitoring/CycleFormTable.jsx'
import { formatDate, formatTime, notesProblem } from './backupFormat.js'

const muted = 'text-[12px] text-[#7A8E7A]'

// The notes of a backup as a table of labelled rows: the same form starts a new backup (`backup` empty) and edits one.
// `onSubmit` answers false when nothing was started (the Admin closed the Save As window): the form then stays open.
export default function BackupNotesModal({ backup, onClose, onSubmit }) {
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
      const done = await onSubmit({ name: form.name.trim(), location: form.location.trim(), remarks: form.remarks.trim() })
      if (done === false) { setIsSaving(false); return }
      onClose()
    } catch (err) {
      setError(err?.response?.data?.detail || (isEdit ? 'Failed to save the backup details.' : 'Failed to start the backup.'))
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
