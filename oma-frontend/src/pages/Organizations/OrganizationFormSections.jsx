import BARANGAYS from '../../constants/barangays.js'
import EmailInput from '../../components/UI/EmailInput.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'
import PhoneInput from '../../components/UI/PhoneInput.jsx'
import { localToday } from '../../utils/inputGuards.js'

// The organization form itself, as a table form: Add New Organization and Edit Organization both draw this, so they always have the same fields in
// the same places (the rules are in organizationForm.js). The window, its confirmation, the equipment and members steps and the saving stay with each.
//   form / onChange(field, value)   the values and what typing does (changeOrganization)
//   errors                          { field: message }: what is wrong (the contact number's message included)
//   agencyOptions                   [{ value, label }] the registration agencies offered
//   datesChanged                    editing: the earliest Date Registered is only held to Date Organized once a date was changed
const hint = (text) => <p className="mt-1 text-[11.5px] text-[#7A8E7A]">{text}</p>

export default function OrganizationFormSections({ form, onChange, errors = {}, agencyOptions = [], datesChanged = true, idPrefix = '' }) {
  const id = (name) => `${idPrefix}${name}`
  const bad = (name) => (errors[name] ? ' border-rose-400' : '')

  return (
    <>
      <FormSection title="Organization Information">
        <FormRows label="Organization information">
          <FormRow>
            <FormCell label="Organization Name" required wide error={errors.name}>
              <input id={id('name')} className={`${baseInputClasses}${bad('name')}`} required value={form.name} aria-label="Organization Name" onChange={(e) => onChange('name', e.target.value)} />
            </FormCell>
          </FormRow>
          <FormRow>
            <FormCell label="Barangay" required error={errors.barangay}>
              <select id={id('barangay')} className={`${baseInputClasses}${bad('barangay')}`} required value={form.barangay} aria-label="Barangay" onChange={(e) => onChange('barangay', e.target.value)}>
                <option value="" disabled>Select barangay...</option>
                {BARANGAYS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </FormCell>
            <FormCell label="Street Address">
              <input id={id('street_address')} className={baseInputClasses} placeholder="e.g. Purok 3, San Antonio St." value={form.street_address} aria-label="Street Address"
                onChange={(e) => onChange('street_address', e.target.value)} />
            </FormCell>
          </FormRow>
        </FormRows>
      </FormSection>

      <FormSection title="Registration">
        <FormRows label="Registration">
          <FormRow>
            <FormCell label="Date Organized" required error={errors.date_organized}>
              <input id={id('date_organized')} type="date" className={`${baseInputClasses}${bad('date_organized')}`} value={form.date_organized} max={localToday()} aria-label="Date Organized"
                onChange={(e) => onChange('date_organized', e.target.value)} />
            </FormCell>
            <FormCell label="Date Registered" required error={errors.date_registered}>
              <input id={id('date_registered')} type="date" className={`${baseInputClasses}${bad('date_registered')}`} value={form.date_registered} aria-label="Date Registered"
                min={datesChanged ? (form.date_organized || undefined) : undefined} max={localToday()} onChange={(e) => onChange('date_registered', e.target.value)} />
            </FormCell>
          </FormRow>
          <FormRow>
            <FormCell label="Registration Number" required error={errors.registration_number}
              hint={!errors.registration_number ? hint('Format: CN200626622 (CN = prefix · 2006 = year · 26622 = unique identifier)') : null}>
              <input id={id('registration_number')} className={`${baseInputClasses}${bad('registration_number')}`} placeholder="e.g. CN200626622" maxLength={15} value={form.registration_number}
                aria-label="Registration Number" onChange={(e) => onChange('registration_number', e.target.value)} />
            </FormCell>
            <FormCell label="Registration Agency" required error={errors.registration_agency}>
              <select id={id('registration_agency')} className={`${baseInputClasses}${bad('registration_agency')}`} value={form.registration_agency} aria-label="Registration Agency"
                onChange={(e) => onChange('registration_agency', e.target.value)}>
                <option value="">Select agency</option>
                {agencyOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </FormCell>
          </FormRow>
        </FormRows>
      </FormSection>

      <FormSection title="Contact">
        <FormRows label="Contact">
          <FormRow>
            <FormCell label="Email Address" required wide error={errors.email_address}>
              <EmailInput id={id('email_address')} className={`${baseInputClasses}${bad('email_address')} md:max-w-[24rem]`} placeholder="e.g. organization@email.com" value={form.email_address}
                onChange={(v) => onChange('email_address', v)} />
            </FormCell>
          </FormRow>
          <FormRow>
            <FormCell label="Contact Person Full Name" required error={errors.contact_person}>
              <input id={id('contact_person')} className={`${baseInputClasses}${bad('contact_person')}`} value={form.contact_person} placeholder="e.g. Juan Dela Cruz" aria-label="Contact Person Full Name"
                onChange={(e) => onChange('contact_person', e.target.value)} />
            </FormCell>
            <FormCell label="Contact Number" required error={errors.contact_number}>
              <PhoneInput id={id('contact_number')} className={baseInputClasses} required value={form.contact_number} onChange={(v) => onChange('contact_number', v)} />
            </FormCell>
          </FormRow>
        </FormRows>
      </FormSection>
    </>
  )
}
