import { useState } from 'react'
import { HeartHandshake } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { labels } from './labels.js'
import { todayISO } from '../../utils/localDate.js'


// Batch C — a shared, reconciled choice set (minus 'Other', appended by
// ComboboxWithOther), same as CropAssistancePage/LogGovernmentAssistanceModal/
// FisheriesAssistancePage — source_agency is a free CharField on the
// backend either way, so this is a frontend-only choice-set alignment.
const SOURCE_AGENCY_OPTIONS = [
  'LGU - Aringay',
  'Office of the Provincial Agriculturist',
  'Department of Agriculture (DA)',
  'Department of Agrarian Reform (DAR)',
  'Non-Government Organization (NGO)',
]

// Batch 12: ORGANIZATION citizen's "Report Assistance" form — create AND
// edit, following LogGovernmentAssistanceModal's field set but much
// simpler: the member is already picked (passed in as
// `member`, sourced from this org's own member-search endpoint — see
// MyOrgReportingSection), so there's no cross-org farmer/fisherfolk search
// here the way the staff-facing modal has. Attribution
// (attributed_organization/attributed_fisherfolk_organization) is computed
// server-side from the member's own real organization membership, NOT from
// which org submitted this — editing here never touches that field.
// Per-type unit lists — presentation only, same shape OrgReportAssistanceScreen
// uses. `quantity` stays a free-text CharField server-side; the chosen unit
// is composed into it ("2 bags (50 kg)").
const UNIT_OPTIONS = {
  Fertilizer: ['bags (50 kg)', 'kg', 'sako'],
  Seeds: ['kg', 'bags', 'packs'],
  'Fingerlings/Seeds': ['pieces', 'bags', 'kg'],
  Feed: ['bags (25 kg)', 'kg', 'sako'],
  Equipment: ['unit', 'set', 'piece'],
  'Fishing Gear': ['unit', 'set', 'piece'],
  'Boat/Vessel': ['unit'],
  Training: ['session', 'day'],
}
const DEFAULT_UNITS = ['unit']
const unitsFor = (type) => UNIT_OPTIONS[type] || DEFAULT_UNITS

// A previously-saved quantity like "2 bags (50 kg)" or "₱500 per head" has
// no structured amount/unit split coming back from the server — best-effort
// parse so editing an existing entry doesn't start the amount field blank.
const parseQuantity = (raw, type) => {
  if (!raw) return { amount: '', unit: unitsFor(type)[0] }
  if (type === 'Cash Assistance') {
    const m = raw.match(/[\d.]+/)
    return { amount: m ? m[0] : '', unit: '' }
  }
  const parts = raw.trim().split(/\s+/)
  const amount = parts[0] || ''
  const unit = parts.slice(1).join(' ') || unitsFor(type)[0]
  return { amount, unit }
}

