import { useEffect, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import {
  agencyChoices, isTrainingType, isEquipmentType, isSeedsType, isFertilizerType,
} from './assistanceFieldHelpers.js'
import useAssistanceAgencies from './useAssistanceAgencies.js'

// Single source of truth for the Source Agency + type-conditional field
// components, built first for DistributeAssistanceModal.jsx and reused as-is
// (not reimplemented) by every other form that logs a BeneficiaryRecord /
// FisherfolkBeneficiaryRecord: CropAssistancePage.jsx's AddAssistanceModal /
// EditAssistanceModal, FisheriesAssistancePage.jsx's EditAssistanceModal, and
// LogGovernmentAssistanceModal.jsx. Constants/pure helpers used alongside
// these live in assistanceFieldHelpers.js (kept out of this file so it can
// export components only — see react-refresh/only-export-components).

// Source Agency: one multi-select dropdown. The choices are the active agencies of the managed list (Assistance Settings);
// the chosen ones show as chips, and an agency already on a record (hidden since, or typed long ago) stays selectable.
export function SourceAgencyMultiSelect({ value, onChange }) {
  const agencies = useAssistanceAgencies()
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const choices = agencyChoices(agencies, value)

  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const toggle = (agency) => onChange(value.includes(agency) ? value.filter((a) => a !== agency) : [...value, agency])

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${baseInputClasses} flex min-h-[40px] w-full items-center justify-between gap-2 text-left`}
      >
        <span className="flex min-w-0 flex-wrap gap-1.5">
          {value.length === 0 ? (
            <span className="text-[#9AAB9A]">Select source agencies…</span>
          ) : value.map((a) => (
            <span key={a} className="inline-flex max-w-full items-center gap-1 rounded-full bg-[#EBF5EE] px-2 py-0.5 text-[12px] font-medium text-[#1B4D2E]">
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
        </ul>
      )}
    </div>
  )
}

// Renders exactly the field(s) matching the current assistance_type —
// Duration of Training for Training, Type of Equipment for Equipment, and
// (crop domain only) Type of Seed / Type of Fertilizer for Seeds/Fertilizer.
export function TypeConditionalFields({ assistanceType, form, set, allowSeedFertilizer = true, pillLabel = false }) {
  const training = isTrainingType(assistanceType)
  const equipment = isEquipmentType(assistanceType)
  const seeds = allowSeedFertilizer && isSeedsType(assistanceType)
  const fertilizer = allowSeedFertilizer && isFertilizerType(assistanceType)
  return (
    <>
      {training && (
        <FormField label="Duration of Training (days)" required pillLabel={pillLabel}>
          <input type="number" min="1" max="3" step="1" className={baseInputClasses} value={form.training_duration_days}
            onChange={(e) => set('training_duration_days', e.target.value)} placeholder="1–3 days" />
        </FormField>
      )}
      {equipment && (
        <FormField label="Type of Equipment" pillLabel={pillLabel}>
          <input className={baseInputClasses} value={form.equipment_type} onChange={(e) => set('equipment_type', e.target.value)} placeholder="e.g. Hand Tractor" />
        </FormField>
      )}
      {seeds && (
        <FormField label="Type of Seed" pillLabel={pillLabel}>
          <input className={baseInputClasses} value={form.seed_type} onChange={(e) => set('seed_type', e.target.value)} placeholder="e.g. Hybrid Corn Seeds" />
        </FormField>
      )}
      {fertilizer && (
        <FormField label="Type of Fertilizer" pillLabel={pillLabel}>
          <input className={baseInputClasses} value={form.fertilizer_type} onChange={(e) => set('fertilizer_type', e.target.value)} placeholder="e.g. Urea (46-0-0)" />
        </FormField>
      )}
    </>
  )
}
