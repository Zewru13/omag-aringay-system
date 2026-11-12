import { FormCell, FormRow, FormRows, FormSection, FormValue } from '../../components/UI/FormTable.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import EmailInput from '../../components/UI/EmailInput.jsx'
import PhoneInput from '../../components/UI/PhoneInput.jsx'
import { ROLE_OPTIONS, SUFFIX_OPTIONS } from './userForm.js'

// The fields of Add User and Edit User, as table-form sections.
//   values: { role, lastName, firstName, suffix, email, contact, isActive }   set(field, value)   errors: from validateUserForm
//   mode 'edit' adds the Status row; `accountType` (a text) shows a citizen account's fixed type instead of the role choice.
export default function UserFormSections({ mode = 'create', values, set, errors = {}, accountType = '' }) {
  const roleHint = ROLE_OPTIONS.find((option) => option.value === values.role)?.desc

  return (
    <div className="space-y-3">
      <FormSection title="Account">
        <FormRows label="Account">
          <FormRow>
            {accountType ? (
              <FormCell label="Account Type" wide><FormValue>{accountType}</FormValue></FormCell>
            ) : (
              <FormCell label="Role" required wide error={errors.role}
                hint={roleHint ? <p className="mt-1 text-[11.5px] text-[#7A8E7A]">{roleHint}</p> : null}>
                <select className={baseInputClasses} value={values.role} onChange={(e) => set('role', e.target.value)}>
                  {mode === 'create' && <option value="">Select a role</option>}
                  {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </FormCell>
            )}
          </FormRow>
          {mode === 'edit' && (
            <FormRow>
              <FormCell label="Status" wide>
                <select className={baseInputClasses} value={values.isActive ? 'active' : 'inactive'} onChange={(e) => set('isActive', e.target.value === 'active')}>
                  <option value="active">Active</option>
                  <option value="inactive">Deactivated</option>
                </select>
              </FormCell>
            </FormRow>
          )}
        </FormRows>
      </FormSection>

      <FormSection title="Name">
        <FormRows label="Name">
          <FormRow>
            <FormCell label="Last Name" required error={errors.lastName}>
              <input className={baseInputClasses} placeholder="e.g. Dela Cruz" value={values.lastName} onChange={(e) => set('lastName', e.target.value)} />
            </FormCell>
            <FormCell label="First Name" required error={errors.firstName}>
              <input className={baseInputClasses} placeholder="e.g. Juan" value={values.firstName} onChange={(e) => set('firstName', e.target.value)} />
            </FormCell>
          </FormRow>
          <FormRow>
            <FormCell label="Suffix" wide>
              <select className={baseInputClasses} value={values.suffix} onChange={(e) => set('suffix', e.target.value)}>
                <option value="">None</option>
                {SUFFIX_OPTIONS.map((suffix) => <option key={suffix} value={suffix}>{suffix}</option>)}
              </select>
            </FormCell>
          </FormRow>
        </FormRows>
      </FormSection>

      <FormSection title="Contact">
        <FormRows label="Contact">
          <FormRow>
            <FormCell label="Email Address" required wide error={errors.email}
              hint={mode === 'create' ? (
                <p className="mt-1 text-[11.5px] text-[#7A8E7A]">
                  Double-check this: it is not pre-verified. A mistyped address means the account is never activated.
                </p>
              ) : null}>
              <EmailInput className={baseInputClasses} placeholder="e.g. juan@example.com" value={values.email} onChange={(v) => set('email', v)} />
            </FormCell>
          </FormRow>
          <FormRow>
            <FormCell label="Mobile Number" wide error={errors.contact}>
              <PhoneInput className={baseInputClasses} value={values.contact} onChange={(v) => set('contact', v)} />
            </FormCell>
          </FormRow>
        </FormRows>
      </FormSection>
    </div>
  )
}
