import { useState } from 'react'
import { X } from 'lucide-react'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import {
  SOURCE_AGENCY_OPTIONS, isTrainingType, isEquipmentType, isSeedsType, isFertilizerType,
} from './assistanceFieldHelpers.js'

// Single source of truth for the Source Agency + type-conditional field
// components, built first for DistributeAssistanceModal.jsx and reused as-is
// (not reimplemented) by every other form that logs a BeneficiaryRecord /
// FisherfolkBeneficiaryRecord: CropAssistancePage.jsx's AddAssistanceModal /
// EditAssistanceModal, FisheriesAssistancePage.jsx's EditAssistanceModal, and
// LogGovernmentAssistanceModal.jsx. Constants/pure helpers used alongside
// these live in assistanceFieldHelpers.js (kept out of this file so it can
// export components only — see react-refresh/only-export-components).

// Source Agency, single -> multiple: checkboxes for the known agencies plus
// a free-text add for anything else, all flattened into one source_agencies
// array — no separate "Other" sentinel value the way ComboboxWithOther uses,
// since more than one of either kind can be selected at once.
export function SourceAgencyMultiSelect({ value, onChange }) {
  const [customInput, setCustomInput] = useState('')

  const toggle = (agency) => {
    onChange(value.includes(agency) ? value.filter((a) => a !== agency) : [...value, agency])
  }

  const addCustom = () => {
    const v = customInput.trim()
    if (!v || value.includes(v)) return
    onChange([...value, v])
    setCustomInput('')
  }

  const removeCustom = (agency) => onChange(value.filter((a) => a !== agency))

  const customEntries = value.filter((a) => !SOURCE_AGENCY_OPTIONS.includes(a))

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {SOURCE_AGENCY_OPTIONS.map((opt) => (
          <label
            key={opt}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors ${
              value.includes(opt)
                ? 'border-[#1B4D2E] bg-[#EBF5EE] text-[#1B4D2E] font-medium'
                : 'border-[#E2E8E2] text-[#4A5A4C] hover:bg-[#F5F7F5]'
            }`}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={value.includes(opt)}
              onChange={() => toggle(opt)}
            />
            {opt}
          </label>
        ))}
      </div>
      {customEntries.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {customEntries.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-full bg-[#EBF5EE] px-2 py-0.5 text-[12px] font-medium text-[#1B4D2E]">
              {c}
              <button type="button" onClick={() => removeCustom(c)} className="ml-0.5 hover:text-rose-600">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Add another source agency…"
          className={`${baseInputClasses} flex-1`}
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') { e.preventDefault(); addCustom() } }}
        />
        <button
          type="button"
          onClick={addCustom}
          className="rounded-lg bg-[#EBF5EE] px-3 py-1.5 text-[12px] font-medium text-[#1B4D2E] transition-colors hover:bg-[#D4EDDA]"
        >
          Add
        </button>
      </div>
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
