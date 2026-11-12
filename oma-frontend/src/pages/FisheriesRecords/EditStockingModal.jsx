import { useEffect, useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import { EntryCell, EntryHead, EntryRow, EntryTable, EntryTh } from '../../components/UI/EntryTable.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { FormCell, FormRow, FormRows, FormSection, FormValue } from '../../components/UI/FormTable.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import PcicInsuranceField from '../../components/UI/PcicInsuranceField.jsx'
import { pcicError, uploadPcicForm } from '../../utils/pcic.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'
import { formatDate } from '../../utils/dateFormat.js'
import { todayISO } from '../../utils/localDate.js'
import { OWNERSHIP_OPTIONS, chooseOwnership, needsOwnerDetails } from '../../utils/ownership.js'
import { organizationHint, organizationPlaceholder } from '../Monitoring/cycleOrganization.js'
import { CULTURE_PHASES, CYCLE_STATUSES, cycleEditFormFrom, cycleEditPayload, cycleEditProblem, cycleLocks, cycleOutcomePayload, unitPcicChanged, unitPcicStates } from './cycleEditForm.js'
import { computeHarvestPreview, detectSeason, fmtLong } from './stockingHelpers.js'

const hint = (message) => <p className="mt-1 text-[11.5px] text-[#7A8E7A]">{message}</p>
const LAND_STATUSES = ['Owner', 'Lessee', 'Tenant']

// Edit Production Cycle: the Start Production Cycle form filled in with the saved cycle, so what can be corrected here is what was asked when it started.
// One save changes the stocking record and its production cycle together (the rules are in cycleEditForm.js, the sync is on the server). The
// fisherfolk and the culture system are shown, not edited; the species is locked once anything is recorded for the cycle; the ponds / cages are
// listed (their PCIC is changed per pond / cage from the units panel). Survival rate, body weight, seed cost and land status keep their own section.
export default function EditStockingModal({ record: row, speciesList = [], onClose, onSaved }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [record, setRecord] = useState(null)       // the full record (with its logs, disaster reports and harvests)
  const [cycle, setCycle] = useState(null)         // its production cycle, with the ponds / cages
  const [loadError, setLoadError] = useState('')
  const [barangays, setBarangays] = useState([])
  const [waterSources, setWaterSources] = useState([])
  const [sources, setSources] = useState([])
  const [orgs, setOrgs] = useState(null)           // null while loading
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    let alive = true
    const list = (r) => (Array.isArray(r.data) ? r.data : (r.data.results || []))
    Promise.all([
      api.get(`/fisheries/stocking/${row.id}/`),
      row.production_cycle ? api.get(`/monitoring/aquaculture-cycles/${row.production_cycle}/`) : Promise.resolve({ data: null }),
      api.get('/fisheries/stocking/form-options/'),
      api.get('/fisheries/fingerling-sources/'),
    ]).then(([rec, cyc, options, fingerlingSources]) => {
      if (!alive) return
      setRecord(rec.data)
      setCycle(cyc.data)
      setBarangays(options.data.barangays || [])
      setWaterSources(options.data.water_sources || [])
      setSources(list(fingerlingSources).map((s) => s.name))
    }).catch(() => { if (alive) setLoadError('Failed to load this production cycle.') })
    return () => { alive = false }
  }, [row.id, row.production_cycle])

  // The organizations the fisherfolk belongs to (the same list Start Production Cycle offers), plus the one already chosen.
  useEffect(() => {
    if (!row.fisherfolk) return undefined
    let alive = true
    ;(async () => {
      try {
        const all = []
        for (let page = 1; page <= 20; page += 1) {
          const r = await api.get('/organizations/fisherfolk/', { params: { fisherfolk: row.fisherfolk, page } })
          if (Array.isArray(r.data)) { all.push(...r.data); break }
          all.push(...(r.data.results || []))
          if (!r.data.next) break
        }
        if (alive) setOrgs(all)
      } catch {
        if (alive) setOrgs([])
      }
    })()
    return () => { alive = false }
  }, [row.fisherfolk])

  if (loadError || !record) {
    return (
      <ModalShell title={`Edit — ${row.species_name}`} subtitle="Update this production cycle." icon={Pencil} onClose={onClose} maxWidth="max-w-4xl">
        <p className={`py-8 text-center text-sm ${loadError ? 'text-rose-600' : 'text-slate-500'}`} role={loadError ? 'alert' : 'status'}>{loadError || 'Loading…'}</p>
      </ModalShell>
    )
  }

  return (
    <EditForm
      key={record.id}
      row={row} record={record} cycle={cycle} speciesList={speciesList} barangays={barangays} waterSources={waterSources} sourceNames={sources} orgs={orgs}
      user={user} showToast={showToast} isSubmitting={isSubmitting} setIsSubmitting={setIsSubmitting}
      showDeleteConfirm={showDeleteConfirm} setShowDeleteConfirm={setShowDeleteConfirm} isDeleting={isDeleting} setIsDeleting={setIsDeleting}
      onClose={onClose} onSaved={onSaved}
    />
  )
}

