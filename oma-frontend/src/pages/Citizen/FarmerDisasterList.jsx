import { useState } from 'react'
import { AlertCircle, AlertTriangle, Check, CheckCircle2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import { CROP_THEME, CitizenBody, CitizenHomeHeader, CitizenScreen } from './citizenUI.jsx'
import { dayFirstShort } from './farmerDates.js'
import { FIELD } from './farmerFormParts.jsx'
import { labels } from './labels.js'

// Farmer reported-disasters list with its recommendation checklist and
// the mark-as-recovered step, rebuilt to UPDATED FARMER CITIZEN UI.docx.
// Rendered by CitizenDisasterScreen for variant="farmer": that screen still
// fetches the disasters and their response rules; this file draws them and owns
// only the recovery form's own state.
//
// Recovery works as before: POST domain.disasterResolveUrl(id), with the note
// the server requires unless every recommended response is already logged.
// A total-loss disaster ends the cycle, so it has no steps to recommend and no
// recovery.

const displayNumber = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? String(n) : value
}

function StatusPill({ status, isTotalLoss }) {
  const D = labels.disaster
  const base = 'flex shrink-0 flex-col items-center gap-0.5 rounded-[16px] px-3 py-1.5 text-[11px] font-bold leading-[1.15]'
  if (isTotalLoss) {
    return (
      <span className={`${base} bg-cz-danger-bg text-cz-danger-accent`}>
        <AlertTriangle size={14} aria-hidden="true" />
        {D.statusTotalLoss}
      </span>
    )
  }
  if (status === 'Recovered') {
    return (
      <span className={`${base} bg-cz-status-good-bg text-cz-status-good-fg`}>
        <Check size={14} aria-hidden="true" />
        {D.statusRecovered}
      </span>
    )
  }
  return (
    <span className={`${base} bg-cz-status-warn-bg text-cz-status-warn-fg`}>
      <AlertTriangle size={14} aria-hidden="true" />
      {D.statusActive}
    </span>
  )
}

