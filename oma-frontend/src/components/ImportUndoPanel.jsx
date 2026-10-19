import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react'
import api from '../api/axiosInstance.js'
import Button from './UI/Button.jsx'
import StatusPill from './UI/StatusPill.jsx'
import { sliceIds, summarizePlan, summarizeResults, undoNote } from '../utils/importUndo.js'

// "Undo a recent import" for every import except the RSBSA registry (which has RsbsaUndoPanel). Backend:
// core/import_batch_views.py. The server decides what is safe: a record the import added is removed only if nobody has
// edited it since and nothing else depends on it; anything else is kept and the reason is shown here. Nothing changes
// until the person confirms, and undo runs in slices of 100, safe to repeat after an interruption.

const fmtDate = (iso) => (iso
  ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
  : '—')

const ERROR_BOX = 'rounded-lg border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-[13px] font-medium text-[#991B1B]'

export default function ImportUndoPanel({ type, onChanged }) {
  const [batches, setBatches] = useState(null)
  const [batchId, setBatchId] = useState(null)
  const [plan, setPlan] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [outcome, setOutcome] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (batchId) return undefined
    let cancelled = false
    api.get('/imports/batches/', { params: { type } })
      .then((r) => { if (!cancelled) setBatches(r.data.batches) })
      .catch(() => { if (!cancelled) { setBatches([]); setError('Could not load the recent imports.') } })
    return () => { cancelled = true }
  }, [batchId, type])

  useEffect(() => {
    if (!batchId) return undefined
    let cancelled = false
    api.get(`/imports/batches/${batchId}/undo-plan/`)
      .then((r) => { if (!cancelled) setPlan(r.data) })
      .catch((err) => { if (!cancelled) setError(err?.response?.data?.detail || 'Could not work out what undoing this import would do.') })
    return () => { cancelled = true }
  }, [batchId])

  // Switching batch resets the view here (in the handler), not in an effect.
  const openBatch = (id) => { setPlan(null); setOutcome(null); setError(''); setBatchId(id) }
  const backToList = () => { setBatchId(null); setBatches(null); setPlan(null); setOutcome(null); setError('') }

  const itemIds = plan ? plan.items.filter((i) => i.can_undo).map((i) => i.item_id) : []

  const runUndo = async () => {
    const results = []
    setBusy(true); setError('')
    setProgress({ done: 0, total: itemIds.length })
    try {
      for (const slice of sliceIds(itemIds)) {
        const r = await api.post(`/imports/batches/${batchId}/undo/`, { item_ids: slice })
        results.push(...r.data.results)
        setProgress({ done: results.length, total: itemIds.length })
      }
    } catch (err) {
      setError(`${err?.response?.data?.detail || 'The undo was interrupted.'} ${results.filter((x) => x.result === 'removed' || x.result === 'restored').length} record(s) were already reversed — open Undo again to see what is left.`)
    } finally {
      setBusy(false); setProgress(null)
      if (results.length) {
        setOutcome(summarizeResults(results))
        onChanged?.()
      }
    }
  }

  if (!batchId) {
    return (
      <div className="stagger-item space-y-3">
        <p className="text-[13px] text-[#4A5A4C]">
          Pick a recent import (last 30 days) to review. Nothing is changed until you confirm on the next screen, and
          anything that can't be undone safely is kept.
        </p>
        {batches === null && !error && <p className="text-[13px] italic text-[#7A8E7A]">Loading recent imports…</p>}
        {batches && batches.length === 0 && !error && (
          <p className="text-[13px] italic text-[#7A8E7A]">No imports of this kind have been committed in the last 30 days.</p>
        )}
        <div className="divide-y divide-[#F0F4F0] rounded-2xl border border-[#E2E8E2] bg-white">
          {(batches || []).map((b) => (
            <div key={b.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[#1A2B1A]">{fmtDate(b.created_at)}{b.performed_by_name ? ` · ${b.performed_by_name}` : ''}</p>
                <p className="mt-0.5 break-words text-[12px] text-[#7A8E7A]">
                  {b.label ? `${b.label} · ` : ''}{b.row_count} record{b.row_count === 1 ? '' : 's'} added
                </p>
              </div>
              {b.undone
                ? <StatusPill tone="slate">Undone</StatusPill>
                : <Button type="button" variant="outline" className="max-sm:w-full" onClick={() => openBatch(b.id)}>Review undo</Button>}
            </div>
          ))}
        </div>
        {error && <p className={ERROR_BOX}>{error}</p>}
      </div>
    )
  }

  const counts = plan ? summarizePlan(plan.items) : null
  const note = undoNote(type)

  return (
    <div className="stagger-item space-y-4">
      <button type="button" onClick={backToList} className="min-h-[44px] text-[13px] font-medium text-[#7A8E7A] hover:text-[#1A2B1A]">
        ← Back to recent imports
      </button>

      {!plan && !error && <p className="text-[13px] italic text-[#7A8E7A]">Working out what undoing this import would do…</p>}
      {error && <p className={ERROR_BOX}>{error}</p>}

      {outcome && (
        <div className="flex items-start gap-3 rounded-2xl border border-[#BFE3CC] bg-[#EBF5EE] p-4">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[#1E5637]" aria-hidden="true" />
          <p className="text-[13px] text-[#1A2B1A]">
            <span className="font-semibold">Undo finished.</span> {outcome.removed} record{outcome.removed === 1 ? '' : 's'} removed
            {outcome.restored > 0 && `, ${outcome.restored} restored`}
            {outcome.kept > 0 && `, ${outcome.kept} kept because they changed or are in use`}.
          </p>
        </div>
      )}

      {plan && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[['Will be removed', counts.canUndo], ['Kept (not safe to undo)', counts.kept]].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[#E2E8E2] bg-white px-3 py-3">
                <p className="text-[20px] font-semibold text-[#1A2B1A]">{value}</p>
                <p className="mt-0.5 text-[11px] text-[#7A8E7A]">{label}</p>
              </div>
            ))}
          </div>

          {itemIds.length > 0 && !outcome && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
              <p className="text-[13px] text-amber-800">
                Only records nobody has edited since the import, and that nothing else depends on, are removed.
                {note ? ` ${note}` : ''}
                {itemIds.length > 100 && ' Done in slices of 100; keep this window open.'}
              </p>
            </div>
          )}

          <div className="max-h-72 divide-y divide-[#F0F4F0] overflow-y-auto rounded-2xl border border-[#E2E8E2] bg-white">
            {plan.items.map((it) => (
              <div key={it.item_id} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 break-words text-[13px] font-medium text-[#1A2B1A]">{it.label}</p>
                  <StatusPill tone={it.can_undo ? 'rose' : 'slate'}>{it.can_undo ? 'Remove' : 'Keep'}</StatusPill>
                </div>
                {it.reason && <p className="mt-0.5 text-[12px] text-[#7A8E7A]">{it.reason}</p>}
              </div>
            ))}
            {plan.items.length === 0 && <p className="px-4 py-6 text-center text-[13px] italic text-[#7A8E7A]">Nothing left to undo in this import.</p>}
          </div>

          {progress && (
            <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] font-medium text-sky-800">
              Undoing… {progress.done} of {progress.total} records. Please keep this window open.
            </p>
          )}

          {itemIds.length > 0 && !outcome && (
            <div className="flex justify-end">
              <Button type="button" isLoading={busy} className="max-sm:w-full" onClick={runUndo}>
                <RotateCcw size={14} className="mr-1.5" aria-hidden="true" />
                Undo {itemIds.length} record{itemIds.length === 1 ? '' : 's'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// The line shown in an import dialog that opens the panel, same wording and look as the RSBSA import's.
export function ImportUndoBanner({ onOpen }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-[#E2E8E2] bg-[#F9FAF9] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <p className="text-[12.5px] text-[#4A5A4C]">Committed an import by mistake? You can review and reverse a recent one.</p>
      <button type="button" onClick={onOpen} className="shrink-0 rounded-lg border border-[#C8D5C8] bg-white text-[13px] font-semibold text-[#1B4D2E] hover:bg-[#F0F4F0] max-sm:min-h-[44px] max-sm:w-full sm:border-transparent sm:bg-transparent sm:hover:underline">
        Undo a recent import
      </button>
    </div>
  )
}
