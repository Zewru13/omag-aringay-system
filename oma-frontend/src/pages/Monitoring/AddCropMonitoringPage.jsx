import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, Plus } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { sameCrop } from '../../utils/cropNames.js'
import { ownerParcelFill, parcelProblem } from '../CropInformation/parcelRecords.js'
import { areaProblem, defaultPlantingMaterial, needsLandOwner, withFixedStatus } from '../CropInformation/cropEntry.js'
import CropRecordsTable from './CropRecordsTable.jsx'
import { buildCropRecordPayload, cropRecordProblem, makeCropRecord } from './cropRecordForm.js'
import { useCropFormLookups } from './useCropFormLookups.js'
import api from '../../api/axiosInstance.js'
import FarmerSearchInput from '../../components/FarmerSearchInput.jsx'
import Button from '../../components/UI/Button.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { uploadPcicForm } from '../../utils/pcic.js'

// ── Required / Optional legend — mirrors the reference form's key so staff
// don't have to guess which of the now-always-visible columns are optional. ──

function RequiredOptionalLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[12px] text-[#4A5E4A]">
      <span className="flex items-center gap-1">
        <span className="text-rose-500">*</span> Required field
      </span>
      <span className="flex items-center gap-1.5">
        <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-[#4A5E4A] text-white">opt</span>
        Optional — leave blank if not applicable
      </span>
    </div>
  )
}

// ── Confirm Submission — review step before the actual save ──────────────────