function Recommendations({ rules, onLog, disaster }) {
  const R = labels.ffNew
  const done = rules.filter((x) => x.is_done).length
  const left = rules.length - done
  return (
    <div className="mt-3 rounded-[10px] border-[0.5px] border-cz-border bg-cz-surface px-3 py-3">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-cz-text">{R.recommendations}</p>
        <span className="text-[12px] font-bold tabular-nums text-cz-text">{R.recProgress(done, rules.length)}</span>
      </div>
      {rules.length === 0 ? (
        <p className="text-[16px] leading-[1.4] text-cz-text">{R.recNone}</p>
      ) : (
        <ul className="space-y-1">
          {rules.map((rule) => (
            <li key={rule.rule_id}>
              {/* A tick comes from a LOGGED response activity, never from a tap,
                  so an open row leads to the log screen rather than toggling. */}
              <button
                type="button"
                onClick={() => onLog?.({ rule, disaster })}
                disabled={rule.is_done || !onLog}
                aria-label={rule.is_done ? rule.title : `${rule.title} — ${R.recTapHint}`}
                className={`flex w-full items-start gap-2.5 rounded-[8px] py-1.5 text-left transition-colors ${
                  rule.is_done ? 'cursor-default' : 'hover:bg-cz-page'
                }`}
              >
                <span
                  className={`mt-[2px] flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border-[1.5px] ${
                    rule.is_done ? 'border-cz-border-strong bg-cz-border-strong text-white' : 'border-cz-text-2'
                  }`}
                  aria-hidden="true"
                >
                  {rule.is_done && <Check size={11} strokeWidth={3} />}
                </span>
                <span className={`min-w-0 flex-1 text-[13.5px] leading-[1.4] ${rule.is_done ? 'text-cz-text-muted line-through' : 'text-cz-text'}`}>
                  {rule.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[12.5px] text-cz-text-2">
        {left === 0 ? R.recAllDone : R.recRemaining(left)}
      </p>
    </div>
  )
}

export default function FarmerDisasterList({
  domain, record, disasters, responseByDisaster, isLoading, hasError, justReported,
  onReportNew, onRetry, onChanged, onLogResponse, tabBar, bare = false,
}) {
  const { showToast } = useToast()
  const S = labels.ffNew.sakuna
  const cropName = record?.crop_type_name || labels.yieldAnalysis.cropCropLabel

  const [recoverOpenId, setRecoverOpenId] = useState(null)
  const [recoverNotes, setRecoverNotes] = useState({})
  const [recoveringId, setRecoveringId] = useState(null)
  const [recoverErrors, setRecoverErrors] = useState({})

  const handleRecover = async (disasterId) => {
    setRecoveringId(disasterId)
    setRecoverErrors((e) => ({ ...e, [disasterId]: '' }))
    try {
      const note = (recoverNotes[disasterId] || '').trim()
      await api.post(domain.disasterResolveUrl(disasterId), note ? { recovery_note: note } : {})
      showToast(labels.disaster.recoverSuccess, 'success')
      setRecoverOpenId(null)
      onChanged()
    } catch (err) {
      const detail = err?.response?.data?.detail
      setRecoverErrors((e) => ({ ...e, [disasterId]: detail || labels.disaster.errors.genericRecoverError }))
    } finally {
      setRecoveringId(null)
    }
  }

  const body = (
    <>
      <button type="button" onClick={onReportNew} className="mb-3 rounded-[10px] bg-cz-crop-header px-4 py-3">
        <span className="text-[13px] font-bold text-white">{labels.farmerDisaster.reportNew}</span>
      </button>

      {isLoading && <p className="text-[15px] italic text-cz-text-2">{labels.disaster.loading}</p>}

      {!isLoading && hasError && (
        <div className="rounded-[12px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-px shrink-0 text-cz-danger-accent" aria-hidden="true" />
            <p className="text-[13px] leading-[1.5] text-cz-danger-body">{labels.disaster.loadError}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[10px] border-[0.5px] border-cz-danger-accent px-3 py-[11px]"
          >
            <span className="text-[14px] font-medium text-cz-danger-body">{labels.disaster.retry}</span>
          </button>
        </div>
      )}

      {justReported && (
        <div className="mb-3 rounded-[12px] border-[0.5px] border-cz-status-good-fg/25 bg-cz-status-good-bg px-4 py-5 text-center">
          <div className="mx-auto mb-2.5 flex h-[46px] w-[46px] items-center justify-center rounded-full border-[0.5px] border-cz-status-good-fg/30 bg-cz-surface">
            <CheckCircle2 size={22} className="text-cz-status-good-fg" aria-hidden="true" />
          </div>
          <p className="text-[17px] font-bold text-cz-text">{S.reportedTitle}</p>
          <p className="mx-auto mt-1 max-w-[300px] text-[13px] leading-[1.5] text-cz-text-2">{S.reportedBody}</p>
          <button
            type="button"
            onClick={onReportNew}
            className="mt-3 rounded-[10px] border-[0.5px] border-cz-status-good-fg/40 bg-cz-surface px-4 py-2.5"
          >
            <span className="text-[13.5px] font-semibold text-cz-status-good-fg">{S.reportAnother}</span>
          </button>
        </div>
      )}

      {!isLoading && !hasError && disasters.length === 0 && (
        <p className="text-[14px] italic text-cz-text-muted">{labels.disaster.empty}</p>
      )}

      <ul className="space-y-3">
        {!isLoading && !hasError && disasters.map((d) => {
          const isRecovered = d.status === 'Recovered'
          const canRecover = d.status === 'Active' && !d.is_total_loss
          const typeName = d.disaster_type === 'Other'
            ? d.disaster_type_other_specify
            : (labels.ffNew.disasterTypes[d.disaster_type] || d.disaster_type)
          const resp = responseByDisaster[d.id]
          // Total loss ends the cycle: nothing left to recommend.
          const rules = d.is_total_loss ? [] : (resp?.rules || [])
          const showBox = !isRecovered && (d.is_total_loss || resp)
          return (
            <li key={d.id} className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-[14px]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[16px] font-bold leading-[1.25] text-cz-text">{typeName}</p>
                  {d.severity && (
                    <p className="mt-1 text-[14px] text-cz-text">{S.damageOptions[d.severity]}</p>
                  )}
                </div>
                <StatusPill status={d.status} isTotalLoss={d.is_total_loss} />
              </div>

              <p className="mt-3 text-[13px] leading-[1.45] text-cz-text-2">
                {labels.farmerDisaster.affectedMeta(dayFirstShort(d.date_of_occurrence), displayNumber(d.area_affected_ha), cropName)}
              </p>

              {isRecovered && d.recovered_date && (
                <p className="mt-2 text-[12.5px] text-cz-status-good-fg">
                  {labels.disaster.recoveredOn(dayFirstShort(d.recovered_date))}
                </p>
              )}

              {d.is_total_loss && !isRecovered && (
                <p className="mt-3 rounded-[10px] bg-cz-danger-bg px-3 py-2.5 text-[13px] leading-[1.5] text-cz-danger-accent">
                  {labels.disaster.totalLossNotice}
                </p>
              )}

              {showBox && <Recommendations rules={rules} disaster={d} onLog={onLogResponse} />}

              {canRecover && recoverOpenId !== d.id && (
                <button
                  type="button"
                  onClick={() => setRecoverOpenId(d.id)}
                  className="mt-3 w-full rounded-[10px] border-[0.5px] border-cz-border bg-cz-surface py-3"
                >
                  <span className="text-[14px] font-bold text-cz-text">{S.markRecovered}</span>
                </button>
              )}

              {canRecover && recoverOpenId === d.id && (
                <div className="mt-3 rounded-[12px] bg-cz-crop-pale p-3.5">
                  <p className="mb-2 text-[14px] font-bold text-cz-text">
                    {S.recoverQuestion} {S.recoverRequired}
                  </p>
                  <textarea
                    rows={3}
                    placeholder={labels.disaster.fields.recoveryNote}
                    className={`${FIELD} resize-y`}
                    value={recoverNotes[d.id] || ''}
                    onChange={(e) => setRecoverNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                    disabled={recoveringId === d.id}
                  />
                  <p className="mt-2 text-[12.5px] leading-[1.5] text-cz-text-2">{labels.disaster.fields.recoveryNoteHint}</p>
                  {recoverErrors[d.id] && (
                    <p className="mt-1.5 text-[12px] text-cz-danger-accent">{recoverErrors[d.id]}</p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={recoveringId === d.id}
                      onClick={() => handleRecover(d.id)}
                      className="rounded-[10px] bg-cz-crop-header px-4 py-2.5 disabled:opacity-50"
                    >
                      <span className="text-[13px] font-bold text-white">
                        {recoveringId === d.id ? labels.disaster.recovering : S.recoverConfirm}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={recoveringId === d.id}
                      onClick={() => setRecoverOpenId(null)}
                      className="rounded-[10px] bg-cz-surface px-4 py-2.5 disabled:opacity-50"
                    >
                      <span className="text-[13px] font-bold text-cz-text">{S.recoverBack}</span>
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )

  if (bare) return <div className="mx-auto w-full max-w-[1028px] px-6 py-5">{body}</div>

  return (
    <CitizenScreen hasTabBar>
      <CitizenHomeHeader theme={CROP_THEME} />
      <CitizenBody className="!px-3 !pt-3">{body}</CitizenBody>
      {tabBar}
    </CitizenScreen>
  )
}
