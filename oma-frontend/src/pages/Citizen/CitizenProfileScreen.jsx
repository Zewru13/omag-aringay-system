import { useEffect, useState } from 'react'
import { Hourglass, IdCard, MapPin, Phone, ShieldCheck, SquarePen } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import { labels } from './labels.js'
import { CROP_THEME, CitizenBody, CitizenScreen, CitizenSubHeader, FISH_THEME } from './citizenUI.jsx'

// ─── Aking Profile (frames 13, 14, 31) ────────────────────────────────────
// Everything shown comes from /accounts/me/'s `linked_record`, which only
// ever resolves the caller's OWN record, so this screen adds no new data
// access. What is new against the previous version is the reference's own
// structure: an identity card straddling the header, one card per field,
// the immutability note on RSBSA, and the pending-change panel.
//
// PENDING CHANGES. ProfileChangeRequest and its citizen endpoint have
// existed since the profile self-service batch and were never surfaced
// anywhere in the UI -- a citizen could have a request sitting in the staff
// queue with no way to see it. Frame 31 draws exactly that panel, so it is
// wired here against /profile/change-requests/.
//
// HIDE-EMPTY RULE, kept from the previous version: a field renders only when
// its value is real. 'Unspecified' is a stored choice meaning "not
// determined from the import source", not a person's answer, so it counts as
// empty. civil_status is 'Unspecified' for 3556 of 3568 farmers and
// highest_education is blank for essentially everyone -- rendering
// placeholders would bury the two or three fields that ARE real.

const BLANK = new Set(['', 'Unspecified'])
const hasValue = (v) => v !== null && v !== undefined && !BLANK.has(String(v).trim())

const initialsOf = (rec) => {
  const a = (rec?.first_name || '').trim()[0] || ''
  const b = (rec?.middle_name || rec?.last_name || '').trim()[0] || ''
  return (a + b).toUpperCase() || '—'
}

const NAME_FIELDS = ['first_name', 'middle_name', 'last_name']

function Field({ icon: Icon, label, value, note, pending }) {
  const P = labels.ffNew.profile
  return (
    <div className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface px-4 py-3.5">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">
        {Icon && <Icon size={14} className="shrink-0 text-cz-text-muted" aria-hidden="true" />}
        {label}
      </p>
      <p className="mt-1.5 text-[16px] font-semibold leading-[1.35] text-cz-text">{value}</p>
      {note && <p className="mt-1 text-[12.5px] leading-[1.5] text-cz-text-2">{note}</p>}
      {pending && (
        <div className="mt-3 rounded-[10px] border-[0.5px] border-cz-warn-accent/30 bg-cz-warn-bg px-3.5 py-3">
          <p className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-cz-warn-accent">
            <Hourglass size={14} aria-hidden="true" />
            {P.pendingHeading}
          </p>
          <p className="text-[13px] leading-[1.5] text-cz-text">
            {P.pendingRequested(pending.requested_value)}
          </p>
          <p className="text-[13px] leading-[1.5] text-cz-text-2">
            {P.pendingSubmitted(labels.common.formatDate(String(pending.requested_at).slice(0, 10)))}
          </p>
          <p className="mt-1.5 text-[12.5px] leading-[1.5] text-cz-text-2">{P.pendingNote}</p>
        </div>
      )}
    </div>
  )
}

