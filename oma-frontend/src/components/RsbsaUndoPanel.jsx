import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react'
import api from '../api/axiosInstance.js'
import Button from './UI/Button.jsx'
import StatusPill from './UI/StatusPill.jsx'

// Undo for an RSBSA import batch (backend: farmers/rsbsa_import_undo.py). The
// server decides what is safe: it restores a changed field only if it still
// holds the value the import wrote, and deletes a registered person only if
// nobody edited them, nothing depends on them and their login was never used.
// Everything else is kept and the reason is shown here. Reversal runs in
// slices, and is idempotent server-side, so a retry after an interruption is
// harmless.
const SLICE = 50

const fmtDate = (iso) => (iso
  ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
  : '—')

const OUTCOME_LABEL = { restore: 'Restore', delete: 'Delete', skip: 'Keep' }
const OUTCOME_TONE = { restore: 'amber', delete: 'rose', skip: 'slate' }

export default function RsbsaUndoPanel({ initialBatchId, onChanged }) {
  const [batches, setBatches] = useState(null)
  const [batchId, setBatchId] = useState(initialBatchId || null)
  const [plan, setPlan] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [outcome, setOutcome] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (batchId) return undefined
    let cancelled = false
    api.get('/farmers/rsbsa-import/batches/')
      .then((r) => { if (!cancelled) setBatches(r.data.batches) })
      .catch(() => { if (!cancelled) { setBatches([]); setError('Could not load the recent imports.') } })
    return () => { cancelled = true }
  }, [batchId])

  useEffect(() => {
    if (!batchId) return undefined
    let cancelled = false
    api.post(`/farmers/rsbsa-import/batches/${batchId}/undo/`, { dry_run: true })
      .then((r) => { if (!cancelled) setPlan(r.data) })
      .catch((err) => { if (!cancelled) setError(err?.response?.data?.detail || 'Could not work out what undoing this import would do.') })
    return () => { cancelled = true }
  }, [batchId])

  // Switching batch resets the view here (in the handler), not in the effect.
  const openBatch = (id) => { setPlan(null); setOutcome(null); setError(''); setBatchId(id) }

  const runUndo = async () => {
    const keys = plan.record_keys
    const results = []
    setBusy(true); setError('')
    setProgress({ done: 0, total: keys.length })
    try {
      for (let i = 0; i < keys.length; i += SLICE) {
        const r = await api.post(`/farmers/rsbsa-import/batches/${batchId}/undo/`, { records: keys.slice(i, i + SLICE) })
        results.push(...r.data.results)
        setProgress({ done: results.length, total: keys.length })
      }
    } catch (err) {
      setError(`${err?.response?.data?.detail || 'The undo was interrupted.'} ${results.filter((x) => x.done).length} record(s) were already reversed — open Undo again to see what is left.`)
    } finally {
      setBusy(false); setProgress(null)
      if (results.length) {
        setOutcome({
          restored: results.filter((x) => x.done && x.outcome === 'restore').length,
          deleted: results.filter((x) => x.done && x.outcome === 'delete').length,
          notDone: results.filter((x) => !x.done).length,
        })
        onChanged?.()
      }
    }
  }

  if (!batchId) {
    return (
      <div className="stagger-item space-y-3">
        <p className="text-[13px] text-[#4A5A4C]">
          Pick a recent import to review. Nothing is changed until you confirm on the next screen, and anything that
          can't be undone safely is kept.
        </p>
        {batches === null && <p className="text-[13px] italic text-[#7A8E7A]">Loading recent imports…</p>}
        {batches && batches.length === 0 && <p className="text-[13px] italic text-[#7A8E7A]">No imports have been committed yet.</p>}
        <div className="divide-y divide-[#F0F4F0] rounded-2xl border border-[#E2E8E2] bg-white">
          {(batches || []).map((b) => (
            <div key={b.batch_id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[#1A2B1A]">{fmtDate(b.started_at)}{b.performed_by ? ` · ${b.performed_by}` : ''}</p>
                <p className="mt-0.5 text-[12px] text-[#7A8E7A]">
                  {b.records_created} registered · {b.records_updated} updated · {b.records_undone} already undone
                </p>
              </div>
              <Button type="button" variant="outline" disabled={!b.can_undo} onClick={() => openBatch(b.batch_id)}>
                Review undo
              </Button>
            </div>
          ))}
        </div>
        {error && <p className="rounded-lg border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}
      </div>
    )
  }

  const s = plan?.summary
  const actionable = plan ? plan.record_keys.length : 0

  return (
    <div className="stagger-item space-y-4">
      {!initialBatchId && (
        <button type="button" onClick={() => { setBatchId(null); setBatches(null); setPlan(null); setOutcome(null); setError('') }} className="text-[13px] font-medium text-[#7A8E7A] hover:text-[#1A2B1A]">
          ← Back to recent imports
        </button>
      )}

      {!plan && !error && <p className="text-[13px] italic text-[#7A8E7A]">Working out what undoing this import would do…</p>}
      {error && <p className="rounded-lg border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}

      {outcome && (
        <div className="flex items-start gap-3 rounded-2xl border border-[#BFE3CC] bg-[#EBF5EE] p-4">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[#1E5637]" aria-hidden="true" />
          <p className="text-[13px] text-[#1A2B1A]">
            <span className="font-semibold">Undo finished.</span> {outcome.restored} record{outcome.restored === 1 ? '' : 's'} restored,{' '}
            {outcome.deleted} registered person{outcome.deleted === 1 ? '' : 's'} removed
            {outcome.notDone > 0 && `, ${outcome.notDone} could not be undone (see the list below)`}.
          </p>
        </div>
      )}

      {plan && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Will be restored', s.restore], ['Will be removed', s.delete],
              ['Kept (not safe to undo)', s.kept], ['Already undone', s.already_undone],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[#E2E8E2] bg-white px-3 py-3">
                <p className="text-[20px] font-semibold text-[#1A2B1A]">{value}</p>
                <p className="mt-0.5 text-[11px] text-[#7A8E7A]">{label}</p>
              </div>
            ))}
          </div>

          {actionable > 0 && !outcome && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
              <p className="text-[13px] text-amber-800">
                Changed fields go back to their values from before the import — only where nobody has edited them since.
                People this import registered are removed only if nothing is attached to them and their login was never used.
                {actionable > SLICE && ` Done in slices of ${SLICE}; keep this window open.`}
              </p>
            </div>
          )}

          <div className="max-h-72 divide-y divide-[#F0F4F0] overflow-y-auto rounded-2xl border border-[#E2E8E2] bg-white">
            {plan.items.map((it) => (
              <div key={`${it.record_type}-${it.record_id}`} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-[13px] font-medium text-[#1A2B1A]">{it.record_name}</p>
                  <StatusPill tone={OUTCOME_TONE[it.outcome]}>{OUTCOME_LABEL[it.outcome]}</StatusPill>
                </div>
                <p className="mt-0.5 text-[12px] text-[#7A8E7A]">
                  {it.rsbsa_number} · {it.record_type === 'FARMER' ? 'Farmer' : 'Fisherfolk'}
                  {it.fields?.length > 0 && ` · ${it.fields.map((f) => `${f.label}: ${f.current} → ${f.restore_to}`).join('; ')}`}
                  {it.outcome === 'delete' && ' · registered by this import'}
                  {it.reason && ` · ${it.reason}`}
                </p>
              </div>
            ))}
            {plan.items.length === 0 && <p className="px-4 py-6 text-center text-[13px] italic text-[#7A8E7A]">Nothing left to undo in this import.</p>}
          </div>
          {plan.items_truncated && <p className="text-[11px] italic text-[#7A8E7A]">Showing the first {plan.items.length} records; the rest are handled the same way.</p>}

          {progress && (
            <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] font-medium text-sky-800">
              Undoing… {progress.done} of {progress.total} records. Please keep this window open.
            </p>
          )}

          {actionable > 0 && !outcome && (
            <div className="flex justify-end">
              <Button type="button" isLoading={busy} onClick={runUndo}>
                <RotateCcw size={14} className="mr-1.5" aria-hidden="true" />
                Undo {actionable} record{actionable === 1 ? '' : 's'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
