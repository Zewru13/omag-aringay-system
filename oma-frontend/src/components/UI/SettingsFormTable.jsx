import { FormCell, FormRow, FormRows, FormSection } from './FormTable.jsx'
import { settingsLabel } from './settingsLabel.js'

// The table form of a settings edit window (Crop Settings, Fisheries Settings, Assistance Settings, Signatories...): one titled section of
// labelled rows, a field to a row. The fields keep the shape they had as stacked FormFields (label, required, error, children), so a window
// changes by swapping the tags.
//
//   <SettingsFields title="Feed Type" note="optional text above the rows">
//     <SettingsField label="Name *" error={nameError}> <input .../> </SettingsField>
//     <FormRow> <SettingsCell label="Fingerling"> ... </SettingsCell> <SettingsCell label="Juvenile"> ... </SettingsCell> </FormRow>   two to a row
//   </SettingsFields>

export function SettingsFields({ title, note = null, children }) {
  return (
    <FormSection title={title}>
      {note && <div className="space-y-1 border-b border-[#F0F4F0] px-3 py-2.5 text-[11.5px] leading-[1.5] text-[#7A8E7A]">{note}</div>}
      <FormRows label={title}>{children}</FormRows>
    </FormSection>
  )
}

// One cell (a label and its box). Pass `wide` for a field that takes the whole row.
export function SettingsCell({ label, required = false, error = '', hint = null, wide = false, children }) {
  const read = settingsLabel(label, required)
  return (
    <FormCell label={read.label} required={read.required} wide={wide} error={error}
      hint={hint ? <p className="mt-1 text-[11.5px] text-[#7A8E7A]">{hint}</p> : null}>
      {children}
    </FormCell>
  )
}

// A row of its own holding one wide field: the usual case.
export function SettingsField({ label, required = false, error = '', hint = null, children }) {
  return (
    <FormRow>
      <SettingsCell label={label} required={required} error={error} hint={hint} wide>{children}</SettingsCell>
    </FormRow>
  )
}

export { FormRow }
