import { useEffect, useState } from 'react'
import { Sprout } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import CycleDayBanner from '../../components/UI/CycleDayBanner.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { cycleProgress } from '../../utils/cycleActivity.js'
import { todayISO } from '../../utils/localDate.js'
import { activityLine, detailActions, disasterLine, harvestRows, pestLine, summaryRows } from './cropDetails.js'

// "View Crop Details": a read-only page about one crop record — what it is, its history (activities, pest and disease reports,
// disasters, harvest) and remarks. It records nothing; the buttons in the footer open the forms that do (Record Activity,
// Record Harvest, Report Disaster) and close this window.

const STATUS_TONES = { Planted: 'green', 'Near Harvest': 'amber', Harvested: 'blue', 'Total Loss': 'rose' }
const FIRST = 5

const asList = (response) => (Array.isArray(response.data) ? response.data : (response.data?.results || []))
const fmtDate = (v) => (v ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${String(v).slice(0, 10)}T00:00:00`)) : '')

function Section({ title, count, children }) {
  return (
    <section className="rounded-xl border border-[#E2E8E2]">
      <div className="flex items-center justify-between bg-[#EBF5EE]/60 px-4 py-2.5">
        <h3 className="text-[13px] font-bold text-[#1A2B1A]">{title}</h3>
        {count !== undefined && <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[#4A5E4A]">{count}</span>}
      </div>
      <div className="px-4 py-3">{children}</div>
    </section>
  )
}

function Lines({ items, empty }) {
  const [all, setAll] = useState(false)
  if (items.length === 0) return <p className="text-[13px] italic text-[#7A8E7A]">{empty}</p>
  const shown = all ? items : items.slice(0, FIRST)
  return (
    <>
      <ul className="divide-y divide-[#F0F4F0]">
        {shown.map((line, i) => (
          <li key={i} className="py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="text-[13px] font-medium text-[#1A2B1A]">{line.title}</p>
              <p className="text-[12px] text-[#7A8E7A]">{fmtDate(line.date)}</p>
            </div>
            {line.meta && <p className="text-[12px] text-[#4A5E4A]">{line.meta}</p>}
            {line.note && <p className="mt-0.5 break-words text-[12px] text-[#7A8E7A]">{line.note}</p>}
          </li>
        ))}
      </ul>
      {items.length > FIRST && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-1 min-h-[36px] text-[12px] font-semibold text-[#1B4D2E] hover:underline">
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </>
  )
}

export default function CropDetailsModal({ record, onClose, onAction }) {
  const [data, setData] = useState({ key: null, logs: [], pests: [], disasters: [], remarks: [], harvest: null })
  const key = `${record.id}:${record.harvest_record_id || ''}`
  const isLoading = data.key !== key

  useEffect(() => {
    let alive = true
    const get = (url) => api.get(url).then(asList).catch(() => [])
    Promise.all([
      get(`/production/monitoring/${record.id}/logs/`),
      get(`/production/monitoring/${record.id}/pest-disease/`),
      get(`/production/monitoring/${record.id}/disasters/`),
      get(`/production/monitoring/${record.id}/remarks/`),
      record.harvest_record_id ? api.get(`/production/${record.harvest_record_id}/`).then((r) => r.data).catch(() => null) : Promise.resolve(null),
    ]).then(([logs, pests, disasters, remarks, harvest]) => {
      if (alive) setData({ key, logs, pests, disasters, remarks, harvest })
    })
    return () => { alive = false }
  }, [key, record.id, record.harvest_record_id])

  const cycle = cycleProgress(record.date_planted, record.expected_harvest_date, todayISO())
  const harvest = harvestRows(data.harvest)
  const actions = detailActions(record)

  return (
    <ModalShell
      title={`Crop Details — ${record.crop_type_name}`}
      subtitle={record.farmer_name || record.farmer_full_name || ''}
      icon={Sprout}
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={(
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
          {actions.map((a) => (
            <Button key={a.key} type="button" variant={a.key === 'disaster' ? 'outline' : 'primary'} onClick={() => onAction(a.key)}>{a.label}</Button>
          ))}
        </>
      )}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={STATUS_TONES[record.status] || 'slate'}>{record.status}</StatusPill>
          {record.has_disaster && <StatusPill tone="rose">Active disaster</StatusPill>}
        </div>
        {record.status !== 'Harvested' && record.status !== 'Total Loss' && cycle && <CycleDayBanner progress={cycle} stage={record.growth_stage} />}

        <dl className="grid gap-x-6 sm:grid-cols-2">
          {summaryRows(record).map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 border-b border-[#F0F4F0] py-1.5 text-[13px]">
              <dt className="shrink-0 text-[#7A8E7A]">{label}</dt>
              <dd className="min-w-0 break-words text-right font-medium text-[#1A2B1A]">{value}</dd>
            </div>
          ))}
        </dl>
        {record.notes && <p className="rounded-lg bg-[#F9FAF9] px-3 py-2 text-[12.5px] text-[#4A5E4A]"><span className="font-semibold">Notes: </span>{record.notes}</p>}

        {isLoading ? (
          <p className="py-6 text-center text-[13px] italic text-[#7A8E7A]">Loading the crop's history…</p>
        ) : (
          <>
            {harvest.length > 0 && (
              <Section title="Harvest">
                <dl>
                  {harvest.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3 border-b border-[#F0F4F0] py-1.5 text-[13px] last:border-0">
                      <dt className="shrink-0 text-[#7A8E7A]">{label}</dt>
                      <dd className="min-w-0 break-words text-right font-medium text-[#1A2B1A]">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Section>
            )}
            <Section title="Activities" count={data.logs.length}>
              <Lines items={data.logs.map(activityLine)} empty="No activities recorded yet." />
            </Section>
            <Section title="Pest and disease reports" count={data.pests.length}>
              <Lines items={data.pests.map(pestLine)} empty="No pest or disease reports." />
            </Section>
            <Section title="Disasters" count={data.disasters.length}>
              <Lines items={data.disasters.map(disasterLine)} empty="No disasters reported." />
            </Section>
            <Section title="Remarks" count={data.remarks.length}>
              <Lines items={data.remarks.map((r) => ({ title: r.content, date: r.date_created, meta: r.created_by_name || '' }))} empty="No remarks." />
            </Section>
          </>
        )}
      </div>
    </ModalShell>
  )
}
