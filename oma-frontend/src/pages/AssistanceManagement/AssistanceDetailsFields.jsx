import { Plus, Trash2 } from 'lucide-react'
import Button from '../../components/UI/Button.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'
import { assistanceMinDate, isCashType, isTrainingType, typesWithCustom, unitsForType } from './assistanceFieldHelpers.js'
import { MAX_ASSISTANCES, makeAssistanceForm, withAssistanceType } from './distributeFlow.js'
import { SourceAgencyMultiSelect, TypeConditionalFields } from './sharedAssistanceFields.jsx'
import useAssistanceChoices from './useAssistanceChoices.js'
import useAssistanceTypeUnits from './useAssistanceTypeUnits.js'

// The assistance details of the distribution windows as table forms, the same fields whoever the recipients are. One block for each
// assistance given (type, source agencies, the quantity or the cash amount or the training days), then one block for what is shared by all of
// them: when and where it is claimed, and a description. `form` is made by makeAssistanceForm (distributeFlow.js) and is the first assistance; `more` holds the
// extra ones (Add Another Assistance), each a form of its own.
export default function AssistanceDetailsFields({ domain, form, setForm, more = [], setMore, today }) {
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const several = more.length > 0
  const setExtra = (index, next) => setMore((list) => list.map((line, i) => (i === index ? (typeof next === 'function' ? next(line) : next) : line)))
  const addAssistance = () => setMore((list) => [...list, { ...makeAssistanceForm(today), source_agencies: [...form.source_agencies] }])
  const removeAssistance = (index) => setMore((list) => list.filter((_, i) => i !== index))

  return (
    <>
      <AssistanceBlock domain={domain} title={several ? 'Assistance 1' : 'Assistance Details'} form={form} setForm={setForm} />
      {more.map((line, i) => (
        <AssistanceBlock key={i} domain={domain} title={`Assistance ${i + 2}`} form={line} setForm={(next) => setExtra(i, next)} onRemove={() => removeAssistance(i)} />
      ))}
      {setMore && more.length + 1 < MAX_ASSISTANCES && (
        <div>
          <Button type="button" variant="outline" icon={Plus} onClick={addAssistance}>Add Another Assistance</Button>
          <p className="mt-1 text-[11px] text-[#7A8E7A]">Give more than one assistance to the same recipients in one step. Each has its own type, quantity and source agency.</p>
        </div>
      )}

      <FormSection title={several ? 'Schedule and Description (all assistance)' : 'Schedule and Description'}>
        <FormRows label="Schedule and description">
          <FormRow>
            <FormCell label="Distribution Date" required>
              <input type="date" className={baseInputClasses} aria-label="Distribution Date" value={form.date_given} min={assistanceMinDate({ today })}
                onChange={(e) => set('date_given', e.target.value)} />
            </FormCell>
            <FormCell label="Distribution Time" required>
              <input type="time" className={baseInputClasses} aria-label="Distribution Time" value={form.distribution_time || ''}
                onChange={(e) => set('distribution_time', e.target.value)} />
            </FormCell>
          </FormRow>
          <FormRow>
            <FormCell label="Distribution Place" required wide
              hint={<p className="mt-1 text-[11px] text-[#7A8E7A]">Recipients with an account are told this right away. It shows Scheduled until that date and time, then Received.</p>}>
              <input className={baseInputClasses} aria-label="Distribution Place" maxLength={200} value={form.distribution_place || ''}
                placeholder="e.g. Barangay Hall, Poblacion" onChange={(e) => set('distribution_place', e.target.value)} />
            </FormCell>
          </FormRow>
          <FormRow>
            <FormCell label="Description" wide>
              <textarea rows={2} className={`${baseInputClasses} h-auto py-2`} aria-label="Description" value={form.description} onChange={(e) => set('description', e.target.value)} />
            </FormCell>
          </FormRow>
        </FormRows>
      </FormSection>
    </>
  )
}

// One assistance: its type, its source agencies and its quantity (or the amount for cash, the days for training).
function AssistanceBlock({ domain, title, form, setForm, onRemove = null }) {
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const cash = isCashType(form.assistance_type)
  const training = isTrainingType(form.assistance_type)
  // The Unit box offers the units set for this type in Assistance Settings (Seeds: not piece or set).
  const unitsByType = useAssistanceTypeUnits(domain.allowSeedFertilizer ? 'crop' : 'fisheries')
  // The types offered: the built-in ones and the ones added in Assistance Settings.
  const typeChoices = useAssistanceChoices(domain.allowSeedFertilizer ? 'crop' : 'fisheries')

  return (
    <FormSection title={title}>
      <FormRows label={`${title} details`}>
        <FormRow>
          <FormCell label="Assistance Type" required wide>
            <ComboboxWithOther
              options={typesWithCustom(domain.assistanceTypeOptions, typeChoices?.types).filter((o) => o !== 'Other')}
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
      </FormRows>
      {onRemove && (
        <div className="flex justify-end border-t border-[#F0F4F0] px-3 py-2">
          <button type="button" onClick={onRemove} className="inline-flex min-h-9 items-center gap-1.5 text-[12.5px] font-medium text-rose-700 hover:underline">
            <Trash2 size={14} aria-hidden="true" /> Remove {title}
          </button>
        </div>
      )}
    </FormSection>
  )
}
