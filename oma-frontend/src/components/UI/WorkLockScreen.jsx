import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'

// A screen that holds the whole system while something that must not be interrupted is going on (a backup being made or saved, a restore running): it covers
// everything, the menu and the top bar included, so nothing can be clicked, and the page behind it is made inert so the keyboard cannot reach it either.
// It goes away when it is no longer rendered.
export default function WorkLockScreen({ title, message }) {
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
        <Loader2 size={30} className="mx-auto animate-spin text-[#1B4D2E]" aria-hidden="true" />
        <h2 id="work-lock-title" className="mt-3 text-[15px] font-semibold text-[#1A2B1A]">{title}</h2>
        <p className="mt-1 text-[13px] text-[#4A5E4A]">{message}</p>
        <p className="mt-3 text-[13px] font-medium text-[#1A2B1A]">Please wait. Do not close or leave this page until it is finished.</p>
      </div>
    </div>,
    document.body,
  )
}
