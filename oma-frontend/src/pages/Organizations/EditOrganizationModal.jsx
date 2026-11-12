import { useState } from 'react'
import { Pencil } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import { FormSection } from '../../components/UI/FormTable.jsx'
import { localToday } from '../../utils/inputGuards.js'
import OrganizationFormSections from './OrganizationFormSections.jsx'
import { changeOrganization, organizationBody, organizationFormFrom, organizationProblems } from './organizationForm.js'
import { agencyLabel, agencyOptionsFor } from './agencyOptions.js'
import MembersEditor from './MembersEditor.jsx'
import { memberLinesProblem, memberOutcome, memberPayload, memberRefusal } from './registrationMembers.js'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'

export default function EditOrganizationModal({ organization, type, onClose, onSuccess }) {
  const { showToast } = useToast()

  const originalForm = organizationFormFrom(organization)

  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`edit-organization:${type}:${organization.id}`)
  const [form, setForm] = useDraftField(draft, 'form', originalForm)

  const [error,        setError]        = useState('')
  const [formErrors,   setFormErrors]   = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [members, setMembers] = useDraftField(draft, 'members', [])   // registered people to add to this organization, saved with the update
  const [showConfirm,  setShowConfirm]  = useState(false)

  const hasChanges = JSON.stringify(form) !== JSON.stringify(originalForm) || members.length > 0
  const datesChanged = form.date_organized !== originalForm.date_organized || form.date_registered !== originalForm.date_registered

  const typeLabel = type === 'farmers' ? "Farmers' Organization" : 'Fisherfolk Organization'

  const set = (field, value) => {
    setForm((f) => changeOrganization(f, field, value))
    setFormErrors((e) => { const n = { ...e }; delete n[field]; if (field === 'date_organized') delete n.date_registered; return n })
  }

  const validate = () => {
    const errs = organizationProblems(form, { datesChanged })
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs)
      setError('Please fill in all required fields.')
      return false
    }
    const memberProblem = memberLinesProblem(members, form.date_registered || organization.date_registered, localToday())
    if (memberProblem) {
      setError(memberProblem)
      return false
    }
    return true
  }

  const handleSubmitClick = (e) => {
    e.preventDefault()
    setError('')
    if (!validate()) return
    setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      await api.patch(`/organizations/${type}/${organization.id}/`, organizationBody(form, { isEdit: true, original: originalForm }))
      // New members are added after the update, one by one, through the same rules as the Add Member window of the organization's page.
      const registered = form.date_registered || organization.date_registered
      const failures = []
      for (const line of members) {
        try {
          await api.post(`/organizations/${type}/${organization.id}/members/`, memberPayload(line, type, registered, localToday()))
        } catch (err) {
          failures.push({ name: line.name, reason: memberRefusal(err.response?.data) })
        }
      }
      const outcome = memberOutcome(members.length, failures)
      if (outcome.kind !== 'none') showToast(outcome.text, outcome.kind === 'ok' ? 'success' : 'error')
      showToast(`${typeLabel} updated successfully.`, 'success')
      draft.clear()
      onSuccess()
    } catch (err) {
      const data = err.response?.data
      const first = data && typeof data === 'object' ? Object.values(data).flat()[0] : null
      setError(data?.detail || data?.name?.[0] || (typeof first === 'string' ? first : '') || 'Unable to update organization.')
      if (data?.date_registered?.[0]) setFormErrors(e => ({ ...e, date_registered: data.date_registered[0] }))
    } finally {
      setIsSubmitting(false)
    }
  }

  // Never show a stored value as a blank select: if the record already holds a code this type doesn't list, keep it visible.
  const listed = agencyOptionsFor(type)
  const agencyOptions = form.registration_agency && !listed.some((o) => o.value === form.registration_agency)
    ? [...listed, { value: form.registration_agency, label: agencyLabel(form.registration_agency) }] : listed

  return (
    <>
      <ModalShell
        title="Edit Organization"
        subtitle={organization.name}
        icon={Pencil}
        onClose={onClose}
        maxWidth="max-w-4xl"
        footer={
          <>
            <Button onClick={onClose} type="button" variant="outline">Cancel</Button>
            <Button isLoading={isSubmitting} disabled={isSubmitting || !hasChanges} type="submit" form="edit-organization-form">Update Organization</Button>
          </>
        }
      >
        <form id="edit-organization-form" className="space-y-3" onSubmit={handleSubmitClick}>
          <DraftBanner draft={draft} />
          <OrganizationFormSections form={form} onChange={set} errors={formErrors} agencyOptions={agencyOptions} datesChanged={datesChanged} idPrefix="edit_" />

          {/* Members: the same Add Members table as the registration form, for the people who are not members yet */}
          <FormSection title="Members">
            <div className="space-y-3 p-3">
            <p className="text-[12px] text-[#7A8E7A]">Optional. Add registered {type === 'farmers' ? 'farmers' : 'fisherfolk'} who are not members yet, with their positions. They are added when you press Update.</p>
            <MembersEditor type={type} lines={members} onChange={setMembers} registered={form.date_registered || organization.date_registered} organizationId={organization.id} />
            </div>
          </FormSection>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">
              {error}
            </p>
          )}

        </form>
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog variant="primary"
          title="Confirm Action"
          message={`Save changes to "${form.name}"?`}
          confirmLabel="Confirm"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}