export default function CitizenReportAssistanceModal({ domain, member, entry, onClose, onSuccess }) {
  const { showToast } = useToast()
  const isEdit = Boolean(entry)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const initialType = entry?.assistance_type || domain.assistanceTypeOptions[0]
  const initialQty = parseQuantity(entry?.quantity, initialType)
  const [form, setForm] = useState({
    assistance_type: initialType,
    assistance_type_other: '',
    source_agency: entry?.source_agency || '',
    source_agency_other: '',
    amount: initialQty.amount,
    unit: initialQty.unit,
    date_given: entry?.date_given || todayISO(),
    season: entry?.season || (domain.seasonOptions ? domain.seasonOptions[0] : ''),
    remarks: entry?.remarks || '',
  })

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const isCash = form.assistance_type === 'Cash Assistance'
  const isOtherType = form.assistance_type === 'Other'

  // Switching type re-seeds the unit, so a stale unit from a different type
  // (e.g. "session") can never linger over Fertilizer.
  const selectType = (type) => {
    setErrorMessage('')
    setForm((f) => ({ ...f, assistance_type: type, unit: unitsFor(type)[0] }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMessage('')
    if (!form.assistance_type || !form.date_given) {
      setErrorMessage(labels.reportAssistance.errors.requiredFields)
      return
    }
    if (isOtherType && !form.assistance_type_other.trim()) {
      setErrorMessage(labels.reportAssistance.errors.specifyAssistanceType)
      return
    }
    if (!isCash && !form.amount.toString().trim()) {
      setErrorMessage(labels.reportAssistance.errors.requiredFields)
      return
    }
    if (isCash && (!form.amount || Number(form.amount) <= 0)) {
      setErrorMessage(labels.reportAssistance.errors.invalidCashAmount)
      return
    }
    if (form.source_agency === 'Other' && !form.source_agency_other.trim()) {
      setErrorMessage(labels.reportAssistance.errors.specifySourceAgency)
      return
    }
    setIsSubmitting(true)
    try {
      const year = new Date(form.date_given).getFullYear()
      const sourceAgency = form.source_agency === 'Other' ? form.source_agency_other.trim() : form.source_agency
      const quantity = isCash ? `₱${form.amount} per head` : [form.amount, form.unit].filter(Boolean).join(' ')
      // assistance_type is a fixed TextChoices column server-side — it
      // rejects anything but the literal 6 values (Other included). The
      // free-text specify goes into remarks instead, never into
      // assistance_type itself.
      const otherNote = isOtherType && form.assistance_type_other.trim() ? `Other: ${form.assistance_type_other.trim()}` : ''
      const remarks = [otherNote, form.remarks.trim()].filter(Boolean).join(' — ')
      const payload = {
        assistance_type: form.assistance_type,
        source_agency: sourceAgency,
        quantity,
        date_given: form.date_given,
        season: form.season,
        remarks,
        year,
      }
      if (isEdit) {
        await api.patch(domain.detailUrl(entry.id), payload)
        showToast(labels.reportAssistance.successEdit, 'success')
      } else {
        await api.post(domain.createUrl, {
          ...payload,
          [domain.personField]: domain.memberIdOf(member),
        })
        showToast(labels.reportAssistance.successNew, 'success')
      }
      onSuccess()
      onClose()
    } catch (err) {
      const data = err?.response?.data
      const firstError = Array.isArray(data) && data.length ? data[0]
        : (data && typeof data === 'object' ? Object.values(data).flat()[0] : null)
      setErrorMessage(firstError || data?.detail || labels.reportAssistance.errors.genericSaveError)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title={isEdit ? labels.reportAssistance.titleEdit : labels.reportAssistance.titleNew}
      subtitle={isEdit ? undefined : domain.memberLabel(member)}
      icon={HeartHandshake}
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FormField label={labels.reportAssistance.fields.assistanceType} required>
          <div className="flex flex-wrap gap-2">
            {domain.assistanceTypeOptions.map((type) => {
              const active = form.assistance_type === type
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={active}
                  onClick={() => selectType(type)}
                  className={`min-h-[40px] rounded-lg px-3.5 text-[13px] font-semibold transition-colors ${
                    active ? 'bg-[#1B4D2E] text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {type}
                </button>
              )
            })}
          </div>
          {isOtherType && (
            <input
              type="text"
              className={`${baseInputClasses} mt-2.5`}
              value={form.assistance_type_other}
              onChange={(e) => set('assistance_type_other', e.target.value)}
              placeholder={labels.reportAssistance.fields.otherTypePlaceholder}
            />
          )}
        </FormField>

        {/* Amount block — the one part that genuinely differs by type,
            same pattern as OrgReportAssistanceScreen's bulk-distribute
            screen: Cash replaces quantity+unit outright. */}
        {isCash ? (
          <FormField label={labels.reportAssistance.fields.cashPerMember} required>
            <div className="flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-3">
              <span className="text-[14px] text-slate-500" aria-hidden="true">₱</span>
              <input
                type="number" step="0.01" min="0.01"
                className="min-w-0 flex-1 bg-transparent text-[14px] text-slate-800 outline-none"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                placeholder="0"
              />
            </div>
          </FormField>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <FormField label={labels.reportAssistance.fields.quantityAmount} required>
              <input type="text" className={baseInputClasses} placeholder={labels.reportAssistance.fields.quantityPlaceholder} value={form.amount} onChange={(e) => set('amount', e.target.value)} />
            </FormField>
            <FormField label={labels.reportAssistance.fields.unit}>
              <select className={baseInputClasses} value={form.unit} onChange={(e) => set('unit', e.target.value)}>
                {unitsFor(form.assistance_type).map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </FormField>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={labels.reportAssistance.fields.dateGiven} required>
            {/* No max: a future date is the deliberate trigger for the
                scheduled-distribution lifecycle. */}
            <input type="date" className={baseInputClasses} value={form.date_given} onChange={(e) => set('date_given', e.target.value)} />
          </FormField>
          <FormField label={labels.reportAssistance.fields.sourceAgency}>
            <ComboboxWithOther
              options={SOURCE_AGENCY_OPTIONS}
              value={form.source_agency}
              otherValue={form.source_agency_other}
              onChange={(v) => set('source_agency', v)}
              onOtherChange={(v) => set('source_agency_other', v)}
            />
          </FormField>
        </div>
        {domain.seasonOptions ? (
          <FormField label={labels.reportAssistance.fields.season}>
            <select className={baseInputClasses} value={form.season} onChange={(e) => set('season', e.target.value)}>
              {domain.seasonOptions.map((s) => <option key={s}>{s}</option>)}
            </select>
          </FormField>
        ) : (
          <FormField label={labels.reportAssistance.fields.season}>
            <input type="text" className={baseInputClasses} value={form.season} onChange={(e) => set('season', e.target.value)} />
          </FormField>
        )}
        <FormField label={labels.reportAssistance.fields.remarks}>
          <textarea rows={2} className={baseInputClasses} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
        </FormField>

        {errorMessage && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{errorMessage}</p>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button onClick={onClose} type="button" variant="ghost">{labels.common.cancel}</Button>
          <Button isLoading={isSubmitting} type="submit" variant="primary">
            {isEdit ? labels.reportAssistance.submitEdit : labels.reportAssistance.submitNew}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}
