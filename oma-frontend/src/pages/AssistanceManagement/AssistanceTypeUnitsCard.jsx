import { useEffect, useState } from 'react'
import { Pencil, Ruler } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import CardHeader from '../../components/UI/CardHeader.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { SettingsFields, SettingsField } from '../../components/UI/SettingsFormTable.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { ASSISTANCE_UNITS } from './assistanceFieldHelpers.js'
import { resetAssistanceTypeUnits } from './useAssistanceTypeUnits.js'

// Assistance Settings, second card: for every type of assistance that has a quantity box, the units its Unit box offers (Seeds: kg, sack,
// bag, bundle; not piece or set). Cash Assistance (pesos) and Training (days) have no unit. Changing a type never changes assistance that
// was already recorded: a record keeps the quantity it was saved with.
const COLUMNS = [
  { key: 'domain_label', label: 'ASSISTANCE' },
  { key: 'assistance_type', label: 'ASSISTANCE TYPE' },
  { key: 'units_cell', label: 'APPLICABLE UNITS' },
  { key: 'actions', label: 'ACTIONS' },
]
const DOMAIN_LABELS = { crop: 'Crop', fisheries: 'Fisheries' }

function UnitsModal({ row, onClose, onSaved }) {
  const { showToast } = useToast()
  const [chosen, setChosen] = useState(new Set(row.units))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const toggle = (unit) => setChosen((c) => { const next = new Set(c); if (next.has(unit)) next.delete(unit); else next.add(unit); return next })

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
            <div className="grid grid-cols-2 gap-2">
          {ASSISTANCE_UNITS.map((unit) => (
            <label key={unit} className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border border-[#E2E8E2] px-3 text-[13px] text-[#1A2B1A] hover:bg-[#F5F7F5]">
              <input type="checkbox" className="h-4 w-4 accent-[#1B4D2E]" checked={chosen.has(unit)} onChange={() => toggle(unit)} />
              {unit}
            </label>
          ))}
        </div>
          </SettingsField>
        </SettingsFields>
      </form>
    </ModalShell>
  )
}

export default function AssistanceTypeUnitsCard() {
  const [rows, setRows] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.all(['crop', 'fisheries'].map((domain) => api.get('/interventions/assistance-type-units/', { params: { domain } })))
      .then((answers) => { if (alive) { setRows(answers.flatMap((r) => r.data)); setError('') } })
      .catch(() => { if (alive) setError('Failed to load the units.') })
      .finally(() => { if (alive) setIsLoading(false) })
    return () => { alive = false }
  }, [version])

  const data = rows.map((row) => ({
    ...row,
    id: `${row.domain}-${row.assistance_type}`,
    domain_label: DOMAIN_LABELS[row.domain],
    units_cell: row.units.join(', '),
    actions: <RowActions actions={[{ key: 'edit', label: 'Edit Units', icon: Pencil, onClick: () => setEditing(row) }]} />,
  }))

  return (
    <>
      {error && <ErrorMessage message={error} />}
      <div className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader title="Units by Assistance Type" count={rows.length} />
        <DataTable bare columns={COLUMNS} data={data} isLoading={isLoading} />
        <p className="border-t border-[#F0F4F0] px-4 py-3 text-[12px] text-[#7A8E7A]">Cash Assistance (an amount in pesos) and Training (a number of days) have no unit.</p>
      </div>
      {editing && <UnitsModal row={editing} onClose={() => setEditing(null)} onSaved={() => { resetAssistanceTypeUnits(); setVersion((v) => v + 1) }} />}
    </>
  )
}
