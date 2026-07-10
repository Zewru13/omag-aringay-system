import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Fish } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import { getPrefixOptions, isPrefixValidForGender } from '../../utils/prefixOptions.js'

const labelCls = 'text-[13px] font-medium text-[#4A5E4A] mb-1.5 block'

const initialForm = {
  prefix: '',
  fishr_number: '',
  rsbsa_number: '',
  boatr_number: '',
  fish_registration_number: '',
  first_name: '',
  last_name: '',
  middle_name: '',
  gender: 'Male',
  birthdate: '',
  contact_number: '',
  barangay: '',
  fisherfolk_type: 'Aquaculture',
  is_pwd: false,
  is_4ps_beneficiary: false,
  is_icc_ip_member: false,
  icc_ip_name: '',
  fisherfolk_association: null,
  is_aquaculture: true,
  is_capture_fishery: false,
  is_mariculture: false,
  is_inland_fishery: false,
  is_fish_vendor: false,
}

const computeAge = (birthdate) => {
  if (!birthdate) return null
  const birth = new Date(birthdate)
  const today = new Date()
  const age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  return (m < 0 || (m === 0 && today.getDate() < birth.getDate())) ? age - 1 : age
}

const validateContact = (value) => {
  if (!value) return ''
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 11) return 'Contact number must be exactly 11 digits.'
  if (!digits.startsWith('09')) return 'Contact number must start with 09.'
  return ''
}

const getMaxBirthdate = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 10)
  return d.toISOString().split('T')[0]
}

