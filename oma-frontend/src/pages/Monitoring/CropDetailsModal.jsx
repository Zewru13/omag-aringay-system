import { useEffect, useState } from 'react'
import { Pencil, Sprout, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import CycleDayBanner from '../../components/UI/CycleDayBanner.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { DetailTable, FormSection } from '../../components/UI/FormTable.jsx'
import { EntryCell, EntryHead, EntryRow, EntryTable, EntryTh } from '../../components/UI/EntryTable.jsx'
import { formatDate } from '../../utils/dateFormat.js'
import { cycleProgress } from '../../utils/cycleActivity.js'
import ForcedHarvestPill from './ForcedHarvestPill.jsx'
import { todayISO } from '../../utils/localDate.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { activityLine, detailActions, disasterLine, harvestManageActions, harvestRows, pestLine, summaryRows } from './cropDetails.js'

// "View Crop Details": a read-only page about one crop record — what it is, its history (activities, pest and disease reports,
// disasters, harvest) and remarks. It records nothing; the buttons in the footer open the forms that do (Log Activity,
// Record Harvest, Report Disaster) and close this window.

const STATUS_TONES = { Planted: 'green', 'Near Harvest': 'amber', Harvested: 'blue', 'Total Loss': 'rose' }
const FIRST = 5

const asList = (response) => (Array.isArray(response.data) ? response.data : (response.data?.results || []))
const asFields = (rows) => rows.map(([label, value]) => ({ label, value }))

// One history list of the crop as a table: a Date column, then the headings given in `heads` ([what it is, then up to two more]); only the
// first FIRST rows until "Show all" is pressed. `heads[1]` reads each line's `meta`, `heads[2]` its `note`.
function HistoryTable({ title, items, empty, heads, testId }) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, FIRST)
  const columns = ['Date', ...heads]
  return (
    <FormSection title={`${title} (${items.length})`}>
      {items.length === 0 ? (
        <p className="px-3 py-3 text-[13px] italic text-[#7A8E7A]">{empty}</p>
      ) : (
        <>
          <EntryTable bare label={title} testId={testId}>
            <EntryHead>{columns.map((c) => <EntryTh key={c}>{c}</EntryTh>)}</EntryHead>
            <tbody>
              {shown.map((line, i) => (
                <EntryRow key={i}>
                  <EntryCell label="Date" className="whitespace-nowrap">{formatDate(line.date)}</EntryCell>
                  <EntryCell label={heads[0]} className="break-words font-medium text-[#1A2B1A]">{line.title || '—'}</EntryCell>
                  {heads[1] && <EntryCell label={heads[1]} className="break-words">{line.meta || '—'}</EntryCell>}
                  {heads[2] && <EntryCell label={heads[2]} className="break-words">{line.note || '—'}</EntryCell>}
                </EntryRow>
              ))}
            </tbody>
          </EntryTable>
          {items.length > FIRST && (
            <div className="border-t border-[#F0F4F0] px-3 py-1.5">
              <Button type="button" size="sm" variant="ghost" onClick={() => setAll((v) => !v)}>{all ? 'Show fewer' : `Show all ${items.length}`}</Button>
            </div>
          )}
        </>
      )}
    </FormSection>
  )
}

// `readOnly`: no buttons that open forms (the window is only looked at, e.g. from a farmer's profile). `hideHistory`: only the crop and its harvest, no
// activities, pest and disease reports, disasters or remarks.
export default function CropDetailsModal({ record, onClose, onAction, readOnly = false, hideHistory = false }) {
  const { isAdmin } = useAuth()
  const [data, setData] = useState({ key: null, logs: [], pests: [], disasters: [], remarks: [], harvest: null })
  const key = `${record.id}:${record.harvest_record_id || ''}`
  const isLoading = data.key !== key

  useEffect(() => {
    let alive = true
    const get = (url) => (hideHistory ? Promise.resolve([]) : api.get(url).then(asList).catch(() => []))
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
  }, [key, record.id, record.harvest_record_id, hideHistory])

  const cycle = cycleProgress(record.date_planted, record.expected_harvest_date, todayISO())
  const harvest = harvestRows(data.harvest)
  const actions = detailActions(record)
  const manageHarvest = readOnly ? [] : harvestManageActions(record, { isAdmin })

  return (
    <ModalShell
      title={`Crop Details — ${record.crop_type_name}`}
      subtitle={record.farmer_name || record.farmer_full_name || ''}
      icon={Sprout}
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          {!readOnly && actions.map((a) => (
            <Button key={a.key} type="button" variant={a.key === 'disaster' ? 'outline' : 'primary'} onClick={() => onAction(a.key)}>{a.label}</Button>
          ))}
        </>
      )}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={STATUS_TONES[record.status] || 'slate'}>{record.status}</StatusPill>
          <ForcedHarvestPill forced={record.forced_harvest} />
          {record.has_disaster && <StatusPill tone="rose">Active disaster</StatusPill>}
        </div>
        {record.status !== 'Harvested' && record.status !== 'Total Loss' && cycle && <CycleDayBanner progress={cycle} stage={record.growth_stage} />}

        <DetailTable
          title="Crop Details"
          fields={[...asFields(summaryRows(record)), ...(record.notes ? [{ label: 'Notes', value: record.notes, wide: true }] : [])]}
        />

        {isLoading ? (
          <p className="py-6 text-center text-[13px] italic text-[#7A8E7A]">Loading the crop's history…</p>
        ) : (
          <>
            {harvest.length > 0 && (
              <div className="space-y-2">
                {manageHarvest.length > 0 && (
                  <div className="flex justify-end gap-2">
                    {manageHarvest.map((a) => (
                      <Button key={a.key} type="button" size="sm" variant="outline" icon={a.key === 'edit-harvest' ? Pencil : Trash2} onClick={() => onAction(a.key)}>{a.label} Harvest</Button>
                    ))}
                  </div>
                )}
                <DetailTable title="Harvest" fields={asFields(harvest)} />
              </div>
            )}
            {!hideHistory && (
              <>
              <HistoryTable title="Activities" items={data.logs.map(activityLine)} empty="No activities recorded yet." heads={['Activity', 'Plant Condition', 'Notes']} testId="crop-details-activities" />
              <HistoryTable title="Pest and Disease Reports" items={data.pests.map(pestLine)} empty="No pest or disease reports." heads={['Pest / Disease', 'Severity', 'Action Taken']} testId="crop-details-pests" />
              <HistoryTable title="Disasters" items={data.disasters.map(disasterLine)} empty="No disasters reported." heads={['Disaster', 'Details']} testId="crop-details-disasters" />
              <HistoryTable title="Remarks" items={data.remarks.map((r) => ({ title: r.content, date: r.date_created, meta: r.created_by_name || '' }))} empty="No remarks." heads={['Remark', 'Added By']} testId="crop-details-remarks" />
              </>
            )}
          </>
        )}
      </div>
    </ModalShell>
  )
}
