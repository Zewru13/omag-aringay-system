import { Trash2 } from 'lucide-react'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'
import { assistanceMinDate, isCashType, isTrainingType } from './assistanceFieldHelpers.js'
import { SourceAgencyMultiSelect, TypeConditionalFields } from './sharedAssistanceFields.jsx'

// The fields of Edit Assistance Record as a table form, for crop and fisheries alike (`domain`). The window, its drafts, the saving and the
// deleting stay with each page; what is drawn is written once here.
//   form / set(key, value) / setAssistanceType(value)   the values and what changing them does
//   typeOptions                                         the assistance types offered
//   today / originalDate                                what the Date Given box may reach back to (assistanceMinDate)
//   years                                               crop only: the Year choices
export default function AssistanceEditSections({ domain, form, set, setAssistanceType, typeOptions, today, originalDate, years = [] }) {
  const crop = domain === 'crop'
  const cash = isCashType(form.assistance_type)
  const training = isTrainingType(form.assistance_type)
  const typeLabel = cash ? 'Amount (₱)' : 'Quantity'

  return (
    <>
      <FormSection title="Assistance Details">
        <FormRows label="Assistance details">
          <FormRow>
            <FormCell label="Assistance Type" required>
              <select className={baseInputClasses} aria-label="Assistance Type" value={form.assistance_type} onChange={(e) => setAssistanceType(e.target.value)}>
                {!crop && <option value="">Select Assistance Type</option>}
                {typeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </FormCell>
            <FormCell label="Date Given" required>
              <input type="date" className={baseInputClasses} aria-label="Date Given" value={form.date_received}
                min={assistanceMinDate({ today, original: originalDate })} onChange={(e) => set('date_received', e.target.value)} />
            </FormCell>
          </FormRow>
          {/* The quantity (or the cash amount) and, for the types that ask for one, what kind: Training asks for its days instead of a quantity. */}
          <FormRow>
            {!training && (
              <FormCell label={typeLabel} required={cash || !crop}>
                {crop ? (
                  cash
                    ? <input type="number" step="0.01" min="0.01" inputMode="decimal" className={baseInputClasses} aria-label={typeLabel} value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
                    : <input className={baseInputClasses} aria-label={typeLabel} value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
                ) : (
                  <DecimalInput decimals={2} className={baseInputClasses} aria-label={typeLabel} value={form.quantity} onChange={(v) => set('quantity', v)} />
                )}
              </FormCell>
            )}
            <TypeConditionalFields assistanceType={form.assistance_type} form={form} set={set} allowSeedFertilizer={crop} cell />
          </FormRow>
          {crop && (
            <FormRow>
              <FormCell label="Year" required>
                <select className={baseInputClasses} aria-label="Year" value={form.year} onChange={(e) => set('year', e.target.value)}>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </FormCell>
            </FormRow>
          )}
          <FormRow>
            <FormCell label="Source Agency" wide>
              <SourceAgencyMultiSelect value={form.source_agencies} onChange={(v) => set('source_agencies', v)}
                other={{ on: form.source_other_on, text: form.source_other, onToggle: (on) => set('source_other_on', on), onText: (t) => set('source_other', t) }} />
            </FormCell>
          </FormRow>
        </FormRows>
      </FormSection>

      <FormSection title="Notes">
        <FormRows label="Notes">
          <FormRow>
            <FormCell label="Description" wide>
              <textarea rows={2} className={`${baseInputClasses} h-auto py-2`} aria-label="Description" value={form.description} onChange={(e) => set('description', e.target.value)} />
            </FormCell>
          </FormRow>
          {!crop && (
            <FormRow>
              <FormCell label="Remarks" wide>
                <textarea rows={2} className={`${baseInputClasses} h-auto py-2`} aria-label="Remarks" value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
              </FormCell>
            </FormRow>
          )}
        </FormRows>
      </FormSection>
    </>
  )
}

// Admin only: permanently delete the record. The confirmation is the page's.
export function DangerZone({ isAdmin, description, onDeleteClick }) {
  if (!isAdmin) return null
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
      <p className="mb-1 text-[12px] font-semibold text-rose-700">Danger Zone</p>
      <p className="mb-2 text-[11px] text-rose-600">{description}</p>
      <button type="button" onClick={onDeleteClick}
        className="flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[12px] font-medium text-rose-600 transition-colors hover:bg-rose-100">
        <Trash2 size={13} /> Delete this record
      </button>
    </div>
  )
}
