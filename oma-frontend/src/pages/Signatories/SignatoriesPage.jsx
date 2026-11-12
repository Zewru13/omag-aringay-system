import { useEffect, useState } from 'react'
import { Pencil, PenLine, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import CardHeader from '../../components/UI/CardHeader.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { AddRowFooter, DraftActions, DraftInput, DraftSelect, useAddRow } from '../../components/UI/InlineAddRow.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { SettingsFields, SettingsField } from '../../components/UI/SettingsFormTable.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { SIGNATORY_ROLES, roleLabel, signatoryError } from '../../utils/signatories.js'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'

// Admin > Signatories: the officials the Reports pages offer as Prepared / Checked / Noted / Approved by. One row is one person in one
// signing role (a person who signs in two roles is added twice). A row that is not Active is no longer offered; Order sorts a role's list.
// A new signatory is typed in a row of the table (the Add Signatory button is under it), like the other settings tables; Edit opens the form.

const COLUMNS = [
  { key: 'name', label: 'NAME' },
  { key: 'position', label: 'POSITION' },
  { key: 'role', label: 'SIGNING ROLE' },
  { key: 'sort_order', label: 'ORDER' },
  { key: 'active', label: 'ACTIVE' },
  { key: 'actions', label: 'ACTIONS' },
]

const EMPTY = { name: '', position: '', role: 'noted', sort_order: '0', is_active: true }
const first = (v) => (Array.isArray(v) ? v[0] : v)

function SignatoryModal({ signatory, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEdit = Boolean(signatory?.id)
  const original = isEdit
    ? { name: signatory.name, position: signatory.position || '', role: signatory.role, sort_order: String(signatory.sort_order ?? 0), is_active: signatory.is_active }
    : EMPTY
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`signatory:${signatory?.id ?? 'new'}`)
  const [form, setForm] = useDraftField(draft, 'form', original)
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const hasChanges = JSON.stringify(form) !== JSON.stringify(original)
  const set = (field, value) => { setForm((f) => ({ ...f, [field]: value })); setErrors((e) => ({ ...e, [field]: undefined, general: undefined })) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const problem = signatoryError(form)
    if (problem) { setErrors(form.name.trim() ? { role: problem } : { name: problem }); return }
    const body = { name: form.name.trim(), position: form.position.trim(), role: form.role, sort_order: Number(form.sort_order) || 0, is_active: form.is_active }
    setIsSubmitting(true)
    try {
      if (isEdit) await api.put(`/reports/signatories/${signatory.id}/`, body)
      else await api.post('/reports/signatories/', body)
      showToast(isEdit ? 'Signatory updated.' : 'Signatory added.', 'success')
      draft.clear()
      onSaved(); onClose()
    } catch (err) {
      const data = err?.response?.data || {}
      setErrors({ name: first(data.name), role: first(data.role), sort_order: first(data.sort_order), general: first(data.detail) || (Object.keys(data).length ? undefined : 'Failed to save the signatory.') })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title={isEdit ? 'Edit Signatory' : 'Add Signatory'}
      subtitle="Offered in the signature block of the printed reports."
      icon={PenLine}
      onClose={onClose}
      maxWidth="max-w-xl"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="signatory-form" isLoading={isSubmitting} disabled={isSubmitting || (isEdit && !hasChanges)}>
            {isEdit ? 'Update' : 'Add'}
          </Button>
        </>
      )}
    >
      <form id="signatory-form" onSubmit={handleSubmit} className="space-y-3" noValidate>
        <DraftBanner draft={draft} />
        {errors.general && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{errors.general}</p>}
        <SettingsFields title="Signatory">
        <SettingsField label="Name" required error={errors.name}>
          <input className={baseInputClasses} value={form.name} maxLength={150} autoFocus placeholder="e.g. Ana R. Cruz" onChange={(e) => set('name', e.target.value)} />
        </SettingsField>
        <SettingsField label="Position">
          <input className={baseInputClasses} value={form.position} maxLength={150} placeholder="e.g. Municipal Agriculturist" onChange={(e) => set('position', e.target.value)} />
          <p className="mt-1 text-[11.5px] text-[#7A8E7A]">Printed under the name.</p>
        </SettingsField>
        <SettingsField label="Signing role" required error={errors.role}>
          <select className={baseInputClasses} value={form.role} onChange={(e) => set('role', e.target.value)}>
            {SIGNATORY_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </SettingsField>
        <SettingsField label="Order" error={errors.sort_order}>
          <input className={baseInputClasses} type="number" min="0" inputMode="numeric" value={form.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
          <p className="mt-1 text-[11.5px] text-[#7A8E7A]">Smaller numbers come first in that role's list.</p>
        </SettingsField>
          <SettingsField label="Active">
            <label className="flex min-h-[40px] items-center gap-2 text-[13px] text-[#1A2B1A]">
              <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="h-4 w-4 accent-[#1B4D2E]" />
              Offered in the Reports pages
            </label>
          </SettingsField>
        </SettingsFields>
      </form>
    </ModalShell>
  )
}

export default function SignatoriesPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)   // null = closed, a row = editing it
  const add = useAddRow({ name: '', position: '', role: 'noted', sort_order: '0' }, 'signatory')
  const [deleting, setDeleting] = useState(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let alive = true
    api.get('/reports/signatories/?all=1')
      .then((r) => { if (alive) { setRows(Array.isArray(r.data) ? r.data : (r.data.results || [])); setError('') } })
      .catch(() => { if (alive) setError('Failed to load the signatories.') })
      .finally(() => { if (alive) setIsLoading(false) })
    return () => { alive = false }
  }, [version])

  const refresh = () => setVersion((v) => v + 1)

  const saveDraft = async () => {
    const d = add.draft
    const problem = signatoryError(d)
    if (problem) { showToast(problem, 'error'); return }
    add.setIsSaving(true)
    try {
      await api.post('/reports/signatories/', { name: d.name.trim(), position: d.position.trim(), role: d.role, sort_order: Number(d.sort_order) || 0, is_active: true })
      showToast('Signatory added.', 'success')
      add.close()
      refresh()
    } catch (err) {
      const data = err?.response?.data || {}
      showToast(first(data.name) || first(data.role) || first(data.sort_order) || first(data.detail) || 'Failed to save the signatory.', 'error')
    } finally {
      add.setIsSaving(false)
    }
  }

  const data = rows.map((s) => ({
    id: s.id,
    name: s.name,
    position: s.position || <span className="text-[#A8BCA8]">—</span>,
    role: roleLabel(s.role),
    sort_order: s.sort_order,
    active: <StatusPill tone={s.is_active ? 'green' : 'slate'}>{s.is_active ? 'Active' : 'Inactive'}</StatusPill>,
    actions: (
      <RowActions actions={[
        { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setEditing(s) },
        { key: 'delete', label: 'Delete', icon: Trash2, onClick: () => setDeleting(s), tone: 'rose' },
      ]} />
    ),
  }))

  if (add.isOpen) {
    data.unshift({
      id: 'new',
      name: <DraftInput value={add.draft.name} aria-label="New signatory name" placeholder="e.g. Ana R. Cruz" maxLength={150}
        onChange={(e) => add.change({ name: e.target.value })} onSave={saveDraft} onCancel={add.close} />,
      position: <DraftInput value={add.draft.position} aria-label="Position" placeholder="e.g. Municipal Agriculturist" maxLength={150}
        onChange={(e) => add.change({ position: e.target.value })} onSave={saveDraft} onCancel={add.close} />,
      role: (
        <DraftSelect value={add.draft.role} aria-label="Signing role" onChange={(e) => add.change({ role: e.target.value })}>
          {SIGNATORY_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </DraftSelect>
      ),
      sort_order: <DraftInput type="number" min="0" inputMode="numeric" value={add.draft.sort_order} aria-label="Order"
        onChange={(e) => add.change({ sort_order: e.target.value })} onSave={saveDraft} onCancel={add.close} />,
      active: <StatusPill tone="green">Active</StatusPill>,
      actions: <DraftActions onSave={saveDraft} onCancel={add.close} isSaving={add.isSaving} />,
    })
  }

  return (
    <PageLayout title="Manage Signatories" subtitle="The officials the Reports pages offer as Prepared, Checked, Noted and Approved by.">
      <div className="space-y-4">
        {error && <ErrorMessage message={error} />}
        <div className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <CardHeader title="Signatories" count={rows.length} />
          <DataTable bare columns={COLUMNS} data={data} isLoading={isLoading}
            emptyState={<p className="px-4 py-8 text-center text-sm text-slate-500">No signatories yet. The Reports pages offer the names you add here.</p>} />
          {!isLoading && <AddRowFooter onClick={add.open} disabled={add.isOpen} label="Add Signatory" />}
        </div>
      </div>

      {editing && <SignatoryModal signatory={editing} onClose={() => setEditing(null)} onSaved={refresh} />}

      {deleting && (
        <ConfirmDialog
          title="Delete Signatory"
          message={`Delete ${deleting.name} (${roleLabel(deleting.role)})? Reports already printed keep their names.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={async () => {
            try {
              await api.delete(`/reports/signatories/${deleting.id}/`)
              showToast('Signatory deleted.', 'success')
              setDeleting(null); refresh()
            } catch {
              showToast('Failed to delete the signatory.', 'error')
              setDeleting(null)
            }
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </PageLayout>
  )
}
