import { useRef } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import useEquipmentOptions from '../../hooks/useEquipmentOptions.js'
import { localToday } from '../../utils/inputGuards.js'
import { equipmentChoicesFor, makeEquipmentLine } from './registrationEquipment.js'

// The equipment an organization has, as lines on its registration form. The form owns the list (lines made by makeEquipmentLine, checked
// by equipmentLinesProblem, sent through equipmentLinePayload); this draws each line as a small card and the Add equipment button.
const labelCls = 'mb-1 block text-[12px] font-medium text-[#4A5E4A]'

export default function EquipmentLinesEditor({ type, lines, onChange }) {
  const nextUid = useRef(1)
  const update = (uid, patch) => onChange(lines.map((line) => (line._uid === uid ? { ...line, ...patch } : line)))
  // Crop Settings > Equipment Types for a farmers organization, Fisheries Settings > Equipment Types for a fisherfolk one.
  const choices = useEquipmentOptions(type === 'farmers' ? 'crop' : 'fisheries', equipmentChoicesFor(type))

  return (
    <div className="space-y-3">
      {lines.length === 0 && (
        <p className="rounded-lg border border-dashed border-[#C8D5C8] px-4 py-3 text-[13px] text-[#7A8E7A]">No equipment added. Leave it empty if the organization has none.</p>
      )}
      {lines.map((line, i) => (
        <div key={line._uid} className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[#4A5E4A]">Equipment {i + 1}</p>
            <button type="button" onClick={() => onChange(lines.filter((l) => l._uid !== line._uid))} title="Remove equipment"
              className="inline-flex items-center gap-1.5 rounded-md p-1.5 text-rose-500 hover:bg-rose-50 max-md:min-h-[40px] max-md:px-3 max-md:text-[13px] max-md:font-medium">
              <Trash2 size={13} aria-hidden="true" /> <span className="md:hidden">Remove</span>
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_120px_170px]">
            <div>
              <label className={labelCls}>Equipment <span className="text-rose-500">*</span></label>
              <ComboboxWithOther
                options={choices}
                value={line.equipment_name}
                otherValue={line.equipment_name_other}
                onChange={(v) => update(line._uid, { equipment_name: v })}
                onOtherChange={(v) => update(line._uid, { equipment_name_other: v })}
              />
            </div>
            <div>
              <label className={labelCls}>Quantity <span className="text-rose-500">*</span></label>
              <input className={baseInputClasses} type="number" min={1} value={line.quantity} onChange={(e) => update(line._uid, { quantity: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Acquired <span className="font-normal text-[#7A8E7A]">(optional)</span></label>
              <input className={baseInputClasses} type="date" max={localToday()} value={line.acquisition_date}
                onChange={(e) => update(line._uid, { acquisition_date: e.target.value })} />
            </div>
          </div>
          <div className="mt-3">
            <label className={labelCls}>Remarks <span className="font-normal text-[#7A8E7A]">(optional)</span></label>
            <input className={baseInputClasses} maxLength={500} value={line.remarks} onChange={(e) => update(line._uid, { remarks: e.target.value })} />
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...lines, makeEquipmentLine(Date.now() + nextUid.current++)])}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#1B4D2E] px-3 text-[12px] font-semibold text-white hover:bg-[#235E38]">
        <Plus size={13} aria-hidden="true" /> Add equipment
      </button>
    </div>
  )
}
