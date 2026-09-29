import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { CROP_THEME, CitizenBody, CitizenHomeHeader, CitizenScreen } from './citizenUI.jsx'
import { labels } from './labels.js'

// Tulong for the Farmer citizen: assistance grouped by where it stands —
// awaiting the recipient's confirmation, upcoming (scheduled, not yet due), and
// received. Uses the same own-record-scoped history endpoint as before; the
// confirm action now also carries an optional proof photo and note.
const ENDPOINT = '/interventions/my-beneficiary-history/'
const A = labels.farmerAssistance
const D = labels.ffNew.desktop

// "Sep 08, 2026" — the reference writes these month-first, in English.
const shortDate = (iso) => {
  if (!iso) return ''
  const d = new Date(String(iso).length <= 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

// One headline per assistance type, built from what that type actually stores.
const headline = (rec) => {
  const join = (...parts) => parts.filter(Boolean).join(' ')
  switch (rec.assistance_type) {
    case 'Seeds': return join(rec.quantity, rec.seed_type)
    case 'Fertilizer': return join(rec.quantity, rec.fertilizer_type)
    case 'Equipment': return join(rec.quantity, rec.equipment_type)
    case 'Training': return rec.training_duration_days ? A.days(rec.training_duration_days) : rec.quantity
    default: return rec.quantity || rec.remarks || ''
  }
}

const PILL = {
  AWAITING: 'bg-cz-alert-bg text-cz-alert-title',
  UPCOMING: 'bg-cz-alert-bg text-cz-alert-title',
  CONFIRMED: 'bg-cz-crop-pale text-cz-crop-header',
  NOT_RECEIVED: 'bg-cz-danger-bg text-cz-danger-accent',
  RESOLVED: 'bg-cz-page text-cz-text-2',
}

function Pill({ tone, children }) {
  return (
    <span className={`inline-block rounded-[6px] px-2 py-[3px] ${PILL[tone]}`}>
      <span className="text-[10.5px] font-semibold">{children}</span>
    </span>
  )
}

function Card({ rec, tone, pill, dateLine, children }) {
  const title = headline(rec)
  return (
    <div className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface px-4 py-4">
      <Pill tone={tone}>{pill}</Pill>
      <p className="mt-2.5 text-[16px] font-semibold text-cz-text">{rec.assistance_type || labels.common.unknown}</p>
      <p className="mt-1 text-[11.5px] text-cz-text-2">{(rec.source_agencies || []).join(' · ') || labels.common.unknown}</p>
      {title && <p className="mt-3 text-[15px] font-bold text-cz-text">{title}</p>}
      <p className="mt-1.5 text-[11.5px] text-cz-text-2">{dateLine}</p>
      {children}
    </div>
  )
}

function Section({ heading, children }) {
  return (
    <section className="min-w-0 flex-1">
      <h2 className="mb-3 text-[14px] font-semibold text-cz-text">{heading}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export default function FarmerAssistanceList({ tabBar, bare = false }) {
  const { showToast } = useToast()
  const [records, setRecords] = useState(null)
  const [dialog, setDialog] = useState(null) // { kind: 'confirm' | 'report', rec }
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = () => {
    api.get(ENDPOINT).then((r) => setRecords(Array.isArray(r.data) ? r.data : (r.data?.results || []))).catch(() => setRecords([]))
  }

  useEffect(() => {
    let cancelled = false
    api.get(ENDPOINT)
      .then((r) => { if (!cancelled) setRecords(Array.isArray(r.data) ? r.data : (r.data?.results || [])) })
      .catch(() => { if (!cancelled) setRecords([]) })
    return () => { cancelled = true }
  }, [])

  const close = () => { setDialog(null); setNote(''); setPhoto(null); setReason('') }

  const failed = (err) => {
    const d = err?.response?.data
    const msg = d?.detail || (d?.confirmation_photo && [].concat(d.confirmation_photo).join(' ')) || D.assistanceActionFailed
    showToast(msg, 'error')
  }

  const submitConfirm = async () => {
    setBusy(true)
    try {
      const body = new FormData()
      if (photo) body.append('confirmation_photo', photo)
      if (note.trim()) body.append('confirmation_note', note.trim())
      await api.post(`/interventions/beneficiaries/${dialog.rec.id}/confirm-received/`, body)
      showToast(D.assistanceConfirmedToast, 'success')
      close(); reload()
    } catch (err) { failed(err) } finally { setBusy(false) }
  }

  const submitReport = async () => {
    if (!reason.trim()) { showToast(D.assistanceReasonRequired, 'error'); return }
    setBusy(true)
    try {
      await api.post(`/interventions/beneficiaries/${dialog.rec.id}/report-not-received/`, { non_receipt_reason: reason.trim() })
      showToast(D.assistanceReportedToast, 'success')
      close(); reload()
    } catch (err) { failed(err) } finally { setBusy(false) }
  }

  const rows = records || []
  const awaiting = rows.filter((r) => r.status === 'AWAITING_CONFIRMATION')
  const upcoming = rows.filter((r) => r.status === 'PENDING')
  const received = rows.filter((r) => ['CONFIRMED', 'NOT_RECEIVED', 'RESOLVED'].includes(r.status))

  const receivedPill = (rec) => (
    rec.status === 'NOT_RECEIVED' ? [A.notReceivedPill, 'NOT_RECEIVED']
      : rec.status === 'RESOLVED' ? [A.resolvedPill, 'RESOLVED'] : [A.confirmedPill, 'CONFIRMED']
  )

  const content = records === null ? (
    <p className="text-[14px] italic text-cz-text-2">{labels.common.loading}</p>
  ) : rows.length === 0 ? (
    <p className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-6 text-center text-[13px] italic text-cz-text-muted">
      {D.assistanceEmpty}
    </p>
  ) : (
    <div className="space-y-6 md:flex md:items-start md:gap-5 md:space-y-0">
      {awaiting.length > 0 && (
        <Section heading={A.awaitingHeading}>
          {awaiting.map((rec) => (
            <Card key={rec.id} rec={rec} tone="AWAITING" pill={A.awaitingPill} dateLine={shortDate(rec.date_given)}>
              <button
                type="button"
                onClick={() => setDialog({ kind: 'confirm', rec })}
                className="mt-3.5 w-full rounded-[8px] bg-cz-crop-header px-3 py-[11px] transition-opacity hover:opacity-90"
              >
                <span className="text-[13px] font-semibold text-white">{A.confirmCta}</span>
              </button>
              <button
                type="button"
                onClick={() => setDialog({ kind: 'report', rec })}
                className="mt-2 w-full rounded-[8px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg px-3 py-[11px] transition-opacity hover:opacity-90 md:w-auto md:px-4"
              >
                <span className="text-[13px] font-semibold text-cz-danger-accent">{A.notReceivedCta}</span>
              </button>
            </Card>
          ))}
        </Section>
      )}
      {upcoming.length > 0 && (
        <Section heading={A.upcomingHeading}>
          {upcoming.map((rec) => (
            <Card key={rec.id} rec={rec} tone="UPCOMING" pill={A.upcomingPill} dateLine={A.expectedOn(shortDate(rec.date_given))} />
          ))}
        </Section>
      )}
      {received.length > 0 && (
        <Section heading={A.receivedHeading}>
          {received.map((rec) => {
            const [pill, tone] = receivedPill(rec)
            return (
              <Card
                key={rec.id}
                rec={rec}
                tone={tone}
                pill={pill}
                dateLine={rec.confirmed_at ? A.confirmedOn(shortDate(rec.confirmed_at)) : shortDate(rec.date_given)}
              >
                {rec.status === 'NOT_RECEIVED' && (
                  <p className="mt-2.5 text-[12px] italic text-cz-text-2">{D.assistanceNotReceivedNote}</p>
                )}
              </Card>
            )
          })}
        </Section>
      )}
    </div>
  )

  const fieldClass = 'w-full rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3 py-2 text-[14px] text-cz-text focus:outline-none'
  const dialogButtons = (onSubmit, submitLabel, danger) => (
    <>
      <button type="button" onClick={close} className="rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-4 py-2 transition-colors hover:bg-cz-page">
        <span className="text-[13px] font-semibold text-cz-text">{A.cancel}</span>
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onSubmit}
        className={`rounded-[8px] px-4 py-2 transition-opacity hover:opacity-90 disabled:opacity-50 ${
          danger ? 'border-[0.5px] border-cz-danger-border bg-cz-danger-bg' : 'bg-cz-crop-header'
        }`}
      >
        <span className={`text-[13px] font-semibold ${danger ? 'text-cz-danger-accent' : 'text-white'}`}>{submitLabel}</span>
      </button>
    </>
  )

  const modal = dialog && (
    dialog.kind === 'confirm' ? (
      <ModalShell title={A.confirmTitle} onClose={close} maxWidth="max-w-xl" footer={dialogButtons(submitConfirm, A.confirm, false)}>
        <div className="space-y-4 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0">
          <label className="block">
            <span className="mb-1.5 block text-[13px] text-cz-text-2">{A.proofPhoto}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setPhoto(e.target.files?.[0] || null)}
              className={`${fieldClass} text-[13px]`}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] text-cz-text-2">{A.note}</span>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={fieldClass} />
          </label>
        </div>
      </ModalShell>
    ) : (
      <ModalShell title={A.reportTitle} onClose={close} maxWidth="max-w-xl" footer={dialogButtons(submitReport, A.submit, true)}>
        <label className="block">
          <span className="mb-1.5 block text-[13px] text-cz-text-2">{A.reason} <span className="text-cz-danger-accent">*</span></span>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass} />
        </label>
      </ModalShell>
    )
  )

  if (bare) {
    return (
      <div className="mx-auto w-full max-w-[980px] px-6 py-5">
        {content}
        {modal}
      </div>
    )
  }

  return (
    <CitizenScreen hasTabBar>
      <CitizenHomeHeader theme={CROP_THEME} />
      <CitizenBody className="!px-3 !pt-4">{content}</CitizenBody>
      {tabBar}
      {modal}
    </CitizenScreen>
  )
}
