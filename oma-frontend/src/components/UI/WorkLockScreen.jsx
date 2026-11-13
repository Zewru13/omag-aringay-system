import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Download, HardDriveDownload, History, Lock } from 'lucide-react'

// A screen that holds the whole system while something that must not be interrupted is going on (a backup being made or saved, a restore running): it covers
// everything, the menu and the top bar included, so nothing can be clicked, and the page behind it is made inert so the keyboard cannot reach it either.
// The box shows an emblem that fits the work (`variant`: 'backup', 'saving' or 'restore'): a spinning arc around a softly floating icon, with two rings
// spreading out of it. Every motion is in index.css (.work-*), uses transform and opacity only, and stands still when the person asks for less motion.
// It goes away when it is no longer rendered.
const EMBLEMS = {
  backup: HardDriveDownload,
  saving: Download,
  restore: History,
}

export default function WorkLockScreen({ title, message, variant = 'backup' }) {
  const Icon = EMBLEMS[variant] || HardDriveDownload

  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return undefined
    root.inert = true
    return () => { root.inert = false }
  }, [])

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="work-lock-title"
      className="work-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-[#0F2A1B]/55 p-4"
    >
      <div className="work-card w-full max-w-sm rounded-2xl border border-[#E2E8E2] bg-white px-6 pb-5 pt-7 text-center shadow-[0_18px_48px_rgba(15,42,27,0.28)]">
        <div className="relative mx-auto h-24 w-24" aria-hidden="true">
          <span className="work-ring absolute inset-2 rounded-full border-2 border-[#1B4D2E]" />
          <span className="work-ring work-ring-late absolute inset-2 rounded-full border-2 border-[#1B4D2E]" />
          <svg viewBox="0 0 96 96" className="work-arc absolute inset-0 h-full w-full">
            <circle cx="48" cy="48" r="44" fill="none" stroke="#E2E8E2" strokeWidth="4" />
            <circle cx="48" cy="48" r="44" fill="none" stroke="#1B4D2E" strokeWidth="4" strokeLinecap="round" strokeDasharray="70 207" />
          </svg>
          <span className="absolute inset-[14px] flex items-center justify-center rounded-full bg-[#EBF5EE]">
            <Icon size={30} strokeWidth={1.75} className="work-icon text-[#1B4D2E]" />
          </span>
        </div>

        <h2 id="work-lock-title" className="mt-5 text-[16px] font-semibold text-[#1A2B1A]">
          {title}
          <span className="ml-0.5 inline-flex gap-[2px] align-baseline" aria-hidden="true">
            <span className="work-dot">.</span><span className="work-dot">.</span><span className="work-dot">.</span>
          </span>
        </h2>
        <p className="mt-1 text-[13px] text-[#4A5E4A]">{message}</p>

        <p className="mt-5 flex items-center justify-center gap-1.5 rounded-lg bg-[#F6FAF7] px-3 py-2 text-[12.5px] font-medium text-[#1B4D2E]">
          <Lock size={13} aria-hidden="true" className="shrink-0" />
          Please wait. Do not close or leave this page until it is finished.
        </p>
      </div>
    </div>,
    document.body,
  )
}
