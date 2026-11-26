import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, MapPinned } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ImportFileModal from '../../components/ImportFileModal.jsx'
import Button from '../../components/UI/Button.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StepIndicator from '../../components/UI/StepIndicator.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useDraftState from '../../hooks/useDraftState.js'
import { uploadPcicForm } from '../../utils/pcic.js'
import { cropRecordsFromImport } from '../Farmers/importedCropRecords.js'
import ParcelCropsImportModal from '../Farmers/ParcelCropsImportModal.jsx'
import { MAX_PARCELS, buildPayload, makeParcelRow, pcicUploads, serverErrorsToMessages, validateDetails, validateRows } from '../Farmers/parcelRows.js'
import useParcelClassifications from '../Farmers/useParcelClassifications.js'
import { makeCropRecord } from '../Monitoring/cropRecordForm.js'
import { useCropFormLookups } from '../Monitoring/useCropFormLookups.js'
import ParcelCropsStep from './ParcelCropsStep.jsx'
import ParcelDetailsStep from './ParcelDetailsStep.jsx'
import ParcelReviewStep from './ParcelReviewStep.jsx'
import { ownerParcelFill } from './parcelRecords.js'
import { WIZARD_STEPS, firstProblem, serverErrorStep } from './parcelWizard.js'

// Add Farm Parcels: a window over Crop Records or a farmer's profile, in three steps. 1. Parcel Details (the farmer, then one table
// form per parcel). 2. Add Crops (optional; the Add Crop Records form for each parcel). 3. Review and Save. Everything is saved
// together or not at all (POST /farmers/<id>/parcels/bulk/).

const NO_FARMER = { farmer_id: null, farmer_full_name: '', farmer_home_barangay: '', farmer_assoc_id: null, farmer_assoc_name: '' }
const makeBlankWork = () => ({ farmerInfo: NO_FARMER, rows: [makeParcelRow(1)] })
const FIX = { parcels: 'Please fix the highlighted parcels.', crops: 'Please fix the crops of the highlighted parcels.' }