function AddFisherfolkModal({ onClose, onSuccess }) {
  const [form,          setForm]          = useState(initialForm)
  const [associations,  setAssociations]  = useState([])
  const [prefixResetNote, setPrefixResetNote] = useState('')
  const [contactError,  setContactError]  = useState('')
  const [fieldErrors,   setFieldErrors]   = useState({})
  const [formError,     setFormError]     = useState('')
  const [isSubmitting,  setIsSubmitting]  = useState(false)
  const [duplicates,    setDuplicates]    = useState([])
  const [dupChecking,   setDupChecking]   = useState(false)
  const dupTimer = useRef(null)

  useEffect(() => {
    api.get('/associations/fisherfolk/')
      .then(r => setAssociations(r.data.results || r.data))
      .catch(console.error)
  }, [])

  useEffect(() => {
    const { first_name, last_name, birthdate } = form
    if (!first_name.trim() || !last_name.trim() || !birthdate) {
      setDuplicates([]); return
    }
    clearTimeout(dupTimer.current)
    dupTimer.current = setTimeout(async () => {
      setDupChecking(true)
      try {
        const r = await api.get('/fisheries/fisherfolk/check-duplicate/', {
          params: { first_name: first_name.trim(), last_name: last_name.trim(), birth_date: birthdate },
        })
        setDuplicates(r.data?.duplicates || [])
      } catch {
        setDuplicates([])
      } finally {
        setDupChecking(false)
      }
    }, 500)
    return () => clearTimeout(dupTimer.current)
  }, [form.first_name, form.last_name, form.birthdate])

  const updateField = (field, value) => {
    if (field === 'contact_number') {
      const digits = value.replace(/\D/g, '').slice(0, 11)
      setForm((c) => ({ ...c, contact_number: digits }))
      setContactError(validateContact(digits))
      return
    }
    if (field === 'gender') {
      setForm((c) => {
        if (c.prefix && !isPrefixValidForGender(c.prefix, value)) {
          setPrefixResetNote('Prefix reset — please reselect.')
          return { ...c, gender: value, prefix: '' }
        }
        setPrefixResetNote('')
        return { ...c, gender: value }
      })
      return
    }
    if (field === 'prefix') {
      setPrefixResetNote('')
    }
    if (field === 'is_capture_fishery') {
      setForm((c) => ({ ...c, is_capture_fishery: value, boatr_number: value ? c.boatr_number : '' }))
      return
    }
    setForm((c) => {
      const next = { ...c, [field]: value }
      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    setFieldErrors({})
    const contactErr = validateContact(form.contact_number)
    if (contactErr) { setContactError(contactErr); return }
    setIsSubmitting(true)
    try {
      const res = await api.post('/fisheries/fisherfolk/', form)
      onSuccess(res.data?.lgu_registration_number)
      onClose()
    } catch (error) {
      const data = error.response?.data
      if (data && typeof data === 'object' && !data.detail) {
        const fieldErrs = {}
        let hasField = false
        Object.entries(data).forEach(([k, v]) => {
          if (k !== 'non_field_errors') { fieldErrs[k] = Array.isArray(v) ? v[0] : v; hasField = true }
        })
        if (hasField) {
          setFieldErrors(fieldErrs)
          setFormError(data.non_field_errors?.[0] || 'Please correct the errors below.')
        } else {
          setFormError(data.detail || data.non_field_errors?.[0] || 'Unable to register fisherfolk. Please check the form and try again.')
        }
      } else {
        setFormError(data?.detail || 'Unable to register fisherfolk. Please check the form and try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const age = computeAge(form.birthdate)

  return (
    <ModalShell title="Register Fisherfolk" subtitle="Fill in the fisherfolk's details below" icon={Fish} onClose={onClose} maxWidth="max-w-3xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="prefix">Prefix</label>
            <select className={baseInputClasses} id="prefix" value={form.prefix} onChange={(e) => updateField('prefix', e.target.value)}>
              {getPrefixOptions(form.gender).map((p) => (
                <option key={p || 'none'} value={p}>{p || '(None)'}</option>
              ))}
            </select>
            {prefixResetNote && <p className="mt-1 text-[12px] text-amber-600">{prefixResetNote}</p>}
          </div>

          <div>
            <label className={labelCls} htmlFor="fisherfolk_type">
              Fisherfolk Type <span className="text-rose-500">*</span>
            </label>
            <select className={baseInputClasses} id="fisherfolk_type" required value={form.fisherfolk_type} onChange={(e) => updateField('fisherfolk_type', e.target.value)}>
              <option value="Aquaculture">Aquaculture</option>
              <option value="Capture">Capture</option>
              <option value="Vendor">Vendor</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>LGU Registration No.</label>
            <p className="text-[13px] text-[#7A8E7A] h-[38px] flex items-center">
              Auto-assigned on save&nbsp;
              <span className="font-mono text-[12px] text-[#4A5E4A]">LU-ARINGAY-{form.barangay ? '{code}' : '??'}-{new Date().getFullYear()}-XXXX</span>
            </p>
          </div>

          <div>
            <label className={labelCls} htmlFor="fishr_number">
              FishR Number <span className="text-[#7A8E7A] font-normal">(optional)</span>
            </label>
            <input className={baseInputClasses} id="fishr_number" value={form.fishr_number} onChange={(e) => updateField('fishr_number', e.target.value)} placeholder="e.g. BFAR-001-2025" />
          </div>

          <div>
            <label className={labelCls} htmlFor="rsbsa_number">
              RSBSA Number <span className="text-[#7A8E7A] font-normal">(optional)</span>
            </label>
            <input className={baseInputClasses} id="rsbsa_number" value={form.rsbsa_number} onChange={(e) => updateField('rsbsa_number', e.target.value)} placeholder="e.g. RSBSA-123456" />
          </div>

          {form.is_capture_fishery && (
            <div>
              <label className={labelCls} htmlFor="boatr_number">
                BoatR Number <span className="text-[#7A8E7A] font-normal">(optional)</span>
              </label>
              <input className={baseInputClasses} id="boatr_number" value={form.boatr_number} onChange={(e) => updateField('boatr_number', e.target.value)} placeholder="e.g. 1234567" />
            </div>
          )}

          {form.fisherfolk_type !== 'Vendor' && (
            <div>
              <label className={labelCls} htmlFor="fish_registration_number">
                Fish Registration No. <span className="text-rose-500">*</span>
              </label>
              <input
                className={`${baseInputClasses} ${fieldErrors.fish_registration_number ? 'border-rose-400' : ''}`}
                id="fish_registration_number"
                required
                value={form.fish_registration_number}
                onChange={(e) => updateField('fish_registration_number', e.target.value)}
                placeholder="14–16 digit number"
                maxLength={16}
              />
              {fieldErrors.fish_registration_number && (
                <p className="mt-1 text-[12px] text-rose-600">{fieldErrors.fish_registration_number}</p>
              )}
            </div>
          )}

          <div>
            <label className={labelCls} htmlFor="first_name">
              First Name <span className="text-rose-500">*</span>
            </label>
            <input className={baseInputClasses} id="first_name" required value={form.first_name} onChange={(e) => updateField('first_name', e.target.value)} />
          </div>

          <div>
            <label className={labelCls} htmlFor="last_name">
              Last Name <span className="text-rose-500">*</span>
            </label>
            <input className={baseInputClasses} id="last_name" required value={form.last_name} onChange={(e) => updateField('last_name', e.target.value)} />
          </div>

          <div>
            <label className={labelCls} htmlFor="middle_name">Middle Name</label>
            <input className={baseInputClasses} id="middle_name" value={form.middle_name} onChange={(e) => updateField('middle_name', e.target.value)} />
          </div>

          <div>
            <label className={labelCls} htmlFor="gender">Sex</label>
            <select className={baseInputClasses} id="gender" value={form.gender} onChange={(e) => updateField('gender', e.target.value)}>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          <div>
            <label className={labelCls} htmlFor="birthdate">
              Birthdate <span className="text-rose-500">*</span>
            </label>
            <input
              className={baseInputClasses}
              id="birthdate"
              max={getMaxBirthdate()}
              required
              type="date"
              value={form.birthdate}
              onChange={(e) => updateField('birthdate', e.target.value)}
            />
            {form.birthdate && age !== null && (
              <p className="mt-1 text-[12px] text-[#4A5E4A]">
                Age: <strong>{age}</strong> years old
                {age >= 60 && (
                  <span className="ml-2 text-amber-600 font-medium">(Senior Citizen auto-detected)</span>
                )}
              </p>
            )}
          </div>

          <div>
            <label className={labelCls} htmlFor="contact_number">Contact Number</label>
            <input
              className={baseInputClasses}
              id="contact_number"
              type="tel"
              inputMode="numeric"
              maxLength={11}
              placeholder="09XXXXXXXXX"
              onKeyPress={(e) => { if (!/[0-9]/.test(e.key)) e.preventDefault() }}
              value={form.contact_number}
              onChange={(e) => updateField('contact_number', e.target.value)}
            />
            {contactError && <p className="mt-1 text-[12px] text-rose-600">{contactError}</p>}
          </div>

          <BarangaySelect
            id="barangay"
            label="Barangay"
            value={form.barangay}
            onChange={(e) => updateField('barangay', e.target.value)}
            required
          />
        </div>

        {/* RSBSA-equivalent classification */}
        <div className="rounded-xl border border-[#E2E8E2] bg-[#EBF5EE]/30 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#4A5E4A]">Classification</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {[
              ['is_pwd',              'Person with Disability (PWD)', false],
              ['is_4ps_beneficiary',  '4Ps Beneficiary',              false],
              ['is_icc_ip_member',    'ICC/IP Member',                false],
            ].map(([field, label, autoLocked]) => (
              <label key={field} className={`flex items-center gap-2 ${autoLocked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#1B4D2E]"
                  checked={form[field]}
                  disabled={autoLocked}
                  onChange={(e) => !autoLocked && updateField(field, e.target.checked)}
                />
                <span className="text-[13px] text-[#1A2B1A]">{label}</span>
              </label>
            ))}
          </div>
          {form.is_icc_ip_member && (
            <div className="mt-3">
              <label className={labelCls} htmlFor="icc_ip_name">ICC/IP Group Name</label>
              <input className={baseInputClasses} id="icc_ip_name" value={form.icc_ip_name} onChange={(e) => updateField('icc_ip_name', e.target.value)} />
            </div>
          )}
        </div>

        {/* Type of Fishery Activity profile flags */}
        <div className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#4A5E4A]">Type of Fishery Activity</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {[
              ['is_aquaculture',     'Aquaculture'],
              ['is_capture_fishery', 'Capture Fishery'],
              ['is_mariculture',     'Mariculture'],
              ['is_inland_fishery',  'Inland Fishery'],
              ['is_fish_vendor',     'Fish Vendor'],
            ].map(([field, label]) => (
              <label key={field} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#1B4D2E]"
                  checked={form[field]}
                  onChange={(e) => updateField(field, e.target.checked)}
                />
                <span className="text-[13px] text-[#1A2B1A]">{label}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[#7A8E7A]">
            Profile classification only; production monitoring covers aquaculture.
          </p>
        </div>

        {/* Association */}
        <div>
          <label className={labelCls}>
            Fisherfolk Association <span className="text-[#7A8E7A] font-normal">(optional)</span>
          </label>
          <select
            className={baseInputClasses}
            value={form.fisherfolk_association || ''}
            onChange={e => updateField('fisherfolk_association', e.target.value || null)}
          >
            <option value="">— Not a member of any association</option>
            {associations.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <p className="text-[12px] text-[#7A8E7A] mt-1">
            Leave blank if the fisherfolk is not part of any association.
          </p>
        </div>

        {dupChecking && (
          <p className="text-[12px] text-[#7A8E7A] italic">Checking for duplicate entries…</p>
        )}

        {!dupChecking && duplicates.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={15} className="text-amber-600 flex-shrink-0" />
              <p className="text-[13px] font-semibold text-amber-800">
                Possible duplicate{duplicates.length > 1 ? 's' : ''} found — you may still submit
              </p>
            </div>
            <ul className="space-y-1">
              {duplicates.map((d) => (
                <li key={d.id} className="text-[12px] text-amber-800">
                  <span className="font-medium">{d.first_name} {d.last_name}</span>
                  {d.barangay ? ` — ${d.barangay}` : ''}
                  {d.lgu_registration_number ? ` (LGU: ${d.lgu_registration_number})` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {formError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-[13px] font-medium text-red-700">{formError}</p>
            {Object.keys(fieldErrors).length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {Object.entries(fieldErrors).map(([k, v]) => (
                  <li key={k} className="text-[12px] text-red-600">
                    <span className="font-medium capitalize">{k.replace(/_/g, ' ')}:</span> {v}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-[#F0F4F0] pt-4">
          <Button onClick={onClose} type="button" variant="ghost">Cancel</Button>
          <Button isLoading={isSubmitting} type="submit" variant="primary">Save Fisherfolk</Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default AddFisherfolkModal
