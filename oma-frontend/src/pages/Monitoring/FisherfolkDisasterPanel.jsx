import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'
import { AQUACULTURE_EQUIPMENT_GROUPS, equipmentPayload } from './fisheriesDisasterConstants.js'
import { DamagePhotosField, EquipmentChecklist } from './fisheriesDisasterShared.jsx'
import useDamagePhotos from './useDamagePhotos.js'
import { personLine } from './multiFisherfolkDisaster.js'

// One affected fisherfolk's own part of the multi Log Disaster form: who they are, a line on what was hit, THEIR OWN equipment damaged, volume
// lost and photo documentation (uploads, previews, remove) and a button to remove them. The ponds and cages that were hit (and the fingerlings lost
// in each) are ticked in the table above it (FisheriesDisasterTargetsTable.jsx), so a fisherfolk with something ticked there gets a part here; one with
// damage not linked to a stock (pond, cage or equipment only) is added by name and gets one too (mode 'unlinked', and the server must find a pond or
// cage on record for them). The event itself (date, type, description) is filled in once by the window that holds the parts, which asks each part
// to check itself and to hand over its entry and photos:
//   ref.validate() -> '' or the message to show     ref.entry() -> { mode, volume, equipment }     ref.photos() -> [{ file }]     ref.clearDraft()
// The photo list lives in the part (useDamagePhotos), so the photos are this fisherfolk's alone and are dropped, previews released, when the part goes.
// What is typed is a draft per fisherfolk, so leaving the page and coming back keeps it.

const FisherfolkDisasterPanel = forwardRef(function FisherfolkDisasterPanel({ person, mode = 'stocks', summary = '', onRemove }, ref) {
  const draft = useDraftForm(`fisheries-multi-disaster:ff:${person.id}`)
  const [open, setOpen] = useState(true)
  const photosState = useDamagePhotos()
  const [blocked, setBlocked] = useState('')   // why nothing can be logged for them (no pond or cage on record, or the check failed)
  const [form, setForm] = useDraftField(draft, 'form', { volume_lost_kg: '', equipment_damaged: [], equipment_damaged_other: '' })
  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  // Damage not linked to a stock can only be logged for a fisherfolk who has a pond or cage on record (the rule the single form applies).
  useEffect(() => {
    if (mode !== 'unlinked') return undefined
    let cancelled = false
    api.get('/monitoring/fisherfolk-disasters/eligibility/', { params: { fisherfolk: person.id } })
      .then((r) => { if (!cancelled && !r.data.can_log_disaster) setBlocked(r.data.message || 'No pond, cage or stock is on record.') })
      .catch(() => { if (!cancelled) setBlocked('Could not check the ponds, cages and stocks. Remove and add this fisherfolk again to retry.') })
    return () => { cancelled = true }
  }, [person.id, mode])

  const toggleEquipment = (option) => setForm((prev) => {
    const next = prev.equipment_damaged.includes(option) ? prev.equipment_damaged.filter((item) => item !== option) : [...prev.equipment_damaged, option]
    return { ...prev, equipment_damaged: next, equipment_damaged_other: next.includes('Other') ? prev.equipment_damaged_other : '' }
  })

  useImperativeHandle(ref, () => ({
    validate() {
      const say = (text) => `${person.full_name}: ${text}`
      if (blocked) return say(blocked)
      if (form.volume_lost_kg !== '' && parseFloat(form.volume_lost_kg) < 0) return say('Volume lost cannot be negative.')
      if (form.equipment_damaged.includes('Other') && !form.equipment_damaged_other.trim()) return say('Specify Equipment Damaged.')
      return ''
    },
    entry() {
      return { mode, volume: form.volume_lost_kg, equipment: equipmentPayload(form.equipment_damaged, form.equipment_damaged_other) }
    },
    photos: () => photosState.photos,
    clearDraft() { draft.clear() },
  }))

  return (
    <div className="space-y-3" data-testid="fisherfolk-panel" data-fisherfolk-id={person.id}>
      <FormSection title={person.full_name}>
        <FormRows label={person.full_name}>
          <FormRow>
            <FormCell label="Summary" wide>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 py-1 text-[12.5px] text-[#4A5E4A]">
                  <span className="block text-[11.5px] text-[#7A8E7A]">{personLine(person)}</span>
                  {blocked ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">Cannot be logged</span> : summary}
                </div>
                <div className="flex flex-none gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}
                    aria-label={`${open ? 'Hide' : 'Show'} the details of ${person.full_name}`}>
                    <ChevronDown size={16} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label={`Remove ${person.full_name}`}>
                    <X size={14} />
                  </Button>
                </div>
              </div>
            </FormCell>
          </FormRow>

          {open && blocked && (
            <FormRow>
              <FormCell label="Cannot be logged" wide>
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">{blocked} Remove this fisherfolk to log the others.</p>
              </FormCell>
            </FormRow>
          )}

          {open && !blocked && (
            <>
              <FormRow>
                <FormCell label="Equipment Damaged" wide>
                  <EquipmentChecklist
                    groups={AQUACULTURE_EQUIPMENT_GROUPS}
                    selected={form.equipment_damaged}
                    onToggle={toggleEquipment}
                    otherValue={form.equipment_damaged_other}
                    onOtherChange={(v) => set('equipment_damaged_other', v)}
                    inputClassName={baseInputClasses}
                  />
                </FormCell>
              </FormRow>
              <FormRow>
                <FormCell label="Volume Lost (kg)" wide>
                  <input type="number" step="0.01" min="0" className={baseInputClasses} value={form.volume_lost_kg}
                    aria-label={`Volume lost (kg) for ${person.full_name}`}
                    onChange={(e) => set('volume_lost_kg', e.target.value)} placeholder="e.g. 150" />
                </FormCell>
              </FormRow>
              <FormRow>
                <FormCell label="Photo Documentation" wide>
                  <DamagePhotosField photosState={photosState} compact title="" hint="" testId={`fisherfolk-photos-${person.id}`}
                    ownerLabel={person.full_name} altPrefix={`Damage photo of ${person.full_name}`}
                    cameraSubtitle={`Photo of the damage for ${person.full_name}.`} />
                </FormCell>
              </FormRow>
            </>
          )}
        </FormRows>
      </FormSection>
    </div>
  )
})

export default FisherfolkDisasterPanel
