import { useRef, useState } from 'react'
import { Plus, Trash2, Upload } from 'lucide-react'
import { bulkCellInputClasses } from '../../components/UI/bulkEntryStyles.js'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useEquipmentOptions from '../../hooks/useEquipmentOptions.js'
import ParcelCropsImportModal from './ParcelCropsImportModal.jsx'
import { MACHINERY_FALLBACK, OWNERSHIP_OPTIONS, addImportedMachinery, makeMachineryRow } from './parcelRows.js'
import Button from '../../components/UI/Button.jsx'

// The machinery a farmer has: the lines of Register Farmer and of the profile's Add Machinery window. The page owns the list (rows
// made by makeMachineryRow, checked by machineryProblem, sent through machineryPayload); this draws it and its Add / Import buttons.
const SUB_TH = 'px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#4A5E4A] whitespace-nowrap'
const SUB_CELL = 'px-2 py-2 align-top max-md:block max-md:w-full! max-md:px-0 max-md:py-1 max-md:text-left max-md:before:mb-0.5 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]'
const REMOVE_BTN = 'inline-flex items-center gap-1.5 rounded-md p-1.5 text-rose-500 hover:bg-rose-50 transition-colors max-md:min-h-[40px] max-md:px-3 max-md:text-[13px] max-md:font-medium'

export default function MachineryEditor({ machinery, onChange }) {
  const { showToast } = useToast()
  const equipmentChoices = useEquipmentOptions('crop', MACHINERY_FALLBACK)   // Crop Settings > Equipment Types
  const nextUid = useRef(1)
  const [isImporting, setIsImporting] = useState(false)
  const update = (uid, patch) => onChange(machinery.map((m) => (m._uid === uid ? { ...m, ...patch } : m)))

  const importRows = (rows) => {
    onChange(addImportedMachinery(machinery, rows, Date.now() + nextUid.current++))
    showToast(`${rows.length} machinery line${rows.length === 1 ? '' : 's'} added.`, 'success')
    setIsImporting(false)
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        <Button type="button" onClick={() => setIsImporting(true)} variant="outline" size="sm">
          <Upload size={13} aria-hidden="true" /> Import machinery
        </Button>
        <Button type="button" onClick={() => onChange([...machinery, makeMachineryRow(Date.now() + nextUid.current++)])} variant="primary" size="sm">
          <Plus size={13} aria-hidden="true" /> Add machinery
        </Button>
      </div>
      {machinery.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#C8D5C8] px-4 py-3 text-[13px] text-[#7A8E7A]">No machinery added. Leave it empty if the farmer has none.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#E2E8E2] bg-white max-md:overflow-visible max-md:border-0 max-md:bg-transparent">
          <table className="min-w-full table-fixed text-sm max-md:block">
            <thead className="bg-[#EBF5EE] max-md:hidden">
              <tr>
                <th className={SUB_TH} style={{ width: 230 }}>Machinery <span className="text-rose-500">*</span></th>
                <th className={SUB_TH} style={{ width: 100 }}>Quantity <span className="text-rose-500">*</span></th>
                <th className={SUB_TH} style={{ width: 190 }}>Whose is it</th>
                <th style={{ width: 56 }} />
              </tr>
            </thead>
            <tbody className="max-md:block">
              {machinery.map((m, i) => (
                <tr key={m._uid} className="border-b border-[#F0F4F0] align-top max-md:block max-md:mb-2 max-md:rounded-xl max-md:border max-md:border-[#E2E8E2] max-md:bg-white max-md:p-3">
                  <td data-label={`Machinery ${i + 1} *`} className={SUB_CELL} style={{ width: 230 }}>
                    <ComboboxWithOther options={equipmentChoices} value={m.machinery_type} otherValue={m.machinery_type_other}
                      placeholder="Select machinery…" inputClassName={bulkCellInputClasses} chevronSize={13}
                      onChange={(v) => update(m._uid, { machinery_type: v })} onOtherChange={(v) => update(m._uid, { machinery_type_other: v })} />
                  </td>
                  <td data-label="Quantity *" className={SUB_CELL} style={{ width: 100 }}>
                    <input type="number" min="1" className={bulkCellInputClasses} value={m.quantity} onChange={(e) => update(m._uid, { quantity: e.target.value })} />
                  </td>
                  <td data-label="Whose is it (the equipment, not the land)" className={SUB_CELL} style={{ width: 190 }}>
                    <select className={bulkCellInputClasses} value={m.ownership} onChange={(e) => update(m._uid, { ownership: e.target.value })}>
                      {OWNERSHIP_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2 text-center max-md:block max-md:w-full! max-md:px-0 max-md:py-1 max-md:text-right" style={{ width: 56 }}>
                    <button type="button" onClick={() => onChange(machinery.filter((x) => x._uid !== m._uid))} title="Remove machinery" className={REMOVE_BTN}>
                      <Trash2 size={13} /><span className="md:hidden">Remove machinery</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {isImporting && <ParcelCropsImportModal kind="machinery" onClose={() => setIsImporting(false)} onRows={importRows} />}
    </div>
  )
}
