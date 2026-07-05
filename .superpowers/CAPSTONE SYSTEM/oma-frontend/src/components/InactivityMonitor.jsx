import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

const IDLE_TIMEOUT_MS = 20 * 60 * 1000   // 20 minutes
const WARNING_BEFORE_MS = 60 * 1000       // warn 60 s before logout

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll']

function WarningModal({ secondsLeft, onStayLoggedIn }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-yellow-100">
            <svg className="h-8 w-8 text-yellow-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
        </div>

        <h2 className="text-center text-xl font-bold text-slate-900">Session Expiring Soon</h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          Your session will expire soon due to inactivity.
        </p>

        <div className="my-5 flex flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-yellow-400 bg-yellow-50">
            <span className="text-2xl font-bold tabular-nums text-yellow-700">{secondsLeft}</span>
          </div>
          <p className="mt-2 text-xs font-medium text-slate-500">seconds remaining</p>
        </div>

        <button
          className="w-full rounded-lg bg-[#16a34a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#15803d]"
          onClick={onStayLoggedIn}
          type="button"
        >
          Stay Logged In
        </button>
      </div>
    </div>
  )
}

function InactivityMonitor({ children }) {
  const { isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()

  const [showWarning, setShowWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(Math.floor(WARNING_BEFORE_MS / 1000))

  const warningTimerRef = useRef(null)
  const logoutTimerRef = useRef(null)
  const countdownRef = useRef(null)

  const clearAllTimers = useCallback(() => {
    clearTimeout(warningTimerRef.current)
    clearTimeout(logoutTimerRef.current)
    clearInterval(countdownRef.current)
  }, [])

  const performLogout = useCallback(async () => {
    clearAllTimers()
    setShowWarning(false)
    await logout()
    navigate('/login', { state: { inactivityLogout: true }, replace: true })
  }, [logout, navigate, clearAllTimers])

  const startTimers = useCallback(() => {
    clearAllTimers()
    setShowWarning(false)

    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true)
      setSecondsLeft(Math.floor(WARNING_BEFORE_MS / 1000))

      countdownRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(countdownRef.current)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }, IDLE_TIMEOUT_MS - WARNING_BEFORE_MS)

    logoutTimerRef.current = setTimeout(() => {
      performLogout()
    }, IDLE_TIMEOUT_MS)
  }, [clearAllTimers, performLogout])

  const resetTimers = useCallback(() => {
    startTimers()
  }, [startTimers])

  const handleStayLoggedIn = useCallback(() => {
    setShowWarning(false)
    resetTimers()
  }, [resetTimers])

  useEffect(() => {
    if (!isAuthenticated) return

    startTimers()

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, resetTimers, { passive: true })
    })

    return () => {
      clearAllTimers()
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, resetTimers)
      })
    }
  }, [isAuthenticated, startTimers, resetTimers, clearAllTimers])

  // When countdown hits 0, log out
  useEffect(() => {
    if (showWarning && secondsLeft === 0) {
      performLogout()
    }
  }, [showWarning, secondsLeft, performLogout])

  return (
    <>
      {children}
      {isAuthenticated && showWarning && (
        <WarningModal secondsLeft={secondsLeft} onStayLoggedIn={handleStayLoggedIn} />
      )}
    </>
  )
}

export default InactivityMonitor