function ConfirmSubmissionModal({ records, cropTypes, farmerFullName, isSubmitting, onConfirm, onCancel }) {
  const period = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const cropName = (id) => cropTypes.find(c => String(c.id) === String(id))?.name || '—'

  return (
    <ModalShell
      title="Confirm Submission"
      subtitle={`Crop Monitoring Records · ${period}`}
      icon={CheckCircle2}
      iconBg="bg-emerald-100"
      iconColor="text-emerald-700"
      onClose={onCancel}
      maxWidth="max-w-lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onCancel}>Go Back &amp; Review</Button>
          <Button type="button" isLoading={isSubmitting} onClick={onConfirm}>Confirm &amp; Submit</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-800" aria-hidden="true" />
          <div>
            <p className="text-[13px] font-semibold text-emerald-800">
              {records.length} record{records.length === 1 ? '' : 's'} will be added
            </p>
            <p className="mt-0.5 text-[13px] text-emerald-700">
              Crop monitoring · for {farmerFullName}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
          <p className="text-[13px] text-amber-800">
            <span className="font-semibold">All-or-nothing:</span> if any row fails server-side validation, none of
            the {records.length} record{records.length === 1 ? '' : 's'} will be saved. Review all entries before confirming.
          </p>
        </div>

        <div className="rounded-2xl border border-[#E2E8E2] bg-white">
          <p className="border-b border-[#E2E8E2] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#7A8E7A]">
            Row Summary
          </p>
          <div className="max-h-64 divide-y divide-[#F0F4F0] overflow-y-auto">
            {records.map((rec, i) => (
              <div key={rec._id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[#1A2B1A]">
                    #{i + 1} {rec.farm_location_barangay || '—'}
                  </p>
                  <p className="truncate text-[12px] text-[#7A8E7A]">
                    {cropName(rec.crop_type)}{rec.variety_used ? ` — ${rec.variety_used}` : ''}
                  </p>
                </div>
                <p className="shrink-0 text-[13px] text-[#4A5A4C]">{rec.area_planted_ha || '0'} ha</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AddCropMonitoringPage() {
  const navigate = useNavigate()
  // Arriving from a farmer's profile ("Start monitoring" on a declared parcel
  // crop) carries the farmer, parcel, crop and area to start the first row from.
  // The planting date is left for staff: a declared crop has none.
  const prefill = useLocation().state?.prefill || null
  // "Add crops" in a parcel's ⋮ menu (Crop Records) locks the page to that parcel: its farmer and parcel cannot be changed.
  const lockedParcel = prefill?.lockParcel ? prefill.parcel : null
  const prefillApplied = useRef(false)
  const { showToast } = useToast()
  const { cropTypes, seedSources, varieties } = useCropFormLookups()
  const [records,      setRecords]      = useState([makeCropRecord(1)])
  // Ref, not state: two addRecord() calls in the same tick (e.g. a fast
  // double-click) must never read the same "next id" — a state variable
  // updated via setNextId(n => n + 1) doesn't advance until the next
  // render, so both calls would build a row with the same _id, giving React
  // two list children with duplicate keys.
  const nextIdRef = useRef(2)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [error,        setError]        = useState('')
  const [rowErrors,    setRowErrors]    = useState({})

  // Shared farmer state — applies to ALL crop records in this session
  const [farmerInfo, setFarmerInfo] = useState({
    farmer_id: null,
    farmer_full_name: '',
    farmer_home_barangay: '',
    farmer_assoc_id: null,
    farmer_assoc_name: '',
  })
  const [farmerParcels, setFarmerParcels] = useState([])
  const [parcelsReadyFor, setParcelsReadyFor] = useState(null)

  // Resolve the prefilled farmer through the same list the search box uses, so
  // the farmer's organization comes through exactly as if they were picked there.
  useEffect(() => {
    if (!prefill?.farmerId) return
    api.get('/farmers/', { params: { search: prefill.rsbsa } }).then((r) => {
      const list = Array.isArray(r.data) ? r.data : (r.data.results || [])
      const f = list.find((x) => x.id === prefill.farmerId)
      if (f) {
        setFarmerInfo({
          farmer_id: f.id,
          farmer_full_name: f.full_name,
          farmer_home_barangay: f.barangay || '',
          farmer_assoc_id: f.farmers_organization || null,
          farmer_assoc_name: f.farmers_organization_name || '',
        })
      }
    }).catch(() => {})
  }, [prefill])

  const goBack = () => navigate('/crop-records')

  useEffect(() => {
    setRecords(r => r.map(x => ({ ...x, farm_parcel: '' })))
    if (!farmerInfo.farmer_id) { setFarmerParcels([]); return }
    const farmerId = farmerInfo.farmer_id
    api.get(`/farmers/${farmerId}/parcels/`)
      .then(r => {
        const all = Array.isArray(r.data) ? r.data : (r.data.results || [])
        const list = lockedParcel ? all.filter(p => p.id === lockedParcel.id) : all
        setFarmerParcels(list)
        setParcelsReadyFor(farmerId)
        // A farmer with a single parcel does not have to choose it.
        setRecords(rs => rs.map(x => ({ ...x, ...ownerParcelFill(list, x) })))
      })
      .catch(() => { setFarmerParcels([]); setParcelsReadyFor(null) })
  }, [farmerInfo.farmer_id, lockedParcel])

  const showParcelColumn = farmerParcels.length > 0
  const parcelsReady = Boolean(farmerInfo.farmer_id) && parcelsReadyFor === farmerInfo.farmer_id
  const hasNoParcel = parcelsReady && farmerParcels.length === 0

  // Once the crop catalog and the farmer's parcels are in, fill the first row
  // from the prefill (once).
  useEffect(() => {
    if (!prefill || prefillApplied.current || !cropTypes.length || !farmerParcels.length) return
    const parcel = farmerParcels.find((p) => p.id === prefill.parcel.id)
    if (!parcel) return
    prefillApplied.current = true
    const crop = cropTypes.find((ct) => sameCrop(ct.name, prefill.cropName))
    setRecords((rs) => rs.map((x, i) => (i > 0 ? x : {
      ...x,
      farm_parcel: String(parcel.id),
      farm_location_barangay: parcel.barangay || '',
      land_status: ['Owner', 'Tenant', 'Lessee'].includes(parcel.land_ownership) ? parcel.land_ownership : '',
      land_owner_name: needsLandOwner(parcel.land_ownership) ? (parcel.land_owner_name || '') : '',
      planting_material: defaultPlantingMaterial(crop),
      crop_type: crop ? String(crop.id) : '',
      area_planted_ha: prefill.areaHa ? String(prefill.areaHa) : '',
    })))
  }, [prefill, cropTypes, farmerParcels])

  const addRecord = () => {
    const id = nextIdRef.current++
    // A farmer with one parcel (or a page locked to one) does not have to choose it on every new row either.
    const row = makeCropRecord(id)
    setRecords(r => [...r, { ...row, ...ownerParcelFill(farmerParcels, row) }])
  }

  const removeRecord = (id) => setRecords(r => r.filter(x => x._id !== id))

  const updateRecord = (id, field, value) => {
    setRecords(r => r.map(x => x._id === id ? { ...x, [field]: value } : x))
  }

  // A page locked to a parcel the farmer owns: every crop is the owner's own (its Crop Status column is not shown).
  const asRecorded = (rec) => (lockedParcel ? withFixedStatus(rec, farmerParcels[0]) : rec)
  const buildPayload = (rec) => buildCropRecordPayload(asRecorded(rec), {
    farmerInfo, cropTypes, barangay: lockedParcel ? (lockedParcel.barangay || '') : rec.farm_location_barangay,
  })

  const validate = () => {
    if (!farmerInfo.farmer_id) { setError('Please select a farmer.'); return false }
    const noParcel = parcelProblem({ farmerId: farmerInfo.farmer_id, ready: parcelsReady, parcels: farmerParcels, rows: records })
    if (noParcel) { setError(noParcel); return false }
    const nextRowErrors = {}
    const checked = records.map(asRecorded)
    records.forEach((rec, i) => {
      const problem = cropRecordProblem(checked, i, farmerParcels, { needsBarangay: !lockedParcel })
      if (problem) nextRowErrors[rec._id] = `Row ${i + 1}: ${problem}`
    })
    if (Object.keys(nextRowErrors).length > 0) {
      setRowErrors(nextRowErrors)
      setError('Please fix the highlighted rows.')
      return false
    }
    setRowErrors({})
    return true
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (!validate()) return
    setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setIsSubmitting(true)
    try {
      const { data: created } = await api.post('/production/monitoring/bulk/', records.map(buildPayload))
      const photoFailures = []
      for (let i = 0; i < records.length; i += 1) {
        try {
          await uploadPcicForm(api, 'planting', created[i].id, records[i].pcic)
        } catch {
          photoFailures.push(`row ${i + 1}`)
        }
      }
      setShowConfirm(false)
      if (photoFailures.length) {
        showToast(`Records saved, but the PCIC form photo could not be uploaded for ${photoFailures.join(', ')}. Edit the record to try again.`, 'error')
      }
      showToast(`${records.length} crop monitoring record${records.length > 1 ? 's' : ''} added.`, 'success')
      navigate('/crop-records')
    } catch (err) {
      setShowConfirm(false)
      const data = err?.response?.data
      if (data?.errors && Array.isArray(data.errors)) {
        const nextRowErrors = {}
        data.errors.forEach((rowErr, i) => {
          if (rowErr && Object.keys(rowErr).length > 0) {
            const rec = records[i]
            // The duplicate refusal is a full sentence; every other error keeps its field name in front.
            const msgs = Object.entries(rowErr).map(([k, v]) => {
              const text = Array.isArray(v) ? v[0] : v
              return k === 'crop_type' && /already has an active|duplicates row/.test(String(text)) ? text : `${k.replace(/_/g, ' ')}: ${text}`
            })
            nextRowErrors[rec._id] = `Row ${i + 1}: ${msgs.join(' · ')}`
          }
        })
        setRowErrors(nextRowErrors)
        setError('Nothing was saved — fix the highlighted row(s) and try again.')
      } else {
        setError(data?.detail || 'Nothing was saved — failed to add these records.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <PageLayout
      title={lockedParcel ? 'Add Crops to Parcel' : 'Add Crop Monitoring Records'}
      subtitle={lockedParcel
        ? `Every row is a crop recorded on parcel ${prefill.parcelLabel}. Fill all required fields before submitting.`
        : 'Each row is one crop record for this reporting period. Fill all required fields before submitting.'}
    >
      <button
        type="button"
        onClick={goBack}
        className="mb-4 inline-flex items-center gap-1 text-[13px] text-[#1B4D2E] hover:underline max-md:min-h-[40px]"
      >
        <ArrowLeft size={14} /> Back to Crop Records
      </button>

      <form onSubmit={handleSubmit} className="space-y-5">
        <RequiredOptionalLegend />

        {/* Farmer (entered once, kept from the previous design — every row in
            this batch is still attributed to one farmer, unlike the barangay-
            only paper-form reference this redesign otherwise follows). */}
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 mb-3">
            Farmer Information
          </p>
          {lockedParcel ? (
            <div className="max-w-xl rounded-lg border border-[#E2E8E2] bg-white px-3 py-2.5">
              <p className="text-[14px] font-semibold text-[#1A2B1A]">{farmerInfo.farmer_full_name || prefill.farmerName}</p>
              <p className="text-[12px] text-[#7A8E7A]">{prefill.rsbsa}</p>
            </div>
          ) : (
            <div className="max-w-xl">
              <FarmerSearchInput onSelect={setFarmerInfo} selected={farmerInfo} />
            </div>
          )}
          {farmerInfo.farmer_id && (
            <div className="grid grid-cols-2 gap-3 mt-3 max-w-xl">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A8BCA8] mb-0.5">Home Barangay</p>
                <p className="text-xs font-medium text-[#1A2B1A]">{farmerInfo.farmer_home_barangay || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A8BCA8] mb-0.5">Organization</p>
                <p className="text-xs font-medium text-[#1A2B1A]">{farmerInfo.farmer_assoc_name || 'Non-organization'}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
          <Info size={16} className="mt-0.5 shrink-0 text-sky-800" aria-hidden="true" />
          <p className="text-[13px] text-sky-800">
            <span className="font-semibold">All-or-nothing submission:</span> every row must pass validation before
            any record is saved. An error in one row prevents all rows from saving.
          </p>
        </div>

        {hasNoParcel && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
            <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{farmerInfo.farmer_full_name || 'This farmer'} has no farm parcel yet.</span>{' '}
              A crop is recorded on a farm parcel, so add the parcel first, then come back to add the crop.
            </span>
            <Link to={`/crop-records/add-parcels?farmer=${farmerInfo.farmer_id}`} className="inline-flex min-h-[40px] items-center rounded-lg bg-amber-900 px-3 font-semibold text-white hover:bg-amber-950">
              Add farm parcels
            </Link>
          </div>
        )}
        {lockedParcel && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-[#C8D5C8] bg-[#EBF5EE] px-4 py-3 text-[13px] text-[#1B4D2E]">
            <span><span className="font-semibold">Parcel:</span> {prefill.parcelLabel}</span>
            <span><span className="font-semibold">Area:</span> {Number(prefill.parcelAreaHa).toFixed(2)} ha</span>
            <span><span className="font-semibold">Barangay:</span> {lockedParcel.barangay}</span>
            <span className="text-[#4A5E4A]">You can only add crops to this parcel. The crops growing on it together cannot be more than its area.</span>
          </div>
        )}
        {showParcelColumn && !lockedParcel && (
          <p className="text-[12px] text-[#4A5E4A]">
            <span className="font-semibold">Farm Parcel:</span> every crop is grown on one of this farmer's parcels. A farmer
            with a single parcel has it chosen already; with several, choose one for each row.
          </p>
        )}

        {/* Crop records — a horizontal table, every field visible (no expand toggle); on a phone each record is a stacked card */}
        <CropRecordsTable
          records={records}
          cropTypes={cropTypes}
          seedSources={seedSources}
          varieties={varieties}
          farmerId={farmerInfo.farmer_id}
          farmerParcels={farmerParcels}
          showParcelColumn={showParcelColumn}
          parcelLocked={Boolean(lockedParcel)}
          rowErrors={rowErrors}
          areaErrors={Object.fromEntries(records.map((r, i) => [r._id, areaProblem(records, i, farmerParcels)]))}
          onUpdate={updateRecord}
          onRemove={removeRecord}
        />

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={addRecord}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B4D2E] px-3.5 py-2 text-[13px] font-medium text-white hover:bg-[#235E38] transition-colors"
          >
            <Plus size={14} /> Add Row
          </button>
          <span className="text-[12.5px] text-[#7A8E7A]">{records.length} row{records.length === 1 ? '' : 's'}</span>
        </div>

        {error && (
          <p className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 border-t border-[#F0F4F0] pt-4">
          <button type="button" onClick={goBack}
            className="rounded-lg border border-[#C8D5C8] px-5 py-2 text-sm font-medium text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting}
            className="rounded-lg bg-[#1B4D2E] px-5 py-2 text-sm font-medium text-white hover:bg-[#235E38] transition-colors disabled:opacity-60">
            {isSubmitting ? 'Submitting…' : `Submit ${records.length > 1 ? `${records.length} Records` : 'Record'}`}
          </button>
        </div>
      </form>

      {showConfirm && (
        <ConfirmSubmissionModal
          records={records}
          cropTypes={cropTypes}
          farmerFullName={farmerInfo.farmer_full_name}
          isSubmitting={isSubmitting}
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </PageLayout>
  )
}
