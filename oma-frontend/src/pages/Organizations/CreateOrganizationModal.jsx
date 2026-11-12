import { useState } from 'react'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import useDraftState from '../../hooks/useDraftState.js'
import { Building2, Copy, KeyRound } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import { FormSection } from '../../components/UI/FormTable.jsx'
import OrganizationFormSections from './OrganizationFormSections.jsx'
import { EMPTY_ORGANIZATION, changeOrganization, organizationBody, organizationProblems } from './organizationForm.js'
import { localToday } from '../../utils/inputGuards.js'
import { agencyOptionsFor } from './agencyOptions.js'
import EquipmentLinesEditor from './EquipmentLinesEditor.jsx'
import { equipmentLinePayload, equipmentLinesProblem } from './registrationEquipment.js'
import MembersEditor from './MembersEditor.jsx'
import ImportFileAttach from './ImportFileAttach.jsx'
import { memberLinesProblem, memberOutcome, memberPayload, memberRefusal } from './registrationMembers.js'

export default function CreateOrganizationModal({ type: assocType = 'farmers', onClose, onSuccess }) {
  const { showToast } = useToast()
  // What is typed is a draft: it is still here when the window is opened again (see hooks/useDraftState.js). One per kind of organization.
  const [work, setWork, draft] = useDraftState(`create-organization:${assocType}`, () => ({ form: EMPTY_ORGANIZATION, equipment: [], members: [] }))
  const { form, equipment, members = [] } = work   // equipment: what the organization has; members: registered people to add to it. Both are saved with it
  const setForm = (next) => setWork((w) => ({ ...w, form: typeof next === 'function' ? next(w.form) : next }))
  const setEquipment = (next) => setWork((w) => ({ ...w, equipment: typeof next === 'function' ? next(w.equipment) : next }))
  const setMembers = (next) => setWork((w) => ({ ...w, members: typeof next === 'function' ? next(w.members || []) : next }))
  const [importFile,    setImportFile]    = useState(null)   // a members file to import once the organization is saved (a file cannot be kept in the draft)
  const [equipmentFile,  setEquipmentFile]  = useState(null)   // an equipment file to import once the organization is saved
  const [createdOrg,    setCreatedOrg]    = useState(null)
  const [error,        setError]        = useState('')
  const [formErrors,   setFormErrors]   = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [handover,     setHandover]     = useState(null)

  const typeLabel = assocType === 'farmers' ? "Farmers' Organization" : 'Fisherfolk Organization'

  const set = (field, value) => {
    setForm(changeOrganization(form, field, value))
    setFormErrors((e) => { const n = { ...e }; delete n[field]; if (field === 'date_organized') delete n.date_registered; return n })
  }

  const validate = () => {
    const errs = organizationProblems(form)
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs)
      setError('Please fill in all required fields.')
      return false
    }
    const equipmentProblem = equipmentLinesProblem(equipment, localToday())
    if (equipmentProblem) {
      setError(equipmentProblem)
      return false
    }
    const memberProblem = memberLinesProblem(members, form.date_registered, localToday())
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
      const { data: created } = await api.post(`/organizations/${assocType}/`, {
        ...organizationBody(form),
        new_equipment: equipment.map((line) => equipmentLinePayload(line, assocType)),
      })
      draft.clear()
      // The organization exists now: add its members one by one, through the same rules as the Add Member window of its page.
      const failures = []
      for (const line of members) {
        try {
          await api.post(`/organizations/${assocType}/${created.id}/members/`, memberPayload(line, assocType, form.date_registered, localToday()))
        } catch (err) {
          failures.push({ name: line.name, reason: memberRefusal(err.response?.data) })
        }
      }
      const outcome = memberOutcome(members.length, failures)
      if (outcome.kind !== 'none') showToast(outcome.text, outcome.kind === 'ok' ? 'success' : 'error')
      setCreatedOrg(created)
      const done = () => onSuccess({ importFile, equipmentFile, organization: created })
      const activation = created?.activation
      if (activation?.activated && activation.email_sent) {
        showToast(`Account activated. The login details were emailed to ${form.email_address}.`, 'success')
        done()
      } else if (activation?.activated) {
        // The email could not be sent: show the temporary password once so staff can hand it over.
        setHandover(activation)
      } else {
        showToast(`${typeLabel} created successfully.`, 'success')
        done()
      }
    } catch (err) {
      const data = err.response?.data
      const first = data && typeof data === 'object' ? Object.values(data).flat()[0] : null
      setError(data?.detail || data?.name?.[0] || (typeof first === 'string' ? first : '') || 'Unable to create organization.')
      if (data?.date_registered?.[0]) setFormErrors(e => ({ ...e, date_registered: data.date_registered[0] }))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (handover) {
    const expires = handover.expires_at ? new Date(handover.expires_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : ''
    const copyPassword = () => { try { navigator.clipboard.writeText(handover.default_password) } catch { /* the password is on screen */ } }
    return (
      <ModalShell
        title="Account activated: hand over the password"
        subtitle={`${typeLabel} created.`}
        icon={KeyRound}
        onClose={() => onSuccess({ importFile, equipmentFile, organization: createdOrg })}
        footer={<Button type="button" onClick={() => onSuccess({ importFile, equipmentFile, organization: createdOrg })}>Done</Button>}
      >
        <div className="space-y-3 text-[13px] text-[#4A5E4A]">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-800">
            The email could not be sent{handover.reason ? ` (${handover.reason.replace(/\.$/, '')})` : ''}. Give the organization this password
            yourself. It is shown only now.
          </p>
          <div>
            <span className="block text-[12px] text-[#7A8E7A]">Login</span>
            <span className="font-medium text-[#1B2B1B]">{handover.login}</span>
          </div>
          <div>
            <span className="block text-[12px] text-[#7A8E7A]">Temporary password</span>
            <span className="flex items-center gap-2">
              <code className="rounded bg-[#F1F6F1] px-2 py-1 text-[15px] font-semibold tracking-wide text-[#1B2B1B]">{handover.default_password}</code>
              <Button type="button" size="sm" variant="outline" icon={Copy} onClick={copyPassword}>Copy</Button>
            </span>
          </div>
          {expires && <p className="text-[12px] text-[#7A8E7A]">It must be changed at first login and stops working on {expires}.</p>}
        </div>
      </ModalShell>
    )
  }

  return (
    <>
      <ModalShell
        title="Add New Organization"
        subtitle={`Create a new ${assocType === 'farmers' ? "farmers' organization" : 'fisherfolk organization'} in Aringay.`}
        icon={Building2}
        onClose={onClose}
        maxWidth="max-w-4xl"
        footer={
          <>
            <Button onClick={onClose} type="button" variant="outline">Cancel</Button>
            <Button isLoading={isSubmitting} type="submit" form="create-organization-form">Add Organization</Button>
          </>
        }
      >
        <form id="create-organization-form" className="space-y-3" onSubmit={handleSubmitClick}>
          <DraftBanner draft={draft} />
          <OrganizationFormSections form={form} onChange={set} errors={formErrors} agencyOptions={agencyOptionsFor(assocType)} />

          {/* Equipment the organization has: saved with the organization */}
          <FormSection title="Equipment">
            <div className="space-y-3 p-3">
            <p className="text-[12px] text-[#7A8E7A]">Optional. The equipment the organization has now; it can also be added later from the organization's page.</p>
            <EquipmentLinesEditor type={assocType} lines={equipment} onChange={setEquipment} />
            <div className="mt-3 rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-3">
              <p className="mb-1 text-[12px] font-semibold text-[#1A2B1A]">Import equipment from a file</p>
              <p className="mb-2 text-[12px] text-[#7A8E7A]">Attach the equipment file. Once the organization is saved, the Import Equipment window opens with the file so you can check it before it is imported.</p>
              <ImportFileAttach chooseLabel="Import equipment" templateUrl={`/organizations/${assocType}/equipment/import/template/`}
                templateFilename={`${assocType}_organization_equipment_import_template.xlsx`} file={equipmentFile} onFile={setEquipmentFile} />
            </div>
            </div>
          </FormSection>

          {/* Members: registered farmers / fisherfolk added once the organization is saved, or a members file imported */}
          <FormSection title="Members">
            <div className="space-y-3 p-3">
            <p className="text-[12px] text-[#7A8E7A]">Optional. Pick registered {assocType === 'farmers' ? 'farmers' : 'fisherfolk'} or import a members file. They are added when the organization is saved; more can be added later from its page.</p>
            <MembersEditor type={assocType} lines={members} onChange={setMembers} registered={form.date_registered}
              importFile={importFile} onImportFile={setImportFile} />
            </div>
          </FormSection>

          <p className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-[12px] text-[#7A8E7A]">
            Officers can be assigned after this organization is created and has members —
            from the organization's detail page.
          </p>

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
          message={`Add new ${typeLabel} "${form.name}"?`}
          confirmLabel="Confirm"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}