function EditForm({
  row, record, cycle, speciesList, barangays, waterSources, sourceNames, orgs, user, showToast, isSubmitting, setIsSubmitting,
  showDeleteConfirm, setShowDeleteConfirm, isDeleting, setIsDeleting, onClose, onSaved,
}) {
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`edit-stocking:${record.id}`)
  const ctx = useMemo(() => ({ record, cycle, barangays, today: todayISO() }), [record, cycle, barangays])
  const [form, setForm] = useDraftField(draft, 'form', () => cycleEditFormFrom(ctx))
  const [error, setError] = useState('')
  const locks = cycleLocks({ record, cycle })
  const original = useMemo(() => cycleEditFormFrom(ctx), [ctx])
  const payload = cycleEditPayload(form, ctx)
  const outcome = cycleOutcomePayload(form, ctx)
  // Each pond / cage's PCIC insurance (its photos are files, so this is kept here and not in the saved draft).
  const [unitPcic, setUnitPcic] = useState(() => unitPcicStates(cycle))
  const isDirty = Object.keys(payload).length > 0 || Object.keys(outcome).length > 0 || unitPcicChanged(cycle, unitPcic)
  const set = (field, value) => { setForm((f) => ({ ...f, [field]: value })); setError('') }
  const units = cycle?.units || []
  const unitWord = cycle?.culture_system === 'Fishcage' ? 'Cage' : 'Pond'
  const hasPond = Boolean(record.pond)   // a linked pond is the source of the location, area and water source
  const species = speciesList.find((s) => String(s.id) === String(form.species))
  const choosableSpecies = speciesList.length ? speciesList : [{ id: record.species, species_name: record.species_name }]
  const fingerlingOptions = [...new Set([...sourceNames, ...(record.fingerling_source && record.fingerling_source !== 'Other' ? [record.fingerling_source] : [])])]
  const orgOptions = orgs || []
  const preview = useMemo(() => computeHarvestPreview(species, form.stocking_date, record.number_of_fingerlings, form.survival_rate_pct, form.avg_body_weight_kg),
    [species, form.stocking_date, record.number_of_fingerlings, form.survival_rate_pct, form.avg_body_weight_kg])
  const totalFingerlings = units.reduce((sum, u) => sum + (Number(u.fingerling_count) || 0), 0)
  const totalArea = units.reduce((sum, u) => sum + (Number(u.size_sqm) || 0), 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const problem = cycleEditProblem(form, ctx)
    if (problem) { setError(problem); return }
    // A pond / cage newly ticked as PCIC insured needs a photo of the form (an older insured one without a photo can still be edited).
    for (const u of units) {
      if (unitPcic[u.id]?.insured && !u.has_pcic_insurance) {
        const issue = pcicError(unitPcic[u.id])
        if (issue) { setError(`${unitWord} ${u.unit_number}: ${issue[0].toLowerCase()}${issue.slice(1)}`); return }
      }
    }
    setIsSubmitting(true)
    try {
      if (Object.keys(payload).length > 0) await api.patch(`/fisheries/stocking/${record.id}/`, payload)
      // The cycle's own status and harvest summary, then each pond / cage's insurance.
      if (Object.keys(outcome).length > 0) await api.patch(`/monitoring/aquaculture-cycles/${cycle.id}/`, outcome)
      const failed = []
      for (const u of units) {
        const next = unitPcic[u.id]
        if (!next) continue
        try {
          if (next.insured !== !!u.has_pcic_insurance) await api.patch(`/monitoring/aquaculture-units/${u.id}/`, { has_pcic_insurance: next.insured })
          await uploadPcicForm(api, 'unit', u.id, next)
        } catch {
          failed.push(`${unitWord} ${u.unit_number}`)
        }
      }
      if (failed.length) showToast(`Production cycle updated, but the PCIC insurance could not be saved for ${failed.join(', ')}. Open Edit again to retry.`, 'error')
      else showToast('Production cycle updated.', 'success')
      draft.clear()
      onSaved()
    } catch (err) {
      const data = err?.response?.data
      const first = data && typeof data === 'object' ? Object.values(data).flat().find((v) => typeof v === 'string') : null
      setError((typeof data?.detail === 'string' && data.detail) || first || 'Failed to update the production cycle.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await api.delete(`/fisheries/stocking/${record.id}/`)
      showToast('Stocking record deleted.', 'success')
      setShowDeleteConfirm(false)
      onSaved()
      onClose()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to delete record.', 'error')
      setShowDeleteConfirm(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <ModalShell
        title={`Edit — ${record.species_name}`}
        subtitle={`${record.fisherfolk_name || 'Production cycle'}${record.production_cycle_no ? ` · Production Cycle #${record.production_cycle_no}` : ''}`}
        icon={Pencil}
        onClose={onClose}
        maxWidth="max-w-4xl"
        footer={(
          <>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" form="edit-stocking-form" isLoading={isSubmitting} disabled={isSubmitting || !isDirty}>Save Changes</Button>
          </>
        )}
      >
        <form id="edit-stocking-form" onSubmit={handleSubmit} className="space-y-3">
          <DraftBanner draft={draft} />

          <FormSection title="Fisherfolk Information">
            <FormRows label="Fisherfolk information">
              <FormRow>
                <FormCell label="Fisherfolk" wide hint={hint('The fisherfolk of a production cycle cannot be changed.')}>
                  <FormValue>{record.fisherfolk_name}</FormValue>
                </FormCell>
              </FormRow>
              {cycle && (
                <FormRow>
                  <FormCell label="Organization" wide
                    hint={orgs && organizationHint(orgOptions.length) ? <p className="mt-1 text-xs text-[#4A5E4A]">{organizationHint(orgOptions.length)}</p> : null}>
                    <select className={baseInputClasses} value={form.organization} aria-label="Organization" disabled={orgs === null}
                      onChange={(e) => set('organization', e.target.value)}>
                      <option value="">{organizationPlaceholder({ hasFisherfolk: true, loading: orgs === null, count: orgOptions.length })}</option>
                      {orgOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      {orgs && form.organization && !orgOptions.some((o) => String(o.id) === form.organization) && (
                        <option value={form.organization}>{cycle.organization_name || 'Current organization'}</option>
                      )}
                    </select>
                  </FormCell>
                </FormRow>
              )}
            </FormRows>
          </FormSection>

          <FormSection title="Culture Details">
            <FormRows label="Culture details">
              <FormRow>
                {cycle ? (
                  <FormCell label="Culture Phase" required>
                    <select className={baseInputClasses} required value={form.cycle_name} aria-label="Culture Phase"
                      onChange={(e) => { set('cycle_name', e.target.value); if (e.target.value !== 'Other') set('cycle_name_other', '') }}>
                      <option value="">Select Culture Phase</option>
                      {CULTURE_PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    {form.cycle_name === 'Other' && (
                      <input className={`${baseInputClasses} mt-2`} required value={form.cycle_name_other} aria-label="Specify Culture Phase" placeholder="Specify Culture Phase"
                        onChange={(e) => set('cycle_name_other', e.target.value)} />
                    )}
                  </FormCell>
                ) : <FormCell label="Culture Phase"><FormValue>{record.culture_phase}</FormValue></FormCell>}
                <FormCell label="Species Farmed" required hint={locks.species ? hint('Locked: activity has been recorded for this cycle.') : null}>
                  {locks.species ? <FormValue>{record.species_name}</FormValue> : (
                    <select className={baseInputClasses} required value={form.species} aria-label="Species Farmed" onChange={(e) => set('species', e.target.value)}>
                      {choosableSpecies.map((s) => <option key={s.id} value={s.id}>{s.species_name}</option>)}
                    </select>
                  )}
                </FormCell>
              </FormRow>
              <FormRow>
                <FormCell label="Culture System" hint={hint('Set when the cycle was started.')}>
                  <FormValue>{cycle?.culture_system || record.culture_type}</FormValue>
                </FormCell>
                <FormCell label="Water Source" required hint={hasPond ? hint('Taken from the linked pond.') : null}>
                  {hasPond ? <FormValue>{record.water_source}</FormValue> : (
                    <>
                      <select className={baseInputClasses} required value={form.water_source} aria-label="Water Source"
                        onChange={(e) => { set('water_source', e.target.value); if (e.target.value !== 'Other') set('water_source_other', '') }}>
                        <option value="" disabled>Select Water Source</option>
                        {(waterSources.length ? waterSources : ['River', 'Spring', 'Rain-fed', 'Deep Well', 'Other']).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                      {form.water_source === 'Other' && (
                        <input className={`${baseInputClasses} mt-2`} required value={form.water_source_other} aria-label="Specify Water Source" placeholder="Specify Water Source"
                          onChange={(e) => set('water_source_other', e.target.value)} />
                      )}
                    </>
                  )}
                </FormCell>
              </FormRow>
              <FormRow>
                <FormCell label="Fingerling Source">
                  <ComboboxWithOther options={fingerlingOptions} value={form.fingerling_source} otherValue={form.fingerling_source_other} placeholder="Select Fingerling Source"
                    onChange={(v) => set('fingerling_source', v)} onOtherChange={(v) => set('fingerling_source_other', v)} />
                </FormCell>
                <FormCell label="Pond Location" required hint={hasPond ? hint('Taken from the linked pond.') : null}>
                  {hasPond ? <FormValue>{record.pond_location_barangay}</FormValue> : (
                    <>
                      <select className={baseInputClasses} required value={form.pond_location} aria-label="Pond Location"
                        onChange={(e) => { set('pond_location', e.target.value); if (e.target.value !== 'Other') set('pond_location_other', '') }}>
                        <option value="" disabled>Select Barangay</option>
                        {barangays.map((b) => <option key={b} value={b}>{b}</option>)}
                        <option value="Other">Other</option>
                      </select>
                      {form.pond_location === 'Other' && (
                        <input className={`${baseInputClasses} mt-2`} required maxLength={100} value={form.pond_location_other} aria-label="Specify Pond Location"
                          placeholder="Enter pond location" onChange={(e) => set('pond_location_other', e.target.value)} />
                      )}
                    </>
                  )}
                </FormCell>
              </FormRow>
            </FormRows>
          </FormSection>

          <FormSection title="Stocking Information">
            <FormRows label="Stocking information">
              <FormRow>
                <FormCell label="Stocking Date" required
                  hint={record.date_stocked_is_estimated ? <p className="mt-1 text-[11.5px] text-amber-700">This date is an estimate. Saving a stocking date confirms it as the real one.</p>
                    : (locks.first ? hint(`It cannot be after ${formatDate(locks.first)}, the first activity recorded.`) : null)}>
                  <input type="date" className={baseInputClasses} required value={form.stocking_date} max={locks.first && locks.first < todayISO() ? locks.first : todayISO()}
                    aria-label="Stocking Date" onChange={(e) => set('stocking_date', e.target.value)} />
                </FormCell>
                <FormCell label="Season">
                  <FormValue>{form.stocking_date ? `${detectSeason(form.stocking_date)} Season` : ''}</FormValue>
                </FormCell>
              </FormRow>
              {cycle && (
                <FormRow>
                  <FormCell label="Target Harvest Date" required wide
                    hint={preview ? hint(`The species' own estimate is ${fmtLong(preview.harvestDate.toISOString().slice(0, 10))}. You may keep a different target.`) : null}>
                    <input type="date" className={`${baseInputClasses} md:max-w-[16rem]`} required value={form.target_harvest_date} min={form.stocking_date || undefined}
                      aria-label="Target Harvest Date" onChange={(e) => set('target_harvest_date', e.target.value)} />
                  </FormCell>
                </FormRow>
              )}
              {!locks.ponds && (
                <FormRow>
                  <FormCell label="Stocking Count (pieces)" required wide>
                    <input type="number" min="1" className={`${baseInputClasses} md:max-w-[16rem]`} required value={form.number_of_fingerlings} aria-label="Stocking Count (pieces)"
                      onChange={(e) => set('number_of_fingerlings', e.target.value)} />
                  </FormCell>
                </FormRow>
              )}
            </FormRows>
          </FormSection>

          {cycle && (
            <FormSection title="Ownership">
              <FormRows label="Ownership">
                <FormRow>
                  <FormCell label="Ownership" required={Boolean(original.ownership)} wide={!needsOwnerDetails(form.ownership)}>
                    <select className={baseInputClasses} value={form.ownership} aria-label="Ownership"
                      onChange={(e) => { const next = chooseOwnership({ ownership: form.ownership, ownerName: form.ownerName, ownerNo: form.ownerNo }, e.target.value); setForm((f) => ({ ...f, ...next })); setError('') }}>
                      <option value="" disabled={Boolean(original.ownership)}>Not specified</option>
                      {OWNERSHIP_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </FormCell>
                  {needsOwnerDetails(form.ownership) && (
                    <FormCell label="Owner Name" required>
                      <input className={baseInputClasses} required maxLength={150} value={form.ownerName} aria-label="Owner Name" placeholder="Full name of the owner"
                        onChange={(e) => set('ownerName', e.target.value)} />
                    </FormCell>
                  )}
                </FormRow>
                {needsOwnerDetails(form.ownership) && (
                  <FormRow>
                    <FormCell label="RSBSA / FishR No. of Owner" required wide>
                      <input className={`${baseInputClasses} md:max-w-[24rem]`} required maxLength={50} value={form.ownerNo} aria-label="RSBSA / FishR No. of Owner"
                        placeholder="Registration number of the owner" onChange={(e) => set('ownerNo', e.target.value)} />
                    </FormCell>
                  </FormRow>
                )}
              </FormRows>
            </FormSection>
          )}

          <FormSection title="Pond/Cage Details">
            <FormRows label="Pond or cage details">
              <FormRow>
                <FormCell label={`Number of ${unitWord}s`} hint={units.length ? hint(`The ${unitWord.toLowerCase()}s of a started cycle are not edited here; PCIC insurance is changed per ${unitWord.toLowerCase()} in the table below.`) : null}>
                  <FormValue>{units.length || record.number_of_units || ''}</FormValue>
                </FormCell>
                <FormCell label="PCIC Insured"><FormValue>{record.has_pcic_insurance ? 'Yes' : 'No'}</FormValue></FormCell>
              </FormRow>
            </FormRows>
            {units.length > 0 && (
              <div className="border-t border-[#E2E8E2] p-3">
                <EntryTable label={`${unitWord}s of this cycle`} testId="edit-unit-table">
                  <EntryHead>
                    <EntryTh>{unitWord} No.</EntryTh>
                    <EntryTh>Length (m)</EntryTh>
                    <EntryTh>Width (m)</EntryTh>
                    <EntryTh>Area (m²)</EntryTh>
                    <EntryTh>Fingerlings</EntryTh>
                    <EntryTh>PCIC Insurance</EntryTh>
                  </EntryHead>
                  <tbody>
                    {units.map((u) => (
                      <EntryRow key={u.id}>
                        <EntryCell label={`${unitWord} No.`} className="font-medium text-[#1A2B1A]">{unitWord} {u.unit_number}</EntryCell>
                        <EntryCell label="Length (m)">{u.length_m ?? '—'}</EntryCell>
                        <EntryCell label="Width (m)">{u.width_m ?? '—'}</EntryCell>
                        <EntryCell label="Area (m²)">{Number(u.size_sqm).toFixed(2)}</EntryCell>
                        <EntryCell label="Fingerlings">{Number(u.fingerling_count).toLocaleString()}</EntryCell>
                        <EntryCell label="PCIC Insurance">
                          <PcicInsuranceField compact value={unitPcic[u.id] || { insured: false, files: [], photos: [], removed: [] }} subject={unitWord.toLowerCase()}
                            onChange={(next) => { setUnitPcic((prev) => ({ ...prev, [u.id]: next })); setError('') }} />
                        </EntryCell>
                      </EntryRow>
                    ))}
                    <EntryRow className="bg-slate-50 font-semibold">
                      <EntryCell label="Total" className="text-[#1A2B1A]">TOTAL</EntryCell>
                      <EntryCell>—</EntryCell>
                      <EntryCell>—</EntryCell>
                      <EntryCell label="Total area (m²)">{totalArea.toFixed(2)}</EntryCell>
                      <EntryCell label="Total fingerlings">{totalFingerlings.toLocaleString()}</EntryCell>
                      <EntryCell>—</EntryCell>
                    </EntryRow>
                  </tbody>
                </EntryTable>
              </div>
            )}
          </FormSection>

          <FormSection title="Other Details">
            <FormRows label="Other details">
              <FormRow>
                <FormCell label="Survival Rate (%)">
                  <DecimalInput decimals={2} className={baseInputClasses} value={form.survival_rate_pct} aria-label="Survival Rate (%)" placeholder="e.g. 80.00"
                    onChange={(v) => set('survival_rate_pct', v)} />
                </FormCell>
                <FormCell label="Avg Body Weight (kg)">
                  <DecimalInput decimals={3} className={baseInputClasses} value={form.avg_body_weight_kg} aria-label="Avg Body Weight (kg)" placeholder="e.g. 0.250"
                    onChange={(v) => set('avg_body_weight_kg', v)} />
                </FormCell>
              </FormRow>
              <FormRow>
                <FormCell label="Seed / Fingerling Cost">
                  <DecimalInput decimals={2} className={baseInputClasses} value={form.seed_cost_php} aria-label="Seed / Fingerling Cost" placeholder="₱ (optional)"
                    onChange={(v) => set('seed_cost_php', v)} />
                </FormCell>
                <FormCell label="Avg Fingerling Size">
                  <input className={baseInputClasses} value={form.avg_fingerling_size} maxLength={50} aria-label="Avg Fingerling Size" placeholder="e.g. 2-3 cm"
                    onChange={(e) => set('avg_fingerling_size', e.target.value)} />
                </FormCell>
              </FormRow>
              <FormRow>
                <FormCell label="Land Status" wide>
                  <div className="md:max-w-[24rem]">
                    <ComboboxWithOther options={LAND_STATUSES} value={form.land_status} otherValue={form.land_status_other} placeholder="Select…"
                      onChange={(v) => set('land_status', v)} onOtherChange={(v) => set('land_status_other', v)} />
                  </div>
                </FormCell>
              </FormRow>
            </FormRows>
          </FormSection>

          {cycle && (
            <FormSection title="Cycle Status and Harvest">
              <FormRows label="Cycle status and harvest">
                <FormRow>
                  <FormCell label="Cycle Status">
                    <select className={baseInputClasses} value={form.cycle_status} aria-label="Cycle Status" onChange={(e) => set('cycle_status', e.target.value)}>
                      {CYCLE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </FormCell>
                  <FormCell label="Actual Harvest Date">
                    <input type="date" className={baseInputClasses} value={form.actual_harvest_date} max={todayISO()} aria-label="Actual Harvest Date"
                      onChange={(e) => set('actual_harvest_date', e.target.value)} />
                  </FormCell>
                </FormRow>
                <FormRow>
                  <FormCell label="Harvest Volume (kg)">
                    <DecimalInput decimals={2} className={baseInputClasses} value={form.harvest_volume_kg} aria-label="Harvest Volume (kg)" onChange={(v) => set('harvest_volume_kg', v)} />
                  </FormCell>
                  <FormCell label="Area / Cage Harvested">
                    <input className={baseInputClasses} value={form.area_cage_harvested} aria-label="Area / Cage Harvested" placeholder="e.g. Pond 1 & 2, Cage A"
                      onChange={(e) => set('area_cage_harvested', e.target.value)} />
                  </FormCell>
                </FormRow>
                <FormRow>
                  <FormCell label="Notes" wide>
                    <textarea className={`${baseInputClasses} h-auto resize-none py-2`} rows={2} value={form.cycle_notes} aria-label="Notes"
                      onChange={(e) => set('cycle_notes', e.target.value)} />
                  </FormCell>
                </FormRow>
              </FormRows>
            </FormSection>
          )}

          {error && <p className="rounded-lg border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-[13px] font-medium text-[#991B1B]" role="alert">{error}</p>}

          {user?.role === 'ADMIN' && record.status !== 'Harvested' && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="mb-1 text-[12px] font-semibold text-rose-700">Danger Zone</p>
              <p className="mb-2 text-[11px] text-rose-600">Permanently delete this stocking record and all its logs, disaster reports, and harvest records.</p>
              <Button type="button" size="sm" variant="outline" icon={Trash2} onClick={() => setShowDeleteConfirm(true)}>Delete this record</Button>
            </div>
          )}
        </form>
      </ModalShell>

      {showDeleteConfirm && (
        <ConfirmDialog
          title={`Delete ${record.species_name}?`}
          message="This action cannot be undone."
          details={`${record.log_count ?? row.log_count ?? 0} activity log(s), ${record.disaster_report_count ?? 0} disaster report(s), ${record.harvest_count ?? 0} harvest record(s).`}
          confirmLabel={isDeleting ? 'Deleting…' : 'Delete Record'}
          requireTypedConfirmation
          typedConfirmationText="DELETE"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  )
}
