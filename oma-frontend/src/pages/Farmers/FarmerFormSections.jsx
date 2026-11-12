import BARANGAYS from '../../constants/barangays.js'
import EmailInput from '../../components/UI/EmailInput.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { FormCell, FormRow, FormRows, FormSection, FormValue } from '../../components/UI/FormTable.jsx'
import IdNumberInput from '../../components/UI/IdNumberInput.jsx'
import PhoneInput from '../../components/UI/PhoneInput.jsx'
import SearchSelect from '../../components/UI/SearchSelect.jsx'
import { RSBSA_GROUPS } from '../../utils/idNumbers.js'
import { getPrefixOptions } from '../../utils/prefixOptions.js'
import { ageOn } from '../Fisherfolk/fisherfolkForm.js'

// The farmer form itself, as a table form: Register Farmer and Edit Farmer both draw this, so they always have the same fields in the same places
// (the rules are in farmerForm.js). The window, its buttons, the machinery and parcels steps of Register and the saving stay with each of the two.
//   form / onChange(field, value)   the values and what typing does (changeFarmer)
//   problems / serverErrors         shown under the boxes (the RSBSA one only once Save was pressed: `tried`)
//   organizations                   [{ id, name }] to choose from when registering
//   farmerOrganizations / rsbsaNumber   when editing: the memberships (changed on the organization pages) and the RSBSA number (not edited)
const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated']
const CLASSIFICATIONS = [['is_pwd', 'Person with Disability (PWD)'], ['is_4ps_beneficiary', '4Ps Beneficiary'], ['is_icc_ip_member', 'ICC/IP Member']]
const hintCls = 'mt-1 text-[11.5px] text-[#7A8E7A]'
const maxBirthdate = () => {
  const d = new Date()
  return `${d.getFullYear() - 10}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Tick({ checked, onChange, disabled = false, title, children }) {
  return (
    <label className={`flex items-center gap-2 ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`} title={title}>
      <input type="checkbox" className="h-4 w-4 accent-[#1B4D2E]" checked={checked} disabled={disabled} readOnly={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <span className="text-[13px] text-[#1A2B1A]">{children}</span>
    </label>
  )
}

export default function FarmerFormSections({
  form, onChange, problems = {}, serverErrors = {}, prefixNote = '', tried = false, organizations = [], farmerOrganizations = [], rsbsaNumber = '', isEdit = false, idPrefix = '',
}) {
  const id = (name) => `${idPrefix}${name}`
  const text = (name) => ({ id: id(name), className: baseInputClasses, value: form[name], onChange: (e) => onChange(name, e.target.value) })
  const age = ageOn(form.birthdate)
  const isSenior = age !== null && age >= 60
  const error = (name) => problems[name] || serverErrors[name] || ''

  return (
    <>
      <FormSection title="Personal Information">
        <FormRows label="Personal information">
          <FormRow>
            <FormCell label="Prefix" hint={prefixNote && <p className="mt-1 text-[12px] text-amber-600">{prefixNote}</p>}>
              <select {...text('prefix')} aria-label="Prefix">
                {getPrefixOptions(form.gender).map((p) => <option key={p || 'none'} value={p}>{p || '(None)'}</option>)}
              </select>
            </FormCell>
            <FormCell label="First Name" required error={serverErrors.first_name}>
              <input {...text('first_name')} required aria-label="First Name" />
            </FormCell>
          </FormRow>
          <FormRow>
            <FormCell label="Middle Name" error={serverErrors.middle_name}>
              <input {...text('middle_name')} aria-label="Middle Name" />
            </FormCell>
            <FormCell label="Last Name" required error={serverErrors.last_name}>
              <input {...text('last_name')} required aria-label="Last Name" />
            </FormCell>
          </FormRow>
          <FormRow>
            <FormCell label="Sex" required>
              <select {...text('gender')} aria-label="Sex">
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </FormCell>
            <FormCell label="Birthdate" required error={error('birthdate')}
              hint={form.birthdate && age !== null && !error('birthdate') && (
                <p className="mt-1 text-[12px] text-[#4A5E4A]">
                  Age: <strong>{age}</strong> years old{isSenior && <span className="ml-2 font-medium text-amber-600">(Senior Citizen)</span>}
                </p>
              )}>
              <input {...text('birthdate')} type="date" required max={maxBirthdate()} aria-label="Birthdate" />
            </FormCell>
          </FormRow>
          <FormRow>
            <FormCell label="Civil Status" required error={serverErrors.civil_status}>
              <select {...text('civil_status')} required aria-label="Civil Status">
                {!form.civil_status && <option value="" disabled>Select civil status</option>}
                {CIVIL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormCell>
            <FormCell label="Highest Education" error={serverErrors.highest_education}>
              <input {...text('highest_education')} aria-label="Highest Education" />
            </FormCell>
          </FormRow>
        </FormRows>
      </FormSection>

      <FormSection title="Contact Information">
        <FormRows label="Contact information">
          <FormRow>
            <FormCell label="Contact Number" error={error('contact_number')}>
              <PhoneInput className={baseInputClasses} id={id('contact_number')} value={form.contact_number} onChange={(v) => onChange('contact_number', v)} />
            </FormCell>
            <FormCell label="Barangay" required error={serverErrors.barangay}>
              <select {...text('barangay')} required aria-label="Barangay">
                <option value="" disabled>Select barangay...</option>
                {BARANGAYS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </FormCell>
          </FormRow>
          <FormRow>
            <FormCell label="Email" wide error={serverErrors.email}
              hint={<p className={hintCls}>Optional. Only kept on the record: the login account is set up separately, in person, with Set Up Account on the farmer&apos;s profile.</p>}>
              <EmailInput className={`${baseInputClasses} md:max-w-[24rem]`} id={id('email')} value={form.email} onChange={(v) => onChange('email', v)} />
            </FormCell>
          </FormRow>
        </FormRows>
      </FormSection>

      <FormSection title="Government Information">
        <FormRows label="Government information">
          <FormRow>
            <FormCell label="RSBSA Number" required={!isEdit} error={isEdit ? '' : ((tried && problems.rsbsa_number) || serverErrors.rsbsa_number)}
              hint={<p className={hintCls}>{isEdit ? 'The RSBSA number cannot be edited here.' : 'Type the digits only (up to 20). The dashes are added as you type.'}</p>}>
              {isEdit ? <FormValue>{rsbsaNumber}</FormValue> : (
                <IdNumberInput groups={RSBSA_GROUPS} value={form.rsbsa_number} placeholder="01-33-02-014-058212" onChange={(v) => onChange('rsbsa_number', v)} />
              )}
            </FormCell>
            <FormCell label="PhilSys / National ID No." error={error('philsys_number')}>
              <input {...text('philsys_number')} placeholder="8419-5032-7741-3096" aria-label="PhilSys / National ID No." />
            </FormCell>
          </FormRow>
          <FormRow>
            <FormCell label="RSBSA Classification" wide>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-1">
                {CLASSIFICATIONS.map(([field, label]) => (
                  <Tick key={field} checked={form[field]} onChange={(v) => onChange(field, v)}>{label}</Tick>
                ))}
                <Tick checked={isSenior} disabled title={isSenior ? 'Automatically set: age is 60 or above.' : 'Automatically determined from the birthdate.'}>Senior Citizen</Tick>
              </div>
            </FormCell>
          </FormRow>
          {form.is_icc_ip_member && (
            <FormRow>
              <FormCell label="ICC/IP Group Name" wide error={serverErrors.icc_ip_name}>
                <input {...text('icc_ip_name')} className={`${baseInputClasses} md:max-w-[24rem]`} aria-label="ICC/IP Group Name" />
              </FormCell>
            </FormRow>
          )}
          <FormRow>
            <FormCell label="Farmer Organization" wide
              hint={<p className={hintCls}>{isEdit ? 'Membership is changed from each organization\'s own Members tab, not here.'
                : 'Type to search the organizations, or leave blank if the farmer is not part of any organization. It can be changed later from the organization.'}</p>}>
              {isEdit ? (
                (farmerOrganizations || []).length === 0 ? <FormValue>Not a member of any organization</FormValue> : (
                  <div className="flex flex-wrap gap-1.5 py-1">
                    {farmerOrganizations.map((o) => (
                      <span key={o.membership_id}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ${o.is_active ? 'bg-[#EBF5EE] text-[#1B4D2E]' : 'bg-[#F0F4F0] text-[#7A8E7A] line-through'}`}>
                        {o.organization_name}
                        {o.is_main && o.is_active && <span className="font-semibold">· Main</span>}
                      </span>
                    ))}
                  </div>
                )
              ) : (
                <SearchSelect
                  id={id('farmers_organization')}
                  ariaLabel="Farmer Organization"
                  options={organizations.map((o) => ({ value: o.id, label: o.name }))}
                  value={form.farmers_organization}
                  onChange={(value) => onChange('farmers_organization', value)}
                  emptyLabel="— Not a member of any organization"
                  placeholder="Type the organization name"
                />
              )}
            </FormCell>
          </FormRow>
        </FormRows>
      </FormSection>
    </>
  )
}
