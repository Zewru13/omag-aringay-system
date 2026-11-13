import { useState } from 'react'
import { Tractor, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import { AddRowFooter } from '../../components/UI/InlineAddRow.jsx'
import ViewSection from '../../components/UI/ViewSection.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import MachineryEditor from './MachineryEditor.jsx'
import { machineryLabel, machineryPayload, machineryProblem, makeMachineryRow } from './parcelRows.js'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'

// The farmer profile's machinery: what the farmer has or uses, whoever owns it. Staff add lines in a window (one or many at once) and
// remove a line from the table. `machinery` is the profile's own list; `onChanged` reads the profile again.
function AddMachineryModal({ farmerId, onClose, onSaved }) {
  const { showToast } = useToast()
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`add-machinery:${farmerId}`)
  const [lines, setLines] = useDraftField(draft, 'lines', [makeMachineryRow(1)])
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const save = async () => {
    if (lines.length === 0) { setError('Add at least one machinery line.'); return }
    for (let i = 0; i < lines.length; i += 1) {
      const problem = machineryProblem(lines[i])
      if (problem) { setError(`Machinery ${i + 1}: ${problem}.`); return }
    }
    setIsSaving(true)
    setError('')
    let saved = 0
    try {
      for (const line of lines) {
        await api.post(`/farmers/${farmerId}/machinery/`, machineryPayload(line))
        saved += 1
      }
      draft.clear()
      showToast(`${saved} machinery line${saved === 1 ? '' : 's'} added.`, 'success')
      onSaved()
      onClose()
    } catch (err) {
      const data = err?.response?.data
      const first = data && typeof data === 'object' ? Object.values(data)[0] : null
      setError(`${saved ? `${saved} saved, but line ${saved + 1} was refused: ` : ''}${(Array.isArray(first) ? first[0] : first) || data?.detail || 'Unable to save the machinery.'}`)
      if (saved) { onSaved(); setLines((current) => current.slice(saved)) }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <ModalShell
      title="Add Machinery"
      subtitle="Machinery the farmer has or uses"
      icon={Tractor}
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" isLoading={isSaving} disabled={lines.length === 0} onClick={save}>Save Machinery</Button>
        </>
      )}
    >
      <div className="space-y-3">
        <DraftBanner draft={draft} />
        <MachineryEditor machinery={lines} onChange={setLines} />
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">{error}</p>}
      </div>
    </ModalShell>
  )
}

const CELL = 'px-3 py-2 text-[#1A2B1A] max-md:block max-md:px-0 max-md:py-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]'

export default function FarmerMachineryCard({ farmerId, machinery, canEdit, onChanged }) {
  const { showToast } = useToast()
  const [isAdding, setIsAdding] = useState(false)
  const [removing, setRemoving] = useState(null)

  const remove = async () => {
    try {
      await api.delete(`/farmers/farmer-machinery/${removing.id}/`)
      showToast('Machinery removed.', 'success')
      onChanged()
    } catch {
      showToast('Failed to remove the machinery.', 'error')
    } finally {
      setRemoving(null)
    }
  }

  return (
    <>
      <ViewSection icon={Tractor} title="Agricultural Machinery" count={machinery.length} noun="machinery line" maxWidth="max-w-3xl"
        subtitle="What the farmer has or uses, whoever owns it.">
      {machinery.length === 0 ? (
        <p className="rounded-lg border border-[#E2E8E2] bg-[#EBF5EE]/30 px-4 py-3 text-[13px] text-[#4A5E4A]">No machinery recorded.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[#E2E8E2]">
          <table className="min-w-full text-sm max-md:block">
            <thead className="bg-[#1B4D2E] text-xs font-semibold uppercase tracking-wide text-white max-md:hidden">
              <tr>
                <th className="px-3 py-2 text-left">Machinery</th>
                <th className="px-3 py-2 text-left">Qty</th>
                <th className="px-3 py-2 text-left">Whose is it</th>
                {canEdit && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F0] max-md:block">
              {machinery.map((m, i) => (
                <tr key={m.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-[#F9FAF9]'} max-md:block max-md:px-3 max-md:py-2`}>
                  <td data-label="Machinery" className={CELL}>{machineryLabel(m)}</td>
                  <td data-label="Qty" className={CELL}>{m.quantity}</td>
                  <td data-label="Whose is it" className={CELL}>{m.ownership}</td>
                  {canEdit && (
                    <td className="px-3 py-2 text-right max-md:block max-md:px-0 max-md:py-1">
                      <button type="button" onClick={() => setRemoving(m)} title="Remove machinery"
                        className="inline-flex items-center gap-1.5 rounded-md p-1.5 text-rose-500 hover:bg-rose-50 max-md:min-h-[40px] max-md:px-3 max-md:text-[13px] max-md:font-medium">
                        <Trash2 size={13} /> <span className="md:hidden">Remove</span>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        {canEdit && <AddRowFooter label="Add machinery" onClick={() => setIsAdding(true)} />}
      </ViewSection>
      {isAdding && <AddMachineryModal farmerId={farmerId} onClose={() => setIsAdding(false)} onSaved={onChanged} />}
      {removing && (
        <ConfirmDialog
          title="Remove Machinery"
          message={`Remove ${machineryLabel(removing)} (${removing.quantity}) from this farmer's machinery?`}
          confirmLabel="Remove"
          variant="danger"
          onConfirm={remove}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}
