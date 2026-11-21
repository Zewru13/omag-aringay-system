import { useEffect, useState } from 'react'
import { ListPlus, Pencil, Plus, Ruler, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import CardHeader from '../../components/UI/CardHeader.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { SettingsFields, SettingsField } from '../../components/UI/SettingsFormTable.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { ASSISTANCE_UNITS } from './assistanceFieldHelpers.js'
import AssistanceOptionsTab from './AssistanceOptionsTab.jsx'
import { DOMAIN_CHOICES, DOMAIN_LABELS, addAssistanceBody, addAssistanceProblem, assistanceTypeRows, detailsText } from './assistanceTypeRows.js'
import { resetAssistanceChoices } from './useAssistanceChoices.js'
import { resetAssistanceTypeUnits } from './useAssistanceTypeUnits.js'

// Assistance Settings, second card: the types of assistance. Each type that has a quantity box shows the units its Unit box offers (Seeds: kg,
// sack, bag, bundle; not piece or set) and can have them changed; Training shows how many types of training it offers and opens the list of
// them; Add Assistance adds a type of its own (for crop assistance, fisheries assistance or both), which can be renamed, given other units or
// deleted. Cash Assistance (an amount in pesos) has no unit. Changing a type never changes assistance that was already recorded: a record
// keeps the name and the quantity it was saved with.
const COLUMNS = [
  { key: 'domain_label', label: 'ASSISTANCE' },
  { key: 'assistance_type', label: 'ASSISTANCE TYPE' },
  { key: 'details_cell', label: 'DETAILS' },
  { key: 'actions', label: 'ACTIONS' },
]

// The tick boxes of the units, shared by the three windows that choose them.
function UnitChecks({ chosen, onToggle }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {ASSISTANCE_UNITS.map((unit) => (
        <label key={unit} className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border border-[#E2E8E2] px-3 text-[13px] text-[#1A2B1A] hover:bg-[#F5F7F5]">
          <input type="checkbox" className="h-4 w-4 accent-[#1B4D2E]" checked={chosen.has(unit)} onChange={() => onToggle(unit)} />
          {unit}
        </label>
      ))}
    </div>
  )
}

const useToggleSet = (initial) => {
  const [chosen, setChosen] = useState(new Set(initial))
  const toggle = (unit) => setChosen((c) => { const next = new Set(c); if (next.has(unit)) next.delete(unit); else next.add(unit); return next })
  return [chosen, toggle]
}

function UnitsModal({ row, onClose, onSaved }) {
  const { showToast } = useToast()
  const [chosen, toggle] = useToggleSet(row.units)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (chosen.size === 0) { showToast('Choose at least one unit.', 'error'); return }
    setIsSubmitting(true)
    try {
      await api.put('/interventions/assistance-type-units/', { domain: row.domain, assistance_type: row.assistance_type, units: [...chosen] })
      showToast('Units updated.', 'success')
      onSaved(); onClose()
    } catch (err) {
      showToast(err?.response?.data?.units?.[0] || 'Failed to save the units.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Applicable Units"
      subtitle={`${DOMAIN_LABELS[row.domain]} assistance: ${row.assistance_type}`}
      icon={Ruler}
      onClose={onClose}
      maxWidth="max-w-sm"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="assistance-type-units-form" isLoading={isSubmitting} disabled={isSubmitting}>Save Units</Button>
        </>
      )}
    >
      <form id="assistance-type-units-form" onSubmit={handleSubmit} className="space-y-3">
        <SettingsFields title="Applicable Units" note={<p>The Unit box of the distribution form offers only the units ticked here.</p>}>
          <SettingsField label="Units">
            <UnitChecks chosen={chosen} onToggle={toggle} />
          </SettingsField>
        </SettingsFields>
      </form>
    </ModalShell>
  )
}

