import { useEffect, useState } from 'react'
import { CheckCircle2, Gift, XCircle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { labels } from './labels.js'
import { todayISO, yesterdayISO } from '../../utils/localDate.js'
import { DesktopRailCard } from './CitizenDesktopUI.jsx'

// ─── Assistance Received ───────────────────────────────────────────────────────
// Frames 4 and 8. Reuses the same read-only /interventions/my-*-beneficiary-
// history/ endpoints the old table-based MyAssistanceHistorySection called
// (Batch 11) -- no new access, just the reference's card-list + summary-rail
// presentation. Shared between mobile and desktop: the rail column simply
// wraps onto its own row below the list under 1024px, so one component
// serves both instead of maintaining a second, un-restyled mobile version.
export function CitizenAssistanceList({ endpoint }) {
  const D = labels.ffNew.desktop
  const { showToast } = useToast()
  const [records, setRecords] = useState(null)
  const [reportingId, setReportingId] = useState(null)
  const [reason, setReason] = useState('')
  const [busyId, setBusyId] = useState(null)

  // Confirm/Report-Not-Received live on the record's own domain-specific
  // path — /interventions/beneficiaries/ vs /interventions/fisherfolk-
  // beneficiaries/ — derived from which history endpoint this instance was
  // given, same domain split the caller already makes.
  const actionBase = endpoint.includes('fisherfolk')
    ? '/interventions/fisherfolk-beneficiaries'
    : '/interventions/beneficiaries'

  const reload = () => {
    api.get(endpoint).then((r) => setRecords(r.data)).catch(() => setRecords([]))
  }

  useEffect(() => {
    let cancelled = false
    api.get(endpoint).then((r) => { if (!cancelled) setRecords(r.data) }).catch(() => { if (!cancelled) setRecords([]) })
    return () => { cancelled = true }
  }, [endpoint])

  if (records === null) return <p className="text-[13px] italic text-cz-text-2">{labels.common.loading}</p>

  // source_agency was a single string; is now source_agencies (a list per
  // record) — flatMap to get one distinct set across every record's own
  // (possibly several) agencies, same summary-rail purpose as before.
  const sources = [...new Set(records.flatMap((r) => r.source_agencies || []))]

  const confirmReceived = async (rec) => {
    setBusyId(rec.id)
    try {
      await api.post(`${actionBase}/${rec.id}/confirm-received/`)
      showToast(D.assistanceConfirmedToast, 'success')
      reload()
    } catch (err) {
      showToast(err?.response?.data?.detail || D.assistanceActionFailed, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const submitNotReceived = async (rec) => {
    if (!reason.trim()) { showToast(D.assistanceReasonRequired, 'error'); return }
    setBusyId(rec.id)
    try {
      await api.post(`${actionBase}/${rec.id}/report-not-received/`, { non_receipt_reason: reason.trim() })
      showToast(D.assistanceReportedToast, 'success')
      setReportingId(null); setReason('')
      reload()
    } catch (err) {
      showToast(err?.response?.data?.detail || D.assistanceActionFailed, 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 space-y-2.5">
        {records.length === 0 ? (
          <p className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-6 text-center text-[13px] italic text-cz-text-muted">
            {D.assistanceEmpty}
          </p>
        ) : records.map((rec) => (
          <div key={rec.id} className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface px-4 py-3.5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cz-page">
                <Gift size={16} className="text-cz-text-2" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-semibold text-cz-text">
                  {rec.assistance_type || labels.common.unknown}
                  {rec.quantity ? ` — ${rec.quantity}` : ''}
                </p>
                <p className="truncate text-[12.5px] text-cz-text-2">{(rec.source_agencies || []).join(', ') || labels.common.unknown}</p>
              </div>
              <p className="shrink-0 text-[12px] text-cz-text-muted">{labels.common.formatDate(rec.date_given)}</p>
            </div>

            {rec.status === 'AWAITING_CONFIRMATION' && (
              <div className="mt-3 border-t-[0.5px] border-cz-border pt-3">
                <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-cz-page px-2.5 py-1 text-[11.5px] font-semibold text-cz-text-2">
                  {D.assistanceAwaitingBadge}
                </p>
                {reportingId === rec.id ? (
                  <div className="space-y-2">
                    <label className="block text-[12.5px] font-medium text-cz-text">{D.assistanceReasonLabel}</label>
                    <textarea
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={D.assistanceReasonPlaceholder}
                      className="w-full rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3 py-2 text-[13.5px] text-cz-text focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button type="button" disabled={busyId === rec.id} onClick={() => submitNotReceived(rec)}
                        className="rounded-[8px] bg-cz-fish-header px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50">
                        {D.assistanceReportSubmit}
                      </button>
                      <button type="button" onClick={() => { setReportingId(null); setReason('') }}
                        className="rounded-[8px] border-[0.5px] border-cz-border-strong px-3 py-1.5 text-[12.5px] font-medium text-cz-text-2">
                        {D.assistanceCancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busyId === rec.id} onClick={() => confirmReceived(rec)}
                      className="inline-flex items-center gap-1.5 rounded-[8px] bg-cz-fish-header px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50">
                      <CheckCircle2 size={14} aria-hidden="true" /> {D.assistanceConfirmReceived}
                    </button>
                    <button type="button" disabled={busyId === rec.id} onClick={() => setReportingId(rec.id)}
                      className="inline-flex items-center gap-1.5 rounded-[8px] border-[0.5px] border-cz-border-strong px-3 py-1.5 text-[12.5px] font-medium text-cz-text-2 disabled:opacity-50">
                      <XCircle size={14} aria-hidden="true" /> {D.assistanceReportNotReceived}
                    </button>
                  </div>
                )}
              </div>
            )}

            {rec.status === 'NOT_RECEIVED' && (
              <p className="mt-3 border-t-[0.5px] border-cz-border pt-3 text-[12.5px] italic text-cz-text-2">
                {D.assistanceNotReceivedNote}
              </p>
            )}
          </div>
        ))}
        <p className="pt-2 text-center text-[12px] text-cz-text-muted">{D.assistanceReadOnly}</p>
      </div>

      <div className="w-full space-y-4 lg:w-[280px] lg:shrink-0">
        <DesktopRailCard title={D.assistanceSummary}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-cz-text-muted">{D.assistanceTotalCount}</p>
          <p className="mt-0.5 text-[30px] font-bold leading-none text-cz-text">{records.length}</p>
          <p className="mt-1 text-[12px] text-cz-text-muted">{D.assistanceRecordedEntries}</p>
          {sources.length > 0 && (
            <>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.05em] text-cz-text-muted">{D.assistanceProvidedBy}</p>
              <ul className="mt-1.5 space-y-1">
                {sources.map((s) => (
                  <li key={s} className="flex items-center gap-1.5 text-[13px] text-cz-text">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cz-text-muted" aria-hidden="true" />
                    {s}
                  </li>
                ))}
              </ul>
            </>
          )}
        </DesktopRailCard>
        <DesktopRailCard title={D.assistanceInfoHeading}>
          <p className="text-[12.5px] leading-[1.55] text-cz-text-2">{D.assistanceInfoBody}</p>
        </DesktopRailCard>
      </div>
    </div>
  )
}

// ─── Karamdaman / Namamatay (desktop, fisherfolk only) ─────────────────────
// Frame 9. Deliberately NOT the mobile Kalusugan wizard (CitizenHealthLogScreen):
// the desktop reference draws this as one flat form with no guidance panel and
// a three-way vet-consulted answer instead of the mobile's yes/no. It still
// writes the same FisheriesActivityLog shape (activity='Disease Control',
// disease_type, mortality_count, vet_consulted, treatment_applied, notes) so
// nothing downstream needs to know which screen produced the entry.
const FIELD = 'w-full rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3.5 py-[10px] text-[14px] text-cz-text focus:border-cz-fish-header focus:outline-none disabled:opacity-50'
const LABEL = 'mb-1.5 block text-[12.5px] font-medium text-cz-text'

export function DesktopKaramdamanForm({ records, onSaved }) {
  const D = labels.ffNew.desktop
  const { showToast } = useToast()
  const [diseaseTypes, setDiseaseTypes] = useState([])
  const [form, setForm] = useState({
    stocking_record: '', disease_type: '', mortality_count: '',
    possible_cause: '', possible_cause_other_specify: '',
    disposal_method: '', disposal_method_other_specify: '',
    treatment_applied: '', consulted: '', date: todayISO(),
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    let cancelled = false
    api.get('/fisheries/disease-types/')
      .then((r) => { if (!cancelled) setDiseaseTypes(Array.isArray(r.data) ? r.data : (r.data?.results || [])) })
      .catch(() => { if (!cancelled) setDiseaseTypes([]) })
    return () => { cancelled = true }
  }, [])

  const activeRecords = records.filter((r) => ['Stocked', 'Near Harvest'].includes(r.status))
  // The serializer already resolves pond_name, same field every other
  // screen in this app reads -- no need to cross-reference the ponds list.
  const pondLabel = (r) => `${r.pond_name || labels.common.unknown} — ${r.species_name || labels.yieldAnalysis.fisheriesCropLabel}`

  const submit = async (e) => {
    e.preventDefault()
    if (!form.stocking_record) return
    setSaving(true)
    try {
      await api.post(`/fisheries/stocking/${form.stocking_record}/logs/`, {
        activity: 'Disease Control',
        date_of_activity: form.date,
        disease_type: form.disease_type || null,
        mortality_count: form.mortality_count === '' ? null : Number(form.mortality_count),
        possible_cause: form.mortality_count ? form.possible_cause : '',
        possible_cause_other_specify: form.mortality_count && form.possible_cause === 'Other' ? form.possible_cause_other_specify.trim() : '',
        disposal_method: form.mortality_count ? form.disposal_method : '',
        disposal_method_other_specify: form.mortality_count && form.disposal_method === 'Other' ? form.disposal_method_other_specify.trim() : '',
        treatment_applied: form.treatment_applied,
        vet_consulted: form.consulted === 'yes' ? 'Oo' : form.consulted === 'scheduled' ? 'Nakatakda na' : form.consulted === 'no' ? 'N/A' : '',
      })
      showToast(labels.ffNew.health.successTitle, 'success')
      setForm({
        stocking_record: '', disease_type: '', mortality_count: '',
        possible_cause: '', possible_cause_other_specify: '',
        disposal_method: '', disposal_method_other_specify: '',
        treatment_applied: '', consulted: '', date: todayISO(),
      })
      onSaved?.()
    } catch (err) {
      const d = err?.response?.data
      const msg = typeof d === 'string' ? d : Object.values(d || {}).flat().join(' ') || labels.common.genericSaveError
      showToast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-start gap-5">
      <form onSubmit={submit} className="min-w-0 flex-1 space-y-4 rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>{D.karamdamanPond} *</label>
            <select required value={form.stocking_record} onChange={(e) => set('stocking_record', e.target.value)} className={FIELD}>
              <option value="">{labels.activityLog.selectPlaceholder}</option>
              {activeRecords.map((r) => <option key={r.id} value={r.id}>{pondLabel(r)}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>{D.karamdamanType} *</label>
            <select required value={form.disease_type} onChange={(e) => set('disease_type', e.target.value)} className={FIELD}>
              <option value="">{labels.activityLog.selectPlaceholder}</option>
              {diseaseTypes.map((dt) => <option key={dt.id} value={dt.id}>{dt.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={LABEL}>{D.karamdamanMortality}</label>
          <input type="number" min="0" placeholder="0" value={form.mortality_count} onChange={(e) => set('mortality_count', e.target.value)} className={FIELD} />
        </div>

        {form.mortality_count !== '' && Number(form.mortality_count) > 0 && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>{D.karamdamanCause}</label>
              <ComboboxWithOther
                options={Object.entries(labels.activityLog.possibleCauseOptions)
                  .filter(([v]) => v !== 'Other')
                  .map(([value, label]) => ({ value, label }))}
                value={form.possible_cause}
                otherValue={form.possible_cause_other_specify}
                onChange={(v) => set('possible_cause', v)}
                onOtherChange={(v) => set('possible_cause_other_specify', v)}
                otherLabel={labels.activityLog.possibleCauseOptions.Other}
                placeholder={labels.activityLog.selectPlaceholder}
                inputClassName={FIELD}
                chevronSize={18}
              />
            </div>
            <div>
              <label className={LABEL}>{D.karamdamanDisposal}</label>
              <ComboboxWithOther
                options={Object.entries(labels.activityLog.disposalMethodOptions)
                  .filter(([v]) => v !== 'Other')
                  .map(([value, label]) => ({ value, label }))}
                value={form.disposal_method}
                otherValue={form.disposal_method_other_specify}
                onChange={(v) => set('disposal_method', v)}
                onOtherChange={(v) => set('disposal_method_other_specify', v)}
                otherLabel={labels.activityLog.disposalMethodOptions.Other}
                placeholder={labels.activityLog.selectPlaceholder}
                inputClassName={FIELD}
                chevronSize={18}
              />
            </div>
          </div>
        )}

        <div>
          <label className={LABEL}>{D.karamdamanTreatment} *</label>
          <textarea required rows={3} placeholder={D.karamdamanTreatmentPlaceholder} value={form.treatment_applied} onChange={(e) => set('treatment_applied', e.target.value)} className={`${FIELD} resize-none`} />
          <p className="mt-1 text-[11.5px] text-cz-text-muted">{D.karamdamanTreatmentHint}</p>
        </div>

        <div>
          <label className={LABEL}>{D.karamdamanConsulted} *</label>
          <div className="flex gap-2">
            {[['yes', D.karamdamanConsultedYes], ['no', D.karamdamanConsultedNo], ['scheduled', D.karamdamanConsultedScheduled]].map(([v, text]) => (
              <button
                key={v}
                type="button"
                onClick={() => set('consulted', v)}
                aria-pressed={form.consulted === v}
                className={`rounded-[8px] border-[0.5px] px-3.5 py-2 text-[13px] font-medium transition-colors ${
                  form.consulted === v ? 'border-cz-fish-header bg-cz-fish-header text-white' : 'border-cz-border-strong bg-cz-surface text-cz-text hover:bg-cz-page'
                }`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={LABEL}>{labels.activityLog.dateShortcuts.today} *</label>
          <div className="flex items-center gap-2">
            {[[todayISO(), labels.activityLog.dateShortcuts.today], [yesterdayISO(), labels.activityLog.dateShortcuts.yesterday]].map(([v, text]) => (
              <button
                key={v}
                type="button"
                onClick={() => set('date', v)}
                className={`rounded-[8px] border-[0.5px] px-3.5 py-2 text-[13px] font-medium transition-colors ${
                  form.date === v ? 'border-cz-fish-header bg-cz-fish-header text-white' : 'border-cz-border-strong bg-cz-surface text-cz-text hover:bg-cz-page'
                }`}
              >
                {text}
              </button>
            ))}
            <input type="date" max={todayISO()} value={form.date} onChange={(e) => set('date', e.target.value)} className={`${FIELD} flex-1`} />
          </div>
        </div>

        <button type="submit" disabled={saving} className="w-full rounded-[8px] bg-cz-fish-header px-4 py-3 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
          {saving ? labels.common.loading : D.karamdamanSave}
        </button>
      </form>

      <div className="w-[280px] shrink-0 space-y-4">
        <DesktopRailCard title={D.selectedPond}>
          <p className="text-[13px] text-cz-text-2">{D.selectedPondHint}</p>
        </DesktopRailCard>
        <DesktopRailCard title={D.karamdamanMahalaga}>
          <p className="text-[12.5px] leading-[1.55] text-cz-text-2">{D.karamdamanMahalagaBody}</p>
        </DesktopRailCard>
        <DesktopRailCard title={D.karamdamanVetContact}>
          <p className="text-[12.5px] leading-[1.55] text-cz-text-2">{D.karamdamanVetContactBody}</p>
        </DesktopRailCard>
      </div>
    </div>
  )
}
