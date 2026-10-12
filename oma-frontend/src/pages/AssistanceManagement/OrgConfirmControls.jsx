import { UserCheck } from 'lucide-react'
import Button from '../../components/UI/Button.jsx'
import { confirmButtonLabel, isSelectable, selectableIds, selectionSummary } from './orgConfirmSelection.js'

// The picking controls of an organization's "Confirm for Members" table: the checkbox in the header (select all /
// unselect all), the checkbox in each row, and the bar above the table that sends the pick.

const BOX = 'h-4 w-4 cursor-pointer rounded border-slate-300 accent-[#1B4D2E] focus:ring-[#1B4D2E]/30'

export function SelectHeader({ selection, records }) {
  return (
    <input
      type="checkbox"
      className={BOX}
      aria-label="Select all members"
      checked={selection.allPicked}
      disabled={selectableIds(records).length === 0}
      onChange={selection.toggleEvery}
    />
  )
}

export function SelectCell({ record, name, selection }) {
  if (!isSelectable(record)) return <span className="text-slate-400" title="Waiting for OMAg review">—</span>
  return (
    <input
      type="checkbox"
      className={BOX}
      aria-label={`Select ${name}`}
      checked={selection.selected.has(record.id)}
      onChange={() => selection.toggle(record.id)}
    />
  )
}

export function ConfirmActionBar({ selection, records, onConfirm }) {
  const pickable = selectableIds(records).length
  if (pickable === 0) return null
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid="confirm-action-bar">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[#4A5E4A]">
        <span className="font-medium text-[#1A2B1A]" aria-live="polite">{selectionSummary(selection.count, pickable)}</span>
        <button type="button" onClick={selection.toggleEvery} className="font-medium text-[#1B4D2E] underline-offset-2 hover:underline">
          {selection.allPicked ? 'Unselect all' : 'Select all'}
        </button>
      </div>
      <Button type="button" icon={UserCheck} disabled={selection.count === 0} onClick={onConfirm} className="w-full sm:w-auto">
        {confirmButtonLabel(selection.count)}
      </Button>
    </div>
  )
}
