import { useEffect, useMemo, useState } from 'react'
import { Pencil, Ship, Trash2, X } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import AddButton from '../../components/UI/AddButton.jsx'
import Button from '../../components/UI/Button.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import { EntryCell, EntryHead, EntryRow, EntryTable, EntryTh } from '../../components/UI/EntryTable.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { FormCell, FormRow, FormRows, FormSection, FormValue } from '../../components/UI/FormTable.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import SearchBar from '../../components/UI/SearchBar.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'
import { todayISO } from '../../utils/localDate.js'
import {
  FISHING_GROUNDS, GEARS, SPECIES_NAMES, catchTotal, emptySpeciesRow, speciesChanges, speciesRowsFrom, tripFormFrom, tripPayload, tripProblem,
} from './catchForm.js'

const isCapture = (ff) => ff.fisherfolk_type === 'Capture' || ff.fisherfolk_type === 'Inland'
const nameOf = (ff) => ff.full_name || `${ff.first_name || ''} ${ff.last_name || ''}`.trim()

// Log Fishing Trip / Catch, and Edit Catch Log when `record` is given: the same window, so the edit form is the log form filled in. The trip
// details are a table form; the species caught are a table with one row per species (the total catch is their sum). The rules are in
// catchForm.js. An Admin can delete the log from the edit window.
function LogCatchModal({ record = null, onClose, onSuccess }) {
  const isEdit = Boolean(record)
  const { isAdmin } = useAuth()
  const { showToast } = useToast()
  // What is typed is a draft: still here when the window is opened again (see hooks/useDraftForm.js). One per log being edited.
  const draft = useDraftForm(isEdit ? `edit-catch:${record.id}` : 'log-catch')
  const [ffSearch, setFfSearch] = useDraftField(draft, 'ffSearch', '', { skip: isEdit })
  const [ffResults, setFfResults] = useState([])
  const [selectedFf, setSelectedFf] = useDraftField(draft, 'selectedFf', null, { skip: isEdit })
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useDraftField(draft, 'form', () => tripFormFrom(record))
  const [speciesRows, setSpeciesRows] = useDraftField(draft, 'speciesRows', () => speciesRowsFrom(record))
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (isEdit) return undefined
    let mounted = true
    api.get('/fisheries/fisherfolk/')
      .then((r) => { if (mounted) setFfResults((Array.isArray(r.data) ? r.data : (r.data.results || [])).filter(isCapture)) })
      .catch(() => { if (mounted) setFfResults([]) })
    return () => { mounted = false }
  }, [isEdit])

  const filteredFisherfolk = useMemo(() => {
    const q = ffSearch.trim().toLowerCase()
    if (!q) return ffResults
    return ffResults.filter((ff) => {
      const first = (ff.first_name || '').toLowerCase()
      const middle = (ff.middle_name || '').toLowerCase()
      const last = (ff.last_name || '').toLowerCase()
      return [(ff.full_name || '').toLowerCase(), `${first} ${middle} ${last}`.replace(/\s+/g, ' ').trim(), `${first} ${last}`.trim(), `${last} ${first}`.trim(),
        (ff.rsbsa_number || '').toLowerCase()].some((text) => text.includes(q))
    })
  }, [ffResults, ffSearch])

  const handleFfSearch = async (q) => {
    setFfSearch(q)
    setIsDropdownOpen(true)
    try {
      const r = await api.get('/fisheries/fisherfolk/', { params: q.trim() ? { search: q.trim() } : {} })
      setFfResults((Array.isArray(r.data) ? r.data : (r.data.results || [])).filter(isCapture))
    } catch {
      setFfResults([])
    }
  }

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))
  const setRow = (index, field, value) => setSpeciesRows((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  const total = catchTotal(speciesRows)
  const fisherfolk = isEdit ? { id: record.fisherfolk } : selectedFf

  const handleSubmit = async (e) => {
    e.preventDefault()
    // A log saved long ago with a total and no species may stay without species; every other log needs at least one.
    const problem = tripProblem({ fisherfolk, form, rows: speciesRows, speciesOptional: isEdit && !(record.species_entries || []).length })
    if (problem) { showToast(problem, 'error'); return }
    setIsSubmitting(true)
    try {
      const body = tripPayload(form)
      const trip = isEdit
        ? (await api.patch(`/fisheries/fishing-trips/${record.id}/`, body)).data
        : (await api.post('/fisheries/fishing-trips/', { ...body, fisherfolk: fisherfolk.id })).data
      // The species: the new and changed rows are added first, then the ones taken out are removed, so the log is never left empty in between.
      const { add, remove } = speciesChanges(isEdit ? record.species_entries : [], speciesRows)
      for (const entry of add) await api.post(`/fisheries/fishing-trips/${trip.id}/species/`, entry)
      for (const id of remove) await api.delete(`/fisheries/fishing-trips/species/${id}/`)
      showToast(isEdit ? 'Catch log updated.' : 'Catch log saved.', 'success')
      draft.clear()
      onSuccess()
      onClose()
    } catch (err) {
      const data = err?.response?.data
      showToast(data?.detail || data?.non_field_errors?.[0] || (isEdit ? 'Failed to update the catch log.' : 'Failed to save.'), 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await api.delete(`/fisheries/fishing-trips/${record.id}/`)
      showToast('Catch log deleted.', 'success')
      draft.clear()
      onSuccess()
      onClose()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to delete catch log.', 'error')
      setShowDeleteConfirm(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <ModalShell
        title={isEdit ? 'Edit Catch Log' : 'Log Fishing Trip / Catch'}
        subtitle={isEdit ? record.fisherfolk_name : 'One fishing trip of a capture or inland fisherfolk, with what was caught'}
        icon={isEdit ? Pencil : Ship}
        onClose={onClose}
        maxWidth="max-w-4xl"
        footer={(
          <>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" form="log-catch-form" isLoading={isSubmitting}>{isEdit ? 'Save Changes' : 'Save Log'}</Button>
          </>
        )}
      >
        <form id="log-catch-form" onSubmit={handleSubmit} className="space-y-3">
          <DraftBanner draft={draft} />

          <FormSection title="Trip Details">
            <FormRows label="Trip details">
              <FormRow>
                <FormCell label="Fisherfolk" required wide>
                  {isEdit ? <FormValue>{record.fisherfolk_name}</FormValue> : (
                    <>
                      <SearchBar value={ffSearch} onChange={handleFfSearch} placeholder="Search a capture or inland fisherfolk by name or RSBSA number…" />
                      {isDropdownOpen && (
                        <ul className="mt-1 max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                          {filteredFisherfolk.length > 0 ? filteredFisherfolk.map((ff) => (
                            <li key={ff.id}>
                              <button type="button" className="w-full px-4 py-2.5 text-left text-sm hover:bg-[#f0f7f0]"
                                onClick={() => { setSelectedFf(ff); setFfSearch(nameOf(ff)); setIsDropdownOpen(false) }}>
                                <span className="font-medium">{nameOf(ff)}</span>
                                <span className="ml-2 text-slate-400">({ff.rsbsa_number})</span>
                                <span className="ml-2 text-slate-400">{ff.fisherfolk_type}</span>
                              </button>
                            </li>
                          )) : <li className="px-4 py-2.5 text-sm text-slate-500">No fisherfolk found</li>}
                        </ul>
                      )}
                      {selectedFf && <p className="mt-1 text-xs text-[#1E4620]">Selected: {nameOf(selectedFf)}</p>}
                    </>
                  )}
                </FormCell>
              </FormRow>
              <FormRow>
                <FormCell label="Trip Date" required>
                  <input type="date" className={baseInputClasses} value={form.trip_date} max={todayISO()} aria-label="Trip Date" onChange={(e) => set('trip_date', e.target.value)} />
                </FormCell>
                <FormCell label="Return Date">
                  <input type="date" className={baseInputClasses} value={form.return_date} min={form.trip_date || undefined} max={todayISO()} aria-label="Return Date"
                    onChange={(e) => set('return_date', e.target.value)} />
                </FormCell>
              </FormRow>
              <FormRow>
                <FormCell label="Fishing Ground" required>
                  <ComboboxWithOther options={FISHING_GROUNDS} value={form.fishing_ground} otherValue={form.fishing_ground_other}
                    onChange={(v) => set('fishing_ground', v)} onOtherChange={(v) => set('fishing_ground_other', v)} placeholder="Select Fishing Ground" />
                </FormCell>
                <FormCell label="Gear Used" required>
                  <ComboboxWithOther options={GEARS} value={form.gear_used} otherValue={form.gear_used_other}
                    onChange={(v) => set('gear_used', v)} onOtherChange={(v) => set('gear_used_other', v)} placeholder="Select Gear Used" />
                </FormCell>
              </FormRow>
              <FormRow>
                <FormCell label="Hours at Sea">
                  <input type="number" step="0.1" min="0" className={baseInputClasses} value={form.hours_at_sea} placeholder="Optional" aria-label="Hours at Sea"
                    onChange={(e) => set('hours_at_sea', e.target.value)} />
                </FormCell>
                <FormCell label="Total Catch"><FormValue>{total > 0 ? `${total.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg` : ''}</FormValue></FormCell>
              </FormRow>
              <FormRow>
                <FormCell label="Remarks" wide>
                  <textarea className={`${baseInputClasses} h-auto py-2`} rows={2} value={form.remarks} aria-label="Remarks" onChange={(e) => set('remarks', e.target.value)} />
                </FormCell>
              </FormRow>
            </FormRows>
          </FormSection>

          <FormSection title="Species Caught">
            <div className="space-y-3 p-3">
              <EntryTable label="Species caught" testId="catch-species-table">
                <EntryHead>
                  <EntryTh required>Species Name</EntryTh>
                  <EntryTh required>Volume (kg)</EntryTh>
                  <EntryTh>Notes</EntryTh>
                  <EntryTh className="w-10"><span className="sr-only">Remove</span></EntryTh>
                </EntryHead>
                <tbody>
                  {speciesRows.map((row, i) => (
                    <EntryRow key={row.id ?? `new-${i}`}>
                      <EntryCell label="Species Name *">
                        <ComboboxWithOther options={SPECIES_NAMES} value={row.species_name} otherValue={row.species_name_other || ''}
                          onChange={(v) => setRow(i, 'species_name', v)} onOtherChange={(v) => setRow(i, 'species_name_other', v)} placeholder="Select Species" />
                      </EntryCell>
                      <EntryCell label="Volume (kg) *">
                        <input type="number" step="0.01" min="0.01" className={baseInputClasses} placeholder="0.00" value={row.volume_kg} aria-label={`Species ${i + 1} volume (kg)`}
                          onChange={(e) => setRow(i, 'volume_kg', e.target.value)} />
                      </EntryCell>
                      <EntryCell label="Notes">
                        <input type="text" className={baseInputClasses} maxLength={200} placeholder="Optional" value={row.notes} aria-label={`Species ${i + 1} notes`}
                          onChange={(e) => setRow(i, 'notes', e.target.value)} />
                      </EntryCell>
                      <EntryCell className="md:pt-3">
                        <button type="button" onClick={() => setSpeciesRows((rows) => rows.filter((_, j) => j !== i))} disabled={speciesRows.length === 1}
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" aria-label={`Remove species ${i + 1}`}>
                          <X size={14} aria-hidden="true" />
                        </button>
                      </EntryCell>
                    </EntryRow>
                  ))}
                </tbody>
              </EntryTable>
              <AddButton onClick={() => setSpeciesRows((rows) => [...rows, emptySpeciesRow()])}>Add Species</AddButton>
            </div>
          </FormSection>

          {isEdit && isAdmin && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="mb-1 text-[12px] font-semibold text-rose-700">Danger Zone</p>
              <p className="mb-2 text-[11px] text-rose-600">Permanently delete this catch log and its species entries.</p>
              <Button type="button" size="sm" variant="outline" icon={Trash2} onClick={() => setShowDeleteConfirm(true)}>Delete this record</Button>
            </div>
          )}
        </form>
      </ModalShell>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Catch Log?"
          message="This action cannot be undone."
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

export default LogCatchModal
