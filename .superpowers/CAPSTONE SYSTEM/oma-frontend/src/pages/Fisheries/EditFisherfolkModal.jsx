import { useState } from 'react'
import { Fish } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'

const labelCls = 'block text-xs font-medium text-slate-600'

const validateAge = (birthdate) => {
  if (!birthdate) return null
  const birth = new Date(birthdate)
  const today = new Date()
  const age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  const dayDiff = today.getDate() - birth.getDate()
  const exactAge = (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) ? age - 1 : age
  if (exactAge < 10) return 'Must be at least 10 years old to register.'
  return null
}

const getMaxBirthdate = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 10)
  return d.toISOString().split('T')[0]
}

function EditFisherfolkModal({ fisherfolk, onClose, onSuccess }) {
  const { isAdmin } = useAuth()
  const { showToast } = useToast()

  const [form, setForm] = useState({
    prefix: fisherfolk.prefix || '',
    first_name: fisherfolk.first_name || '',
    middle_name: fisherfolk.middle_name || '',
    last_name: fisherfolk.last_name || '',
    gender: fisherfolk.gender || 'Male',
    birthdate: fisherfolk.birthdate || '',
    contact_number: fisherfolk.contact_number || '',
    barangay: fisherfolk.barangay || '',
    is_active: fisherfolk.is_active,
  })

  const [birthdateError, setBirthdateError] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (field === 'birthdate') setBirthdateError(validateAge(value) || '')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    const ageError = validateAge(form.birthdate)
    if (ageError) {
      setBirthdateError(ageError)
      return
    }

    setIsSubmitting(true)

    try {
      await api.patch(`/fisheries/${fisherfolk.id}/`, form)
      showToast('Fisherfolk profile updated successfully.', 'success')
      onSuccess()
      onClose()
    } catch (err) {
      const data = err.response?.data
      if (data?.birthdate?.[0]) {
        setBirthdateError(data.birthdate[0])
      } else {
        setError(data?.detail || 'Unable to update profile. Please check the form and try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell title="Edit Fisherfolk" subtitle="Update the fisherfolk's profile information" icon={Fish} onClose={onClose} maxWidth="max-w-2xl">
      <p className="mb-4 text-sm text-slate-500">{fisherfolk.lgu_registration_number}</p>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="edit_prefix">Prefix</label>
            <select className={baseInputClasses} id="edit_prefix" value={form.prefix} onChange={(e) => updateField('prefix', e.target.value)}>
              <option value="">(None)</option>
              <option value="Mr.">Mr.</option>
              <option value="Mrs.">Mrs.</option>
              <option value="Ms.">Ms.</option>
              <option value="Engr.">Engr.</option>
              <option value="Dr.">Dr.</option>
              <option value="Hon.">Hon.</option>
            </select>
          </div>

          <div>
            <label className={labelCls} htmlFor="edit_first_name">First Name</label>
            <input className={baseInputClasses} id="edit_first_name" required value={form.first_name} onChange={(e) => updateField('first_name', e.target.value)} />
          </div>

          <div>
            <label className={labelCls} htmlFor="edit_middle_name">Middle Name</label>
            <input className={baseInputClasses} id="edit_middle_name" value={form.middle_name} onChange={(e) => updateField('middle_name', e.target.value)} />
          </div>

          <div>
            <label className={labelCls} htmlFor="edit_last_name">Last Name</label>
            <input className={baseInputClasses} id="edit_last_name" required value={form.last_name} onChange={(e) => updateField('last_name', e.target.value)} />
          </div>

          <div>
            <label className={labelCls} htmlFor="edit_gender">Sex</label>
            <select className={baseInputClasses} id="edit_gender" value={form.gender} onChange={(e) => updateField('gender', e.target.value)}>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>

          <div>
            <label className={labelCls} htmlFor="edit_birthdate">Birthdate</label>
            <input
              className={baseInputClasses}
              id="edit_birthdate"
              max={getMaxBirthdate()}
              required
              type="date"
              value={form.birthdate}
              onChange={(e) => updateField('birthdate', e.target.value)}
            />
            {birthdateError && (
              <p className="mt-1 text-xs text-rose-600">{birthdateError}</p>
            )}
          </div>

          <div>
            <label className={labelCls} htmlFor="edit_contact_number">Contact Number</label>
            <input className={baseInputClasses} id="edit_contact_number" value={form.contact_number} onChange={(e) => updateField('contact_number', e.target.value)} />
          </div>

          <BarangaySelect
            id="edit_barangay"
            label="Barangay"
            value={form.barangay}
            onChange={(e) => updateField('barangay', e.target.value)}
            required
          />

          {isAdmin && (
            <div className="md:col-span-2">
              <label className={labelCls}>Status</label>
              <div className="mt-2 flex gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="radio" name="is_active" value="true" checked={form.is_active === true} onChange={() => updateField('is_active', true)} className="accent-green-600" />
                  Active
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="radio" name="is_active" value="false" checked={form.is_active === false} onChange={() => updateField('is_active', false)} className="accent-green-600" />
                  Inactive
                </label>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button onClick={onClose} type="button" variant="ghost">Cancel</Button>
          <Button isLoading={isSubmitting} type="submit" variant="primary">Save Changes</Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default EditFisherfolkModal
