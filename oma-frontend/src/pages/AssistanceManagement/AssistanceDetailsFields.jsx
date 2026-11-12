import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'
import { assistanceMinDate, isCashType, isTrainingType, unitsForType } from './assistanceFieldHelpers.js'
import { withAssistanceType } from './distributeFlow.js'
import { SourceAgencyMultiSelect, TypeConditionalFields } from './sharedAssistanceFields.jsx'
import useAssistanceTypeUnits from './useAssistanceTypeUnits.js'

// The assistance details of the distribution windows as a table form, the same fields whoever the recipients are: type, source agencies, the
// quantity (or the cash amount, or the training days), the date and a description. `form` is made by makeAssistanceForm (distributeFlow.js).
export default function AssistanceDetailsFields({ domain, form, setForm, today }) {
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const cash = isCashType(form.assistance_type)
  const training = isTrainingType(form.assistance_type)
  // The Unit box offers the units set for this type in Assistance Settings (Seeds: not piece or set).
  const unitsByType = useAssistanceTypeUnits(domain.allowSeedFertilizer ? 'crop' : 'fisheries')

  return (
    <FormSection title="Assistance Details">
      <FormRows label="Assistance details">
        <FormRow>
          <FormCell label="Assistance Type" required wide>
            <ComboboxWithOther
              options={domain.assistanceTypeOptions.filter((o) => o !== 'Other')}
              value={form.assistance_type}
              otherValue={form.assistance_type_other}
              onChange={(v) => setForm((f) => withAssistanceType(f, v))}
              onOtherChange={(v) => set('assistance_type_other', v)}
              placeholder="Select Assistance Type"
            />
          </FormCell>
        </FormRow>
        <FormRow>
          <FormCell label="Source Agency" required wide>
            <SourceAgencyMultiSelect value={form.source_agencies} onChange={(v) => set('source_agencies', v)}
              other={{ on: form.source_other_on, text: form.source_other, onToggle: (on) => set('source_other_on', on), onText: (t) => set('source_other', t) }} />
          </FormCell>
        </FormRow>

        {/* Exactly one quantity-shaped field (Amount for Cash, Duration for Training, Quantity for everything else), plus for Equipment,
            Seeds and Fertilizer a second one naming the kind. */}
        <FormRow>
          {cash && (
            <FormCell label="Amount per Recipient (₱)" required>
              <input type="number" step="0.01" min="0.01" className={baseInputClasses} aria-label="Amount per recipient" value={form.cash_amount}
                onChange={(e) => set('cash_amount', e.target.value)} placeholder="e.g. 500.00" />
            </FormCell>
          )}
          {!cash && !training && (
            <FormCell label="Quantity per Recipient" required>
              {/* Both boxes keep one fixed width, so the field never stretches or shrinks with the window. */}
              <div className="flex items-center gap-2">
                <input type="number" min="0" step="any" className={`${baseInputClasses} w-24! shrink-0`} value={form.quantity_amount} placeholder="e.g. 2"
                  onChange={(e) => set('quantity_amount', e.target.value)} aria-label="Quantity per recipient" />
                <select className={`${baseInputClasses} w-32! shrink-0`} value={form.quantity_unit} onChange={(e) => set('quantity_unit', e.target.value)} aria-label="Unit">
                  <option value="">Unit…</option>
                  {unitsForType(unitsByType, form.assistance_type, form.quantity_unit).map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </FormCell>
          )}
          <TypeConditionalFields assistanceType={form.assistance_type} form={form} set={set} allowSeedFertilizer={domain.allowSeedFertilizer} cell />
        </FormRow>

        <FormRow>
          <FormCell label="Distribution Date" required wide
            hint={<p className="mt-1 text-[11px] text-[#7A8E7A]">Today or a later date. A future date schedules the distribution: it stays Pending until that date arrives.</p>}>
            <input type="date" className={`${baseInputClasses} sm:max-w-xs`} aria-label="Distribution Date" value={form.date_given} min={assistanceMinDate({ today })}
              onChange={(e) => set('date_given', e.target.value)} />
          </FormCell>
        </FormRow>
        <FormRow>
          <FormCell label="Description" wide>
            <textarea rows={2} className={`${baseInputClasses} h-auto py-2`} aria-label="Description" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </FormCell>
        </FormRow>
      </FormRows>
    </FormSection>
  )
}
