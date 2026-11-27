import { useCallback, useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { approvalLines, hasApproved, waitingText } from '../../utils/approvalStatus.js'
import { formatDateTime } from '../../utils/dateFormat.js'
import ModalShell from '../ui/ModalShell.jsx'
import { RECORD_TYPE_TITLES, isChangeRequestNotice, notificationTitle, requestForNotification } from './notificationDetails.js'

// The window every notification opens: what happened and when, a button to the page it is about, and, for a request to change
// registry details, the current and requested value with Approve / Reject for the staff. It also opens straight from the bell's
// "Needs action" list, where there is a request and no notice.

const BUTTON = 'press-scale min-h-[40px] cursor-pointer rounded-[var(--radius-sm)] px-4 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50'
const PRIMARY = `${BUTTON} bg-primary text-white hover:opacity-90`
const PLAIN = `${BUTTON} border border-border-strong text-text-secondary hover:bg-surface-2`
const APPROVE = `${BUTTON} bg-[color:var(--color-semantic-safe)] text-white hover:opacity-90`
const REJECT = `${BUTTON} border border-[color:var(--color-semantic-critical)] text-[color:var(--color-semantic-critical)] hover:bg-surface-2`
const CELL = 'break-words border border-border px-3 py-2 text-left align-top text-[13px]'

function errorText(error) {
  const data = error?.response?.data
  if (Array.isArray(data)) return data.join(' ')
  return data?.detail || 'That did not go through. Check your connection and try again.'
}

function statusText(request) {
  if (request.status === 'PENDING') return waitingText(request)
  const word = request.status === 'APPROVED' ? 'Approved' : 'Rejected'
  const by = request.reviewed_by_name ? ` by ${request.reviewed_by_name}` : ''
  return `${word}${by} on ${formatDateTime(request.reviewed_at, { empty: 'an earlier date' })}`
}

function ChangeRequestDetails({ request }) {
  const pending = request.status === 'PENDING'
  return (
    <div className="flex flex-col gap-3">
      <table className="w-full table-fixed border-collapse text-text-primary">
        <thead>
          <tr className="bg-surface-2">
            <th className={`${CELL} font-semibold`}>Field</th>
            <th className={`${CELL} font-semibold`}>{pending ? 'Current' : 'Previous'}</th>
            <th className={`${CELL} font-semibold`}>Requested</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={`${CELL} capitalize`}>{request.field_label}</td>
            <td className={CELL}>{request.old_value || '—'}</td>
            <td className={`${CELL} font-semibold`}>{request.requested_value || '—'}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-[12.5px] text-text-muted">
        Asked by {request.requested_by_name || 'the account holder'} on {formatDateTime(request.requested_at)}
      </p>
      <p className="text-[13px] font-semibold text-text-primary" data-testid="request-status">{statusText(request)}</p>
      {request.requires_both && (
        <ul className="text-[12.5px] text-text-secondary" data-testid="approval-lines">
          {approvalLines(request).map(line => (
            <li key={line.role}>{line.done ? `${line.role}: approved ${line.by ? `by ${line.by}` : ''}` : `${line.role}: not yet approved`}</li>
          ))}
        </ul>
      )}
      {request.status === 'REJECTED' && request.rejection_reason && (
        <p className="break-words text-[13px] text-text-secondary">Reason: {request.rejection_reason}</p>
      )}
    </div>
  )
}

function NotificationDetailsWindow({ notification, request: opened, role, action, onAction, onClose, onDecided }) {
  const staff = role === 'ADMIN' || role === 'EVALUATOR'
  const aboutRequest = Boolean(opened) || isChangeRequestNotice(notification)
  const [request, setRequest] = useState(opened || null)
  // 'loading' | 'ready' | 'missing' | 'failed'
  const [state, setState] = useState(aboutRequest && !opened ? 'loading' : 'ready')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const recordType = notification?.record_type || opened?.linked_record_type
  const recordId = notification?.record_id || opened?.linked_record_id

  const fetchRequests = useCallback(async () => {
    const r = staff
      ? await api.get('/staff/change-requests/', { params: { status: 'ALL', record_type: recordType, record_id: recordId } })
      : await api.get('/profile/change-requests/')
    return Array.isArray(r.data) ? r.data : r.data?.results || []
  }, [staff, recordType, recordId])

  const show = useCallback((list) => {
    const found = opened ? list.find(r => r.id === opened.id) : requestForNotification(notification, list)
    setRequest(found || null)
    setState(found ? 'ready' : 'missing')
  }, [notification, opened])
  // What was opened from the list is still worth showing when the fresh copy cannot be loaded.
  const showFailure = useCallback(() => setState(opened ? 'ready' : 'failed'), [opened])
  const load = () => fetchRequests().then(show, showFailure)

  useEffect(() => {
    if (aboutRequest) fetchRequests().then(show, showFailure)
  }, [aboutRequest, fetchRequests, show, showFailure])

  const decide = async (choice) => {
    setBusy(choice)
    setError('')
    try {
      const body = choice === 'reject' ? { rejection_reason: reason.trim() } : {}
      const r = await api.post(`/staff/change-requests/${request.id}/${choice}/`, body)
      setRequest(r.data)
      if (choice === 'reject') setDone('Request rejected. The requester has been told.')
      else setDone(r.data.status === 'APPROVED' ? 'Approved. The record is updated and the requester has been told.' : 'Your approval is saved.')
    } catch (e) {
      setError(errorText(e))
      await load()   // someone else may have decided it first
    } finally {
      setBusy('')
      onDecided?.()
    }
  }

  const canDecide = staff && state === 'ready' && request?.status === 'PENDING'
  const alreadyApproved = canDecide && hasApproved(request, role)
  const title = notification ? notificationTitle(notification) : 'Profile Change Request'
  // Automatic (system) notices with a title read as a sentence on their own.
  const showActor = notification && (notification.actor || !RECORD_TYPE_TITLES[notification.record_type])

  const footer = (
    <div className="flex w-full flex-wrap justify-end gap-2">
      {canDecide && (
        <>
          <button type="button" className={REJECT} disabled={Boolean(busy)} onClick={() => decide('reject')}>
            {busy === 'reject' ? 'Rejecting…' : 'Reject'}
          </button>
          <button type="button" className={APPROVE} disabled={Boolean(busy) || alreadyApproved} onClick={() => decide('approve')}>
            {busy === 'approve' ? 'Approving…' : 'Approve'}
          </button>
        </>
      )}
      {action && <button type="button" className={canDecide ? PLAIN : PRIMARY} onClick={() => onAction(action.to)}>{action.label}</button>}
      <button type="button" className={PLAIN} onClick={onClose}>Close</button>
    </div>
  )

  return (
    <ModalShell
      title={title} subtitle={aboutRequest ? request?.record_label || notification?.record_label : undefined}
      icon={Bell} onClose={onClose} footer={footer} maxWidth="max-w-lg"
    >
      <div className="flex flex-col gap-4">
        {notification && (
          <div>
            <p className="break-words text-[14px] leading-relaxed text-text-primary">
              {showActor && <><span className="font-semibold">{notification.actor_name}</span>{' '}</>}
              {notification.verb}
              {/* A change-request notice is labelled with the record's name, which the window's heading already shows. */}
              {!aboutRequest && <>{' '}<span className="font-medium">{notification.record_label}</span></>}
            </p>
            {notification.detail && <p className="mt-1 break-words text-[13.5px] text-text-secondary">{notification.detail}</p>}
            <p className="mt-2 text-[12.5px] text-text-muted">{formatDateTime(notification.created_at)}</p>
          </div>
        )}

        {aboutRequest && state === 'loading' && <p className="text-[13px] text-text-muted">Loading the request…</p>}
        {aboutRequest && state === 'missing' && <p className="text-[13px] text-text-muted">The details of this change request are no longer available.</p>}
        {aboutRequest && state === 'failed' && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] text-[color:var(--color-semantic-critical)]">The request could not be loaded.</p>
            <button type="button" className={PLAIN} onClick={() => { setState('loading'); load() }}>Try again</button>
          </div>
        )}
        {aboutRequest && state === 'ready' && request && <ChangeRequestDetails request={request} />}

        {canDecide && (
          <label className="block">
            <span className="text-[12.5px] font-semibold text-text-secondary">Reason for rejecting (optional)</span>
            <textarea
              rows={2} maxLength={255} value={reason} onChange={e => setReason(e.target.value)}
              className="mt-1 w-full resize-none rounded-[var(--radius-sm)] border border-border-strong px-3 py-2 text-[13px] text-text-primary"
              placeholder="Shown to the person who asked"
            />
          </label>
        )}
        {alreadyApproved && !done && <p className="text-[12.5px] text-text-muted">You already approved this request.</p>}
        {done && <p className="text-[13px] font-semibold text-[color:var(--color-semantic-safe)]" role="status">{done}</p>}
        {error && <p className="text-[13px] text-[color:var(--color-semantic-critical)]" role="alert">{error}</p>}
      </div>
    </ModalShell>
  )
}

export default NotificationDetailsWindow