function EditSheet({ theme, record, pendingFields, onClose, onSaved }) {
  const P = labels.ffNew.profile
  const { showToast } = useToast()
  const [form, setForm] = useState({
    contact_number: record?.contact_number || '',
    first_name: record?.first_name || '',
    middle_name: record?.middle_name || '',
    last_name: record?.last_name || '',
    barangay: record?.barangay || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const FIELD = 'w-full rounded-[10px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3.5 py-[13px] text-[15px] text-cz-text focus:outline-none disabled:opacity-50'

  const submit = async () => {
    setSaving(true)
    let did = false
    try {
      // Contact number is a direct edit on the record; name and barangay are
      // not, so they go through the change-request queue. Both paths already
      // existed server-side -- neither is invented here.
      if ((form.contact_number || '') !== (record?.contact_number || '')) {
        await api.patch('/profile/contact-number/', { contact_number: form.contact_number })
        did = true
        showToast(P.editContactSaved, 'success')
      }
      for (const f of [...NAME_FIELDS, 'barangay']) {
        if (pendingFields.has(f)) continue
        if ((form[f] || '') === (record?.[f] || '')) continue
        await api.post('/profile/change-requests/', { field_name: f, requested_value: form[f] })
        did = true
      }
      if (!did) { showToast(P.editNothing, 'info'); setSaving(false); return }
      showToast(P.editSubmitted, 'success')
      onSaved?.()
      onClose()
    } catch (err) {
      const d = err?.response?.data
      const msg = typeof d === 'string' ? d
        : Object.values(d || {}).flat().join(' ') || labels.common.genericSaveError
      showToast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-t-[16px] bg-cz-page p-5 sm:rounded-[16px]">
        <h2 className="text-[19px] font-bold text-cz-text">{P.editTitle}</h2>
        <p className="mt-1 mb-4 text-[13px] leading-[1.5] text-cz-text-2">{P.editSubtitle}</p>

        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{P.editContactLabel}</p>
        <input
          type="tel"
          value={form.contact_number}
          onChange={(e) => set('contact_number', e.target.value)}
          className={FIELD}
        />
        <p className="mt-1 mb-5 text-[12px] text-cz-text-2">{P.editContactNote}</p>

        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{P.editReviewHeading}</p>
        <p className="mt-1 mb-3 text-[12.5px] leading-[1.5] text-cz-text-2">{P.editReviewNote}</p>

        {[
          ['first_name', P.editFirstName],
          ['middle_name', P.editMiddleName],
          ['last_name', P.editLastName],
          ['barangay', P.editBarangay],
        ].map(([key, label]) => (
          <div key={key} className="mb-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{label}</p>
            <input
              type="text"
              value={form[key]}
              disabled={pendingFields.has(key)}
              onChange={(e) => set(key, e.target.value)}
              className={FIELD}
            />
            {pendingFields.has(key) && (
              <p className="mt-1 text-[12px] text-cz-warn-accent">{P.editPendingBlocked}</p>
            )}
          </div>
        ))}

        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-[10px] border-[0.5px] border-cz-border-strong bg-cz-surface py-[13px] text-[14px] font-medium text-cz-text-2"
          >
            {P.editCancel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className={`flex-1 rounded-[10px] py-[13px] text-[14px] font-semibold disabled:opacity-50 ${theme.solidBtn}`}
          >
            {P.editSave}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CitizenProfileScreen({ record, recordType, onBack, tabBar, bare = false }) {
  const P = labels.ffNew.profile
  const isFisherfolk = recordType === 'FISHERFOLK'
  const theme = isFisherfolk ? FISH_THEME : CROP_THEME

  const [requests, setRequests] = useState([])
  const [editing, setEditing] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    api.get('/profile/change-requests/')
      .then((r) => {
        if (cancelled) return
        const rows = Array.isArray(r.data) ? r.data : (r.data?.results || [])
        setRequests(rows.filter((x) => x.status === 'PENDING'))
      })
      .catch(() => { if (!cancelled) setRequests([]) })
    return () => { cancelled = true }
  }, [reloadKey])

  const pendingFor = (field) => requests.find((r) => r.field_name === field) || null
  const pendingFields = new Set(requests.map((r) => r.field_name))
  // The reference attaches the panel to BUONG PANGALAN as a whole, so any of
  // the three name parts being under review surfaces there.
  const pendingName = NAME_FIELDS.map(pendingFor).find(Boolean) || null

  const fullName = [record?.first_name, record?.middle_name, record?.last_name]
    .filter(Boolean).join(' ') || record?.label || labels.common.unknown

  const body = (
    <>
      <div className={bare ? 'rounded-t-[12px] px-4 py-4 ' + theme.header : `${theme.header} px-4 pb-12 sm:px-6`}>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-2 rounded-[10px] border-[0.5px] border-white/40 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/10"
          >
            <SquarePen size={15} aria-hidden="true" />
            {P.editCta}
          </button>
        </div>
      </div>

      <CitizenBody className={bare ? '!px-0' : '-mt-10'}>
        <div className="mb-4 flex items-center gap-4 rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface px-4 py-4">
          <div className={`flex h-[62px] w-[62px] shrink-0 items-center justify-center overflow-hidden rounded-full ${theme.circleBg}`}>
            {record?.profile_picture_url
              ? <img src={record.profile_picture_url} alt="" className="h-full w-full object-cover" />
              : <span className={`text-[20px] font-bold ${theme.circleIcon}`}>{initialsOf(record)}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[19px] font-bold leading-[1.2] text-cz-text">{fullName}</p>
            {hasValue(record?.rsbsa_number) && (
              <p className="mt-0.5 text-[13.5px] text-cz-text-2">{record.rsbsa_number}</p>
            )}
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-cz-status-good-bg px-3 py-1 text-[12.5px] font-semibold text-cz-status-good-fg">
              <ShieldCheck size={13} aria-hidden="true" />
              {isFisherfolk ? P.verifiedFisherfolk : P.verifiedFarmer}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {hasValue(record?.rsbsa_number) && (
            <Field icon={IdCard} label={P.rsbsa} value={record.rsbsa_number} note={P.rsbsaNote} />
          )}
          <Field icon={IdCard} label={P.fullName} value={fullName} pending={pendingName} />
          {hasValue(record?.barangay) && (
            <Field icon={MapPin} label={P.barangay} value={record.barangay} pending={pendingFor('barangay')} />
          )}
          {hasValue(record?.contact_number) && (
            <Field icon={Phone} label={P.contact} value={record.contact_number} />
          )}

          {isFisherfolk && [record?.fishr_number, record?.lgu_registration_number, record?.fisherfolk_type]
            .some(hasValue) && (
            <div className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface px-4 py-3.5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">
                {P.extraHeading}
              </p>
              {[
                [P.fishr, record?.fishr_number],
                [P.lguReg, record?.lgu_registration_number],
                [P.activityType, record?.fisherfolk_type],
              ].filter(([, v]) => hasValue(v)).map(([label, value]) => (
                <div key={label} className="mb-2.5 last:mb-0">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{label}</p>
                  <p className="mt-0.5 text-[15px] font-semibold text-cz-text">{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-[12.5px] leading-[1.6] text-cz-text-muted">
          {P.footerLine1}
          <br />
          {P.footerLine2}
        </p>
      </CitizenBody>

      {editing && (
        <EditSheet
          theme={theme}
          record={record}
          pendingFields={pendingFields}
          onClose={() => setEditing(false)}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}
    </>
  )

  if (bare) return body

  return (
    <CitizenScreen hasTabBar>
      <CitizenSubHeader
        theme={theme}
        title={P.title}
        subtitle={P.subtitle}
        onBack={onBack}
      />
      {body}
      {tabBar}
    </CitizenScreen>
  )
}
