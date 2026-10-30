import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import SectionEyebrow from '../../components/UI/SectionEyebrow.jsx'
import { ASSISTANCE_UNITS, assistanceMinDate, choicesWith, isCashType, isTrainingType } from './assistanceFieldHelpers.js'
import { withAssistanceType } from './distributeFlow.js'
import { SourceAgencyMultiSelect, TypeConditionalFields } from './sharedAssistanceFields.jsx'

// The assistance details of the distribution windows, the same fields whoever the recipients are: type, source agencies, the quantity (or
// the cash amount, or the training days), the date and a description. `form` is made by makeAssistanceForm (distributeFlow.js).
export default function AssistanceDetailsFields({ domain, form, setForm, today }) {
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const cash = isCashType(form.assistance_type)
  const training = isTrainingType(form.assistance_type)

  return (
    <div className="space-y-4 rounded-2xl border border-[#E2E8E2] bg-white p-4 sm:p-5">
      <SectionEyebrow className="mb-0">Assistance Details</SectionEyebrow>
      <FormField label="Assistance Type" required pillLabel>
        <ComboboxWithOther
          options={domain.assistanceTypeOptions.filter((o) => o !== 'Other')}
          value={form.assistance_type}
          otherValue={form.assistance_type_other}
          onChange={(v) => setForm((f) => withAssistanceType(f, v))}
          onOtherChange={(v) => set('assistance_type_other', v)}
          placeholder="Select Assistance Type"
        />
      </FormField>

      <FormField label="Source Agency" pillLabel>
        <SourceAgencyMultiSelect value={form.source_agencies} onChange={(v) => set('source_agencies', v)} />
      </FormField>

      {/* Exactly one quantity-shaped field (Amount for Cash, Duration for Training, Quantity for everything else), plus for Equipment,
          Seeds and Fertilizer a second one naming the kind. */}
      <div className="grid gap-4 sm:grid-cols-2">
        {cash && (
          <FormField label="Amount per Recipient (₱)" required pillLabel>
            <input type="number" step="0.01" min="0.01" className={baseInputClasses} value={form.cash_amount}
              onChange={(e) => set('cash_amount', e.target.value)} placeholder="e.g. 500.00" />
          </FormField>
        )}
        {!cash && !training && (
          <FormField label="Quantity per Recipient" pillLabel>
            {/* Both boxes keep one fixed width, so the field never stretches or shrinks with the window. */}
            <div className="flex items-center gap-2">
              <input type="number" min="0" step="any" className={`${baseInputClasses} w-28 shrink-0`} value={form.quantity_amount} placeholder="e.g. 2"
                onChange={(e) => set('quantity_amount', e.target.value)} aria-label="Quantity per recipient" />
              <select className={`${baseInputClasses} w-36 shrink-0`} value={form.quantity_unit} onChange={(e) => set('quantity_unit', e.target.value)} aria-label="Unit">
                <option value="">Unit…</option>
                {choicesWith(ASSISTANCE_UNITS, form.quantity_unit).map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </FormField>
        )}
        <TypeConditionalFields assistanceType={form.assistance_type} form={form} set={set} allowSeedFertilizer={domain.allowSeedFertilizer} pillLabel />
      </div>

      <FormField label="Distribution Date" required pillLabel>
        <input type="date" className={`${baseInputClasses} sm:max-w-xs`} value={form.date_given} min={assistanceMinDate({ today })}
          onChange={(e) => set('date_given', e.target.value)} />
        <p className="mt-1 text-[11px] text-[#7A8E7A]">Today or a later date. A future date schedules the distribution: it stays Pending until that date arrives.</p>
      </FormField>

      <FormField label="Description" pillLabel>
        <textarea rows={2} className={baseInputClasses} value={form.description} onChange={(e) => set('description', e.target.value)} />
      </FormField>
    </div>
  )
}
