import { useEffect, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import { FormCell } from '../../components/UI/FormTable.jsx'
import { agencyChipSummary, agencyChoices, choicesWith, isTrainingType, typeFieldFor } from './assistanceFieldHelpers.js'
import useAssistanceAgencies from './useAssistanceAgencies.js'
import useAssistanceChoices from './useAssistanceChoices.js'

// Single source of truth for the Source Agency + type-conditional field
// components, built first for DistributeAssistanceModal.jsx and reused as-is
// (not reimplemented) by every other form that logs a BeneficiaryRecord /
// FisherfolkBeneficiaryRecord: CropAssistancePage.jsx's AddAssistanceModal /
// EditAssistanceModal, FisheriesAssistancePage.jsx's EditAssistanceModal, and
// LogGovernmentAssistanceModal.jsx. Constants/pure helpers used alongside
// these live in assistanceFieldHelpers.js (kept out of this file so it can
// export components only — see react-refresh/only-export-components).

// Source Agency: one multi-select dropdown. The choices are the active agencies of the managed list (Assistance Settings);
// the chosen ones show as chips, and an agency already on a record (hidden since, or typed long ago) stays selectable. A form that passes
// `other` ({ on, text, onToggle, onText }) also offers "Others": ticking it opens a box to type an agency that is not in the list.
export function SourceAgencyMultiSelect({ value, onChange, other = null }) {
  const agencies = useAssistanceAgencies()
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const choices = agencyChoices(agencies, value)
  const summary = agencyChipSummary(value)

  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const toggle = (agency) => onChange(value.includes(agency) ? value.filter((a) => a !== agency) : [...value, agency])
  const nothing = value.length === 0 && !other?.on

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={value.length > 3 ? value.join(', ') : undefined}
        className={`${baseInputClasses} flex min-h-[40px] w-full items-center justify-between gap-2 text-left`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {nothing ? (
            <span className="text-[#9AAB9A]">Select source agencies…</span>
          ) : summary.shown.map((a) => (
            <span key={a} className="inline-flex min-w-0 shrink items-center gap-1 rounded-full bg-[#EBF5EE] px-2 py-0.5 text-[12px] font-medium text-[#1B4D2E]">
              <span className="truncate">{a}</span>
              <span
                role="button"
                tabIndex={0}
                aria-label={`Remove ${a}`}
                onClick={(e) => { e.stopPropagation(); toggle(a) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggle(a) } }}
                className="hover:text-rose-600"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </span>
            </span>
          ))}
          {summary.more > 0 && <span className="shrink-0 whitespace-nowrap text-[12px] font-medium text-[#4A5E4A]">and {summary.more} more</span>}
          {other?.on && <span className="inline-flex shrink-0 items-center rounded-full bg-[#EBF5EE] px-2 py-0.5 text-[12px] font-medium text-[#1B4D2E]">Others</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#7A8E7A] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <ul role="listbox" aria-multiselectable="true" className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-[#E2E8E2] bg-white py-1 shadow-lg">
          {choices.length === 0 && <li className="px-3 py-2 text-[12.5px] italic text-[#7A8E7A]">No agencies in the list yet. Add them in Assistance Settings.</li>}
          {choices.map((opt) => {
            const checked = value.includes(opt)
            return (
              <li key={opt} role="option" aria-selected={checked}>
                <label className="flex min-h-[40px] cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] text-[#1A2B1A] hover:bg-[#F5F7F5]">
                  <input type="checkbox" className="h-4 w-4 accent-[#1B4D2E]" checked={checked} onChange={() => toggle(opt)} />
                  {opt}
                </label>
              </li>
            )
          })}
          {other && (
            <li role="option" aria-selected={other.on}>
              <label className="flex min-h-[40px] cursor-pointer items-center gap-2 border-t border-[#F0F4F0] px-3 py-1.5 text-[13px] text-[#1A2B1A] hover:bg-[#F5F7F5]">
                <input type="checkbox" className="h-4 w-4 accent-[#1B4D2E]" checked={other.on} onChange={() => other.onToggle(!other.on)} />
                Others
              </label>
            </li>
          )}
        </ul>
      )}
      {other?.on && (
        <input type="text" className={`${baseInputClasses} mt-2`} value={other.text} maxLength={150} placeholder="Type the source agency"
          aria-label="Other source agency" onChange={(e) => other.onText(e.target.value)} />
      )}
    </div>
  )
}

// A dropdown fed by one of the managed lists. The record's own value stays selectable even when it is no longer in the list; an empty
// list says where an Admin adds to it.
// `cell` draws it as a cell of a table form (a FormCell: label + box) instead of a stand-alone FormField.
export function ListSelect({ label, value, onChange, options, where, pillLabel = false, required = false, cell = false }) {
  const names = choicesWith(options, value)
  const body = (
    <>
      <select className={baseInputClasses} aria-label={label} value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{`Select ${label.toLowerCase().replace(/^type of /, '')}…`}</option>
        {names.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      {names.length === 0 && options && <p className="mt-1 text-[11px] text-[#7A8E7A]">The list is empty. An Admin adds to it in {where}.</p>}
    </>
  )
  if (cell) return <FormCell label={label} required={required}>{body}</FormCell>
  return <FormField label={label} required={required} pillLabel={pillLabel}>{body}</FormField>
}

// Renders exactly the field(s) matching the current assistance_type: Duration of Training for Training, and the one dropdown the type
// asks for (see TYPE_FIELDS: the crops for Seeds, the fertilizer inputs, the equipment types; for fisheries the feed types, fishing gear,
// species and equipment types), filled from the lists managed in Crop Settings / Fisheries Settings.
export function TypeConditionalFields({ assistanceType, form, set, allowSeedFertilizer = true, pillLabel = false, cell = false }) {
  const domain = allowSeedFertilizer ? 'crop' : 'fisheries'
  const choices = useAssistanceChoices(domain)
  const field = typeFieldFor(domain, assistanceType)
  return (
    <>
      {isTrainingType(assistanceType) && (() => {
        const input = (
          <input type="number" min="1" max="3" step="1" className={baseInputClasses} aria-label="Duration of Training (days)" value={form.training_duration_days}
            onChange={(e) => set('training_duration_days', e.target.value)} placeholder="1–3 days" />
        )
        return cell
          ? <FormCell label="Duration of Training (days)" required>{input}</FormCell>
          : <FormField label="Duration of Training (days)" required pillLabel={pillLabel}>{input}</FormField>
      })()}
      {field && (
        <ListSelect label={field.label} value={form[field.key]} onChange={(v) => set(field.key, v)} options={choices?.[field.choices]} where={field.where} pillLabel={pillLabel} cell={cell} />
      )}
    </>
  )
}