// Add Assistance: the name of a new type, what it applies to and the units of its quantity box.
function AddAssistanceModal({ onClose, onSaved }) {
  const { showToast } = useToast()
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [chosen, toggle] = useToggleSet(ASSISTANCE_UNITS)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const form = { name, domain, units: [...chosen] }
    const problem = addAssistanceProblem(form)
    if (problem) { showToast(problem, 'error'); return }
    setIsSubmitting(true)
    try {
      await api.post('/interventions/assistance-types/', addAssistanceBody(form))
      showToast('Assistance added.', 'success')
      onSaved(); onClose()
    } catch (err) {
      const data = err?.response?.data
      showToast(data?.name?.[0] || data?.non_field_errors?.[0] || data?.domains?.[0] || data?.units?.[0] || 'Failed to add the assistance.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Add Assistance"
      subtitle="A new type of assistance for the assistance forms."
      icon={ListPlus}
      onClose={onClose}
      maxWidth="max-w-xl"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="add-assistance-form" isLoading={isSubmitting} disabled={isSubmitting}>Add Assistance</Button>
        </>
      )}
    >
      <form id="add-assistance-form" onSubmit={handleSubmit} className="space-y-3">
        <SettingsFields title="Assistance" note={<p>It appears in the Assistance Type box of the forms it applies to. Training and Cash Assistance are already there.</p>}>
          <SettingsField label="Assistance *">
            <input type="text" className={baseInputClasses} aria-label="Assistance name" value={name} maxLength={30} placeholder="e.g. Pesticide"
              onChange={(e) => setName(e.target.value)} />
          </SettingsField>
          <SettingsField label="Applies To *">
            <select className={baseInputClasses} aria-label="Applies to" value={domain} onChange={(e) => setDomain(e.target.value)}>
              <option value="">Choose…</option>
              {DOMAIN_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </SettingsField>
        </SettingsFields>
        <SettingsFields title="Applicable Units" note={<p>The Unit box of the distribution form offers only the units ticked here.</p>}>
          <SettingsField label="Units">
            <UnitChecks chosen={chosen} onToggle={toggle} />
          </SettingsField>
        </SettingsFields>
      </form>
    </ModalShell>
  )
}

// Edit one added type: its name (past assistance keeps the old name) and its units.
function EditAssistanceModal({ row, onClose, onSaved }) {
  const { showToast } = useToast()
  const [name, setName] = useState(row.assistance_type)
  const [chosen, toggle] = useToggleSet(row.units)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { showToast('Enter the name of the assistance.', 'error'); return }
    if (chosen.size === 0) { showToast('Choose at least one unit.', 'error'); return }
    setIsSubmitting(true)
    try {
      const renamed = name.trim() !== row.assistance_type
      if (renamed) await api.patch(`/interventions/assistance-types/${row.customId}/`, { name })
      await api.put('/interventions/assistance-type-units/', { domain: row.domain, assistance_type: renamed ? name.trim().split(/\s+/).join(' ') : row.assistance_type, units: [...chosen] })
      showToast('Assistance updated.', 'success')
      onSaved(); onClose()
    } catch (err) {
      const data = err?.response?.data
      showToast(data?.name?.[0] || data?.units?.[0] || 'Failed to save the assistance.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Edit Assistance"
      subtitle={`${DOMAIN_LABELS[row.domain]} assistance: ${row.assistance_type}`}
      icon={Pencil}
      onClose={onClose}
      maxWidth="max-w-xl"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="edit-assistance-type-form" isLoading={isSubmitting} disabled={isSubmitting}>Save Changes</Button>
        </>
      )}
    >
      <form id="edit-assistance-type-form" onSubmit={handleSubmit} className="space-y-3">
        <SettingsFields title="Assistance" note={<p>Assistance already recorded keeps the name it was saved with.</p>}>
          <SettingsField label="Assistance *">
            <input type="text" className={baseInputClasses} aria-label="Assistance name" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
          </SettingsField>
        </SettingsFields>
        <SettingsFields title="Applicable Units">
          <SettingsField label="Units">
            <UnitChecks chosen={chosen} onToggle={toggle} />
          </SettingsField>
        </SettingsFields>
      </form>
    </ModalShell>
  )
}

// The Training form: its types of training (the list the Type of Training box of the forms offers).
function TrainingModal({ row, onClose }) {
  const crop = row.domain === 'crop'
  return (
    <ModalShell
      title="Training"
      subtitle={`${DOMAIN_LABELS[row.domain]} assistance: the types of training offered when Training is chosen`}
      icon={ListPlus}
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={<Button type="button" onClick={onClose}>Done</Button>}
    >
      <AssistanceOptionsTab domain={row.domain} kind="training" title="Types of Training" singular="Type of Training" example={crop ? 'Rice Production Training' : 'Tilapia Production'} />
    </ModalShell>
  )
}

