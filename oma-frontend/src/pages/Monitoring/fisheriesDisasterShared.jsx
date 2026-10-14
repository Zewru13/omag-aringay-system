import PhotoListField from '../../components/UI/PhotoListField.jsx'
import { MAX_DAMAGE_PHOTOS } from './fisheriesDisasterConstants.js'

// Shared by the fisherfolk disaster forms (Log Disaster, and Report Disaster on a stock): the Photo
// Documentation of Damage field with its live camera, and the Equipment Damaged checklist. Constants and
// helpers live in fisheriesDisasterConstants.js; the photo list state in useDamagePhotos.js.

// Photo Documentation of Damage (fisheries wording) on the shared photo list field (components/UI/PhotoListField.jsx).
export function DamagePhotosField(props) {
  return (
    <PhotoListField
      testId="damage-photos"
      title="Photo Documentation of Damage"
      hint={`Optional — up to ${MAX_DAMAGE_PHOTOS} photos. Add photos showing the damaged equipment, pond, cage, facility, or other affected aquaculture property.`}
      altPrefix="Damage photo"
      cameraSubtitle="Point the camera at the damage, then capture."
      {...props}
    />
  )
}

// Equipment Damaged checklist. `groups` = [{ label, options }]; a null label renders the options ungrouped.
// `fill`: from lg up the list takes whatever height its (flex column) parent has, instead of a fixed maximum, so it can match a neighbouring column.
export function EquipmentChecklist({ groups, selected, onToggle, otherValue, onOtherChange, inputClassName, fill = false }) {
  return (
    <>
      <div className={`${groups.some(g => g.label) ? 'max-h-56' : 'max-h-44'} ${fill ? 'lg:max-h-none lg:min-h-0 lg:flex-1' : ''} overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 space-y-2`}>
        {groups.map((group, gi) => (
          <div key={group.label || `group-${gi}`} className="space-y-2">
            {group.label && (
              <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group.label}</p>
            )}
            {group.options.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={selected.includes(option)} onChange={() => onToggle(option)} />
                <span>{option}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
      {selected.includes('Other') && (
        <input
          className={`${inputClassName} mt-2`}
          value={otherValue}
          onChange={e => onOtherChange(e.target.value)}
          placeholder="Specify Equipment Damaged"
        />
      )}
    </>
  )
}
