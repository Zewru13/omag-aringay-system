import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../api/axiosInstance.js'

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000   // keep the 10-min server lease alive
const STATUS_POLL_INTERVAL_MS = 5 * 1000      // while blocked, watch for release/expiry
const TICK_INTERVAL_MS = 1000                  // local countdown display

/**
 * Acquires a record lock while `active` is true (e.g. an "Add Log" form is
 * open), heartbeats it every 2 minutes, and releases it when the form
 * closes/unmounts or `active` goes false. If someone else holds the lock,
 * polls status so the caller can auto-recover once it frees up.
 *
 * record_type/record_id must match the backend's RecordLock discriminator
 * ("crop" | "stocking").
 */
export default function useRecordLock(recordType, recordId, active) {
  const [isMine, setIsMine] = useState(false)
  const [lockedByOther, setLockedByOther] = useState(null) // { id, name } | null
  const [secondsRemaining, setSecondsRemaining] = useState(0)

  const isMineRef = useRef(false)
  const timersRef = useRef({ heartbeat: null, poll: null, tick: null })

  const clearTimers = () => {
    clearInterval(timersRef.current.heartbeat)
    clearInterval(timersRef.current.poll)
    clearInterval(timersRef.current.tick)
  }

  const release = useCallback(() => {
    if (!recordId) return
    // Fire-and-forget — closing the form shouldn't wait on this.
    api.post('/locks/release/', { record_type: recordType, record_id: recordId }).catch(() => {})
    isMineRef.current = false
  }, [recordType, recordId])

  const tryAcquire = useCallback(async () => {
    if (!recordId) return
    try {
      await api.post('/locks/acquire/', { record_type: recordType, record_id: recordId })
      isMineRef.current = true
      setIsMine(true)
      setLockedByOther(null)
      setSecondsRemaining(0)
    } catch (err) {
      if (err.response?.status === 409) {
        const d = err.response.data
        isMineRef.current = false
        setIsMine(false)
        setLockedByOther(d.locked_by || null)
        setSecondsRemaining(d.expires_in_seconds ?? 0)
      }
    }
  }, [recordType, recordId])

  const checkStatus = useCallback(async () => {
    if (!recordId) return
    try {
      const r = await api.get('/locks/status/', { params: { record_type: recordType, record_id: recordId } })
      if (!r.data.locked) {
        tryAcquire()
      } else {
        setLockedByOther(r.data.locked_by || null)
        setSecondsRemaining(r.data.expires_in_seconds ?? 0)
      }
    } catch { /* transient — next poll will retry */ }
  }, [recordType, recordId, tryAcquire])

  // Acquire on activation, release on deactivation/unmount.
  useEffect(() => {
    if (!active || !recordId) return undefined
    tryAcquire()
    return () => { clearTimers(); release() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, recordId])

  // Heartbeat while ours; poll status while someone else holds it.
  useEffect(() => {
    clearTimers()
    if (!active || !recordId) return undefined

    if (isMine) {
      timersRef.current.heartbeat = setInterval(async () => {
        try {
          await api.post('/locks/heartbeat/', { record_type: recordType, record_id: recordId })
        } catch (err) {
          if (err.response?.status === 409) {
            const d = err.response.data
            isMineRef.current = false
            setIsMine(false)
            setLockedByOther(d.locked_by || null)
            setSecondsRemaining(d.expires_in_seconds ?? 0)
          }
        }
      }, HEARTBEAT_INTERVAL_MS)
    } else if (lockedByOther) {
      timersRef.current.poll = setInterval(checkStatus, STATUS_POLL_INTERVAL_MS)
      timersRef.current.tick = setInterval(() => {
        setSecondsRemaining(s => Math.max(0, s - 1))
      }, TICK_INTERVAL_MS)
    }

    return clearTimers
  }, [active, recordId, recordType, isMine, lockedByOther, checkStatus])

  // Best-effort release on tab close. sendBeacon can't set an Authorization
  // header, so the access token rides in the beacon body instead and is
  // validated server-side. If this never fires, the 10-minute lease expiry
  // is the real backstop.
  useEffect(() => {
    if (!active || !recordId) return undefined
    const handler = () => {
      if (!isMineRef.current || !navigator.sendBeacon) return
      const token = localStorage.getItem('accessToken')
      if (!token) return
      const body = JSON.stringify({ record_type: recordType, record_id: recordId, access_token: token })
      const base = api.defaults.baseURL.replace(/\/$/, '')
      navigator.sendBeacon(`${base}/locks/release-beacon/`, new Blob([body], { type: 'application/json' }))
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [active, recordId, recordType])

  return { isMine, lockedByOther, secondsRemaining, release, retryAcquire: tryAcquire }
}