export default function AssistanceTypeUnitsCard() {
  const { showToast } = useToast()
  const [parts, setParts] = useState({ units: {}, custom: [], training: {} })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState(null)   // { kind: 'units' | 'add' | 'edit' | 'training' | 'delete', row? }
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let alive = true
    const domains = ['crop', 'fisheries']
    Promise.all([
      Promise.all(domains.map((domain) => api.get('/interventions/assistance-type-units/', { params: { domain } }))),
      api.get('/interventions/assistance-types/'),
      Promise.all(domains.map((domain) => api.get('/interventions/options/', { params: { domain, kind: 'training' } }))),
    ])
      .then(([unitAnswers, customAnswer, trainingAnswers]) => {
        if (!alive) return
        const listOf = (r) => (Array.isArray(r.data) ? r.data : (r.data.results || []))
        setParts({
          units: Object.fromEntries(domains.map((d, i) => [d, unitAnswers[i].data])),
          custom: listOf(customAnswer),
          training: Object.fromEntries(domains.map((d, i) => [d, listOf(trainingAnswers[i]).length])),
        })
        setError('')
      })
      .catch(() => { if (alive) setError('Failed to load the assistance types.') })
      .finally(() => { if (alive) setIsLoading(false) })
    return () => { alive = false }
  }, [version])

  const refresh = () => { resetAssistanceTypeUnits(); resetAssistanceChoices(); setVersion((v) => v + 1) }
  const rows = assistanceTypeRows(parts)

  const data = rows.map((row) => {
    const actions = row.kind === 'training'
      ? [{ key: 'training', label: 'Edit Types of Training', icon: Pencil, onClick: () => setDialog({ kind: 'training', row }) }]
      : row.kind === 'custom'
        ? [
          { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setDialog({ kind: 'edit', row }) },
          { key: 'delete', label: 'Delete', icon: Trash2, onClick: () => setDialog({ kind: 'delete', row }), tone: 'rose' },
        ]
        : [{ key: 'units', label: 'Edit Units', icon: Pencil, onClick: () => setDialog({ kind: 'units', row }) }]
    return { ...row, domain_label: DOMAIN_LABELS[row.domain], details_cell: detailsText(row), actions: <RowActions actions={actions} /> }
  })

  return (
    <>
      {error && <ErrorMessage message={error} />}
      <div className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader
          title="Assistance Types"
          count={rows.length}
          action={<Button type="button" size="sm" icon={Plus} onClick={() => setDialog({ kind: 'add' })}>Add Assistance</Button>}
        />
        <DataTable bare columns={COLUMNS} data={data} isLoading={isLoading} />
        <p className="border-t border-[#F0F4F0] px-4 py-3 text-[12px] text-[#7A8E7A]">Cash Assistance (an amount in pesos) has no unit. Training has days and a type of training instead.</p>
      </div>
      {dialog?.kind === 'add' && <AddAssistanceModal onClose={() => setDialog(null)} onSaved={refresh} />}
      {dialog?.kind === 'units' && <UnitsModal row={dialog.row} onClose={() => setDialog(null)} onSaved={refresh} />}
      {dialog?.kind === 'edit' && <EditAssistanceModal row={dialog.row} onClose={() => setDialog(null)} onSaved={refresh} />}
      {dialog?.kind === 'training' && <TrainingModal row={dialog.row} onClose={() => { setDialog(null); refresh() }} />}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title="Delete Assistance"
          message={`Delete "${dialog.row.assistance_type}" from the ${DOMAIN_LABELS[dialog.row.domain].toLowerCase()} assistance list? Assistance already recorded with it keeps the name.`}
          confirmLabel="Delete"
          variant="danger"
          requireTypedConfirmation
          typedConfirmationText="DELETE"
          onConfirm={async () => {
            try {
              await api.delete(`/interventions/assistance-types/${dialog.row.customId}/`)
              showToast(`"${dialog.row.assistance_type}" deleted.`, 'success')
              setDialog(null); refresh()
            } catch {
              showToast('Failed to delete the assistance.', 'error')
              setDialog(null)
            }
          }}
          onCancel={() => setDialog(null)}
        />
      )}
    </>
  )
}
