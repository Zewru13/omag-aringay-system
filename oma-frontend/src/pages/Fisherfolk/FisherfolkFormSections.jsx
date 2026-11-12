import BARANGAYS from '../../constants/barangays.js'
import EmailInput from '../../components/UI/EmailInput.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { FormCell, FormRow, FormRows, FormSection, FormValue } from '../../components/UI/FormTable.jsx'
import IdNumberInput from '../../components/UI/IdNumberInput.jsx'
import PhoneInput from '../../components/UI/PhoneInput.jsx'
import SearchSelect from '../../components/UI/SearchSelect.jsx'
import { FISHR_GROUPS, RSBSA_GROUPS } from '../../utils/idNumbers.js'
import { getPrefixOptions } from '../../utils/prefixOptions.js'
import { ageOn } from './fisherfolkForm.js'

// The fisherfolk form itself, as a table form: Register Fisherfolk and Edit Fisherfolk both draw this, so they always have the same fields in
// the same places (the rules are in fisherfolkForm.js). The window, its buttons and the saving stay with each of the two.
//   form / onChange(field, value)   the values and what typing does (changeFisherfolk)
//   problems                        fisherfolkProblems(form): shown under the boxes; the RSBSA one only once Save was pressed (`tried`)
//   serverErrors                    what the server refused, by field
//   organizations                   [{ id, name }] to choose from when registering
//   organizationNames               when editing: the organizations the fisherfolk belongs to (changed on the organization pages, not here)
const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated']
const CLASSIFICATIONS = [['is_pwd', 'Person with Disability (PWD)'], ['is_4ps_beneficiary', '4Ps Beneficiary'], ['is_icc_ip_member', 'ICC/IP Member']]
const ACTIVITIES = [['is_aquaculture', 'Aquaculture'], ['is_capture_fishery', 'Capture Fishery'], ['is_mariculture', 'Mariculture'], ['is_inland_fishery', 'Inland Fishery']]
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

export default function FisherfolkFormSections({
  form, onChange, problems = {}, serverErrors = {}, prefixNote = '', tried = false, organizations = [], organizationNames = [], isEdit = false, idPrefix = '',
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
              hint={<p className={hintCls}>Optional. Only kept on the record: the login account is set up separately, in person, with Set Up Account on the fisherfolk&apos;s profile.</p>}>
              <EmailInput className={`${baseInputClasses} md:max-w-[24rem]`} id={id('email')} value={form.email} onChange={(v) => onChange('email', v)} />
            </FormCell>
          </FormRow>
        </FormRows>
      </FormSection>

      <FormSection title="Government Information">
        <FormRows label="Government information">
          <FormRow>
            <FormCell label="RSBSA Number" required error={(tried && problems.rsbsa_number) || serverErrors.rsbsa_number}
              hint={<p className={hintCls}>Type the digits only (up to 20). The dashes are added as you type.</p>}>
              <IdNumberInput groups={RSBSA_GROUPS} value={form.rsbsa_number} placeholder="01-33-02-014-058212" onChange={(v) => onChange('rsbsa_number', v)} />
            </FormCell>
            <FormCell label="FishR Number" error={serverErrors.fishr_number} hint={<p className={hintCls}>Optional. Digits only, up to 20.</p>}>
              <IdNumberInput groups={FISHR_GROUPS} value={form.fishr_number} placeholder="01-33-02-2026-0415" onChange={(v) => onChange('fishr_number', v)} />
            </FormCell>
          </FormRow>
          <FormRow>
            <FormCell label="PhilSys / National ID No." wide error={error('philsys_number')}>
              <input {...text('philsys_number')} className={`${baseInputClasses} md:max-w-[24rem]`} placeholder="8419-5032-7741-3096" aria-label="PhilSys / National ID No." />
            </FormCell>
          </FormRow>
          <FormRow>
            <FormCell label="Classification" wide>
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
        </FormRows>
      </FormSection>

      <FormSection title="Fisheries Information">
        <FormRows label="Fisheries information">
          <FormRow>
            <FormCell label="Type of Fishery Activity" wide
              hint={(
                <p className={hintCls} data-testid="fisherfolk-type-note">
                  Every fisherfolk is registered as <span className="font-semibold text-[#1B4D2E]">Aquaculture</span>. These boxes describe the profile only;
                  production monitoring covers aquaculture.
                </p>
              )}>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-1">
                {ACTIVITIES.map(([field, label]) => (
                  <Tick key={field} checked={form[field]} onChange={(v) => onChange(field, v)}>{label}</Tick>
                ))}
              </div>
            </FormCell>
          </FormRow>
          <FormRow>
            <FormCell label="Fisherfolk Organization" wide
              hint={(
                <p className={hintCls}>
                  {isEdit
                    ? 'Membership is changed from the organization\'s own page (Members), not here.'
                    : 'Type to search the organizations, or leave blank if the fisherfolk is not part of any organization.'}
                </p>
              )}>
              {isEdit ? (
                <FormValue>{organizationNames.length ? organizationNames.join(', ') : 'Not a member of any organization'}</FormValue>
              ) : (
                <SearchSelect
                  id={id('fisherfolk_organization')}
                  ariaLabel="Fisherfolk Organization"
                  options={organizations.map((o) => ({ value: o.id, label: o.name }))}
                  value={form.fisherfolk_organization}
                  onChange={(value) => onChange('fisherfolk_organization', value)}
                  emptyLabel="— Not a member of any organization"
                  placeholder="Type the organization name"
                />
              )}
            </FormCell>
          </FormRow>
        </FormRows>
      </FormSection>

      <FormSection title="Vessel Information">
        <FormRows label="Vessel information">
          <FormRow>
            <FormCell label="Fishing Vessel" wide={!form.has_vessel}>
              <div className="py-1"><Tick checked={form.has_vessel} onChange={(v) => onChange('has_vessel', v)}>Owns or operates a fishing vessel</Tick></div>
            </FormCell>
            {form.has_vessel && (
              <FormCell label="Boat Registration Number (Boat-R)" error={error('boat_registration_number')} hint={<p className={hintCls}>Optional. Exactly 7 digits.</p>}>
                <input {...text('boat_registration_number')} inputMode="numeric" maxLength={7} placeholder="0000000" aria-label="Boat Registration Number" />
              </FormCell>
            )}
          </FormRow>
        </FormRows>
      </FormSection>
    </>
  )
}
