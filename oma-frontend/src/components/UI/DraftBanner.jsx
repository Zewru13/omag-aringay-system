import { History } from 'lucide-react'

// Shown at the top of a long form when its unsaved draft was restored (see hooks/useDraftState.js): says so and offers a fresh start.
export default function DraftBanner({ draft, className = '' }) {
  if (!draft?.restored) return null
  return (
    <div role="status" className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900 ${className}`}>
      <History size={15} className="flex-none" aria-hidden="true" />
      <span className="min-w-0 flex-1">Your unsaved draft was restored, so you can pick up where you left off.</span>
      <button type="button" onClick={draft.discard} className="font-semibold underline underline-offset-2 hover:text-amber-950">Discard draft</button>
    </div>
  )
}