// startFarmerId: the farmer to begin with (their profile, or a link for one farmer). lockFarmer: that farmer cannot be changed.
// onSaved: parcels were added, so the page behind reads its list again.
export default function AddFarmParcelsWindow({ startFarmerId = '', lockFarmer = false, onClose, onSaved }) {
  const { showToast } = useToast()
  const classifications = useParcelClassifications()

  // What is being filled in is a draft: it is still here when the window is opened again (see hooks/useDraftState.js).
  const [work, setWork, draft] = useDraftState(`add-farm-parcels:${startFarmerId || ''}`, makeBlankWork)
  const { farmerInfo, rows } = work
  const setFarmerInfo = useCallback((next) => setWork((w) => ({ ...w, farmerInfo: typeof next === 'function' ? next(w.farmerInfo) : next })), [setWork])
  const setRows = useCallback((next) => setWork((w) => ({ ...w, rows: typeof next === 'function' ? next(w.rows) : next })), [setWork])
  // The next ids start after the ones of a restored draft.
  const nextIdRef = useRef(Math.max(1, ...rows.map((r) => r._id)) + 1)
  const nextCropIdRef = useRef(Math.max(0, ...rows.flatMap((r) => (r.crop_records || []).map((c) => c._id))) + 1)
  const lookups = useCropFormLookups()
  const offered = [...new Set([...(classifications || []).map((c) => c.name), ...rows.flatMap((r) => r.classifications || [])])]

  const [step, setStep] = useState('parcels')
  const [existing, setExisting] = useState(null)                      // the farmer's parcels already on file
  const [parcelsTick, setParcelsTick] = useState(0)                   // bumped after an import so the parcels on file are read again
  const [farmerTick, setFarmerTick] = useState(0)                     // bumped after a discard so the starting farmer is loaded again
  const [importingCropsFor, setImportingCropsFor] = useState(null)    // the id of the parcel whose crops file is being read
  const [isImportingParcels, setIsImportingParcels] = useState(false) // the Import Farm Parcels file dialog (parcels of the chosen farmer)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [rowErrors, setRowErrors] = useState({})
  const [attention, setAttention] = useState(0)                       // bumped to bring the first highlighted parcel into view
  const bodyRef = useRef(null)

  useEffect(() => {
    if (!startFarmerId) return undefined
    let alive = true
    api.get(`/farmers/${startFarmerId}/`).then((r) => {
      if (!alive) return
      const f = r.data
      setFarmerInfo({ farmer_id: f.id, farmer_full_name: f.full_name, farmer_home_barangay: f.barangay || '', farmer_assoc_id: null, farmer_assoc_name: '' })
    }).catch(() => { if (alive) showToast('Could not load that farmer. Search for them instead.', 'error') })
    return () => { alive = false }
  }, [startFarmerId, farmerTick, showToast, setFarmerInfo])

  // The parcels the farmer already has, so the window can say so (the server refuses a repeated parcel number).
  useEffect(() => {
    if (!farmerInfo.farmer_id) return undefined
    let alive = true
    api.get(`/farmers/${farmerInfo.farmer_id}/parcels/`)
      .then((r) => { if (alive) setExisting({ farmerId: farmerInfo.farmer_id, list: Array.isArray(r.data) ? r.data : (r.data.results || []) }) })
      .catch(() => { if (alive) setExisting(null) })
    return () => { alive = false }
  }, [farmerInfo.farmer_id, parcelsTick])
  const existingList = existing && existing.farmerId === farmerInfo.farmer_id ? existing.list : null
  const onFile = { taken: (existingList || []).map((p) => p.parcel_number), farmerName: farmerInfo.farmer_full_name }

  // A new step starts at its top. (The window's scrolling area is the box around this content.)
  const scrollToTop = () => bodyRef.current?.parentElement?.scrollTo({ top: 0 })
  useEffect(() => { scrollToTop() }, [step])
  useEffect(() => {
    if (attention) bodyRef.current?.querySelector('[data-has-error="true"]')?.scrollIntoView({ block: 'center' })
  }, [attention])

  const goTo = (next) => { setError(''); setRowErrors({}); setStep(next) }
  const showProblems = (at, problems, message) => {
    setStep(at)
    setRowErrors(problems)
    setError(message)
    setAttention((n) => n + 1)
  }

  // "Discard draft": a blank form again, from step 1, for the farmer the window was opened for.
  const startOver = () => {
    draft.discard()
    setFarmerTick((n) => n + 1)
    setStep('parcels')
    setRowErrors({})
    setError('')
  }

  const addRow = () => {
    if (rows.length >= MAX_PARCELS) { setError(`You can add at most ${MAX_PARCELS} parcels at a time.`); return }
    setRows((rs) => [...rs, makeParcelRow(nextIdRef.current++)])
  }
  const removeRow = (id) => setRows((rs) => rs.filter((r) => r._id !== id))
  const updateRow = (id, patch) => setRows((rs) => rs.map((r) => (r._id === id ? { ...r, ...patch } : r)))

  // The crops of a crops file are added to the parcel's own list (to check and correct there), the same rows as Add crop makes.
  const importCrops = (imported) => {
    const firstId = nextCropIdRef.current
    nextCropIdRef.current += imported.length
    setRows((rs) => rs.map((r) => (r._id === importingCropsFor
      ? { ...r, crop_records: [...r.crop_records, ...cropRecordsFromImport(imported, { parcel: r, cropTypes: lookups.cropTypes, varieties: lookups.varieties, firstId })] }
      : r)))
    showToast(`${imported.length} crop${imported.length === 1 ? '' : 's'} added.`, 'success')
    setImportingCropsFor(null)
  }
  // The crops of a parcel (functional updates: one change of a crop type sets several fields in a row).
  const addCrop = (rowId, parcelInfo) => {
    const blank = makeCropRecord(nextCropIdRef.current++)
    const record = { ...blank, ...ownerParcelFill([parcelInfo], blank) }
    setRows((rs) => rs.map((r) => (r._id === rowId ? { ...r, crop_records: [...r.crop_records, record] } : r)))
  }
  const updateCrop = (rowId, recordId, field, value) =>
    setRows((rs) => rs.map((r) => (r._id === rowId ? { ...r, crop_records: r.crop_records.map((c) => (c._id === recordId ? { ...c, [field]: value } : c)) } : r)))
  const removeCrop = (rowId, recordId) =>
    setRows((rs) => rs.map((r) => (r._id === rowId ? { ...r, crop_records: r.crop_records.filter((c) => c._id !== recordId) } : r)))

  const leaveDetails = () => {
    if (!farmerInfo.farmer_id) { setError('Please select a farmer.'); scrollToTop(); return }
    const problems = validateDetails(rows, onFile)
    if (Object.keys(problems).length) showProblems('parcels', problems, FIX.parcels)
    else goTo('crops')
  }
  const leaveCrops = () => {
    const problems = validateRows(rows, onFile)
    if (Object.keys(problems).length) showProblems('crops', problems, FIX.crops)
    else goTo('review')
  }

  const save = async () => {
    // Checked again: the farmer's parcels may have arrived after the earlier steps were left.
    const found = firstProblem(rows, onFile)
    if (found) { showProblems(found.step, found.problems, FIX[found.step]); return }
    setError('')
    setIsSubmitting(true)
    try {
      const { data: created } = await api.post(`/farmers/${farmerInfo.farmer_id}/parcels/bulk/`, buildPayload(rows, { farmerInfo, cropTypes: lookups.cropTypes }))
      const photoFailures = []
      for (const upload of pcicUploads(rows, created, (r) => lookups.cropTypes.find((c) => String(c.id) === String(r.crop_type))?.name || 'a crop')) {
        try {
          await uploadPcicForm(api, 'planting', upload.recordId, upload.pcic)
        } catch {
          photoFailures.push(upload.label)
        }
      }
      if (photoFailures.length) showToast(`Saved, but the PCIC form photo could not be uploaded for: ${photoFailures.join(', ')}. Add it later from the farmer's profile.`, 'error')
      showToast(`${rows.length} farm parcel${rows.length > 1 ? 's' : ''} added.`, 'success')
      draft.clear()
      onSaved?.()
      onClose()
    } catch (err) {
      const data = err?.response?.data
      if (data?.errors && Array.isArray(data.errors)) {
        showProblems(serverErrorStep(data.errors), serverErrorsToMessages(data.errors, rows), 'Nothing was saved — fix the highlighted parcel(s) and try again.')
      } else {
        setError(data?.detail || 'Nothing was saved — failed to add these parcels.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const close = () => {
    if (isSubmitting) return
    // Opened for one farmer and nothing typed: there is no work to keep.
    if (startFarmerId && JSON.stringify(rows) === JSON.stringify(makeBlankWork().rows)) draft.clear()
    onClose()
  }

  const stepIndex = WIZARD_STEPS.findIndex((s) => s.key === step)
  const back = (to) => (
    <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => goTo(to)}>
      <ArrowLeft size={14} aria-hidden="true" /> Back
    </Button>
  )
  const footer = (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      {step === 'parcels' && <Button type="button" variant="outline" onClick={close}>Cancel</Button>}
      {step === 'crops' && back('parcels')}
      {step === 'review' && back('crops')}
      {step === 'parcels' && (
        <Button type="button" onClick={leaveDetails}>Next: Add Crops <ArrowRight size={14} aria-hidden="true" /></Button>
      )}
      {step === 'crops' && (
        <Button type="button" onClick={leaveCrops}>Next: Review and Save <ArrowRight size={14} aria-hidden="true" /></Button>
      )}
      {step === 'review' && (
        <Button type="button" isLoading={isSubmitting} disabled={isSubmitting} onClick={save}>
          {isSubmitting ? 'Saving…' : `Save ${rows.length > 1 ? `${rows.length} Parcels` : 'Parcel'}`}
        </Button>
      )}
    </div>
  )

  return (
    <>
      <ModalShell
        title="Add Farm Parcels"
        subtitle={farmerInfo.farmer_id ? `For ${farmerInfo.farmer_full_name}` : 'Add one or more parcels to a farmer, with the crops planted on them.'}
        icon={MapPinned}
        onClose={close}
        maxWidth={step === 'crops' ? 'max-w-[90rem]' : 'max-w-6xl'}   // the crop table is wide
        footer={footer}
      >
        <div ref={bodyRef} className="space-y-4" data-testid="add-parcels-window">
          <StepIndicator steps={WIZARD_STEPS} currentIndex={stepIndex} />
          <DraftBanner draft={{ ...draft, discard: startOver }} />
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-[13px] text-rose-700">{error}</p>}

          {step === 'parcels' && (
            <>
              <p className="text-[12px] text-[#4A5E4A]"><span className="text-rose-500">*</span> Required field</p>
              <ParcelDetailsStep
                farmerInfo={farmerInfo}
                farmerLocked={lockFarmer && String(farmerInfo.farmer_id) === String(startFarmerId)}
                onSelectFarmer={setFarmerInfo}
                existingList={existingList}
                onImportParcels={() => setIsImportingParcels(true)}
                rows={rows}
                offered={offered}
                rowErrors={rowErrors}
                onUpdate={updateRow}
                onRemove={removeRow}
                onAdd={addRow}
              />
            </>
          )}
          {step === 'crops' && (
            <ParcelCropsStep rows={rows} rowErrors={rowErrors} lookups={lookups}
              onAdd={addCrop} onImport={setImportingCropsFor} onUpdate={updateCrop} onRemove={removeCrop} />
          )}
          {step === 'review' && <ParcelReviewStep rows={rows} cropTypes={lookups.cropTypes} farmerName={farmerInfo.farmer_full_name} />}
        </div>
      </ModalShell>

      {isImportingParcels && farmerInfo.farmer_id && (
        <ImportFileModal
          title="Import Farm Parcels"
          subtitle={`Add farm parcels, with the crops grown on them, to ${farmerInfo.farmer_full_name} from a spreadsheet.`}
          helpText="One row per crop, with the parcel columns repeated. Rows with the same Parcel Number become one parcel; a parcel without crops is one row with the crop columns left blank."
          importUrl={`/farmers/${farmerInfo.farmer_id}/parcels/import/`}
          templateUrl="/farmers/parcels/import/template/"
          templateFilename="farm_parcels_import_template.xlsx"
          undoType="farm_parcels"
          onClose={() => setIsImportingParcels(false)}
          onImported={() => { setParcelsTick((t) => t + 1); onSaved?.() }}
        />
      )}
      {importingCropsFor !== null && <ParcelCropsImportModal kind="crops" onClose={() => setImportingCropsFor(null)} onRows={importCrops} />}
    </>
  )
}
