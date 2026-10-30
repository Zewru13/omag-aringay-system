import { useEffect, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import Button from './Button.jsx'
import { baseInputClasses } from './FormField.jsx'

// The "Add row" of the admin settings tables (Seed Sources first, now every settings table): the Add row button sits under the table;
// pressing it adds one more row at the end of the table with its boxes empty, and Save / Cancel in that row's last cell. Enter saves,
// Escape cancels. Editing an existing row stays in its own window. A page keeps one draft with useAddRow, gives DataTable the draft row
// (made of DraftInput / DraftSelect cells and DraftActions) after its own rows, and puts AddRowFooter under the table.

// The draft of the new row: null while there is no new row, else the typed values. `blank` is what a new row starts as.
export function useAddRow(blank = {}) {
  const [draft, setDraft] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const isOpen = draft !== null

  // The table also draws a phone layout, so the new row's boxes exist twice: focus the first one that is on screen.
  useEffect(() => {
    if (!isOpen) return
    const visible = [...document.querySelectorAll('[data-draft]')].find((el) => el.offsetParent !== null)
    if (visible) visible.focus()
  }, [isOpen])

  return {
    draft,
    isOpen,
    isSaving,
    setIsSaving,
    open: () => setDraft({ ...blank }),
    close: () => setDraft(null),
    change: (patch) => setDraft((d) => ({ ...d, ...patch })),
  }
}

// A text box (or number box) of the new row. Enter saves the row and Escape cancels it.
export function DraftInput({ onSave, onCancel, className = '', ...props }) {
  return (
    <input
      {...props}
      data-draft
      className={`${baseInputClasses} ${className}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); onSave?.() }
        if (e.key === 'Escape') onCancel?.()
      }}
    />
  )
}

// A dropdown of the new row.
export function DraftSelect({ children, className = '', ...props }) {
  return <select {...props} data-draft className={`${baseInputClasses} ${className}`}>{children}</select>
}

// The last cell of the new row.
export function DraftActions({ onSave, onCancel, isSaving }) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" onClick={onSave} isLoading={isSaving} disabled={isSaving}><Check size={14} aria-hidden="true" /> Save</Button>
      <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}><X size={14} aria-hidden="true" /> Cancel</Button>
    </div>
  )
}

// The Add row button under the table; one new row at a time.
export function AddRowFooter({ onClick, disabled = false, label = 'Add row' }) {
  return (
    <div className="border-t border-[#E2E8E2] px-4 py-3">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#1B4D2E]/30 bg-[#EBF5EE]/50 px-3.5 text-[13px] font-semibold text-[#1B4D2E] hover:bg-[#EBF5EE] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus size={14} aria-hidden="true" /> {label}
      </button>
    </div>
  )
}
