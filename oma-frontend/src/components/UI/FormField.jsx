export const baseInputClasses =
  'w-full h-[38px] px-3 border border-[#E2E8E2] rounded-lg text-[13px] text-[#1A2B1A] bg-white placeholder-[#A8BCA8] focus:outline-none focus:border-[#1B4D2E] focus:ring-2 focus:ring-[#1B4D2E]/10 transition-colors'

// Shared label renderer: required fields get a red asterisk, everything else
// gets a muted "(optional)" suffix, so a field is never left unmarked.
// Pass hideIndicator to suppress this for labels that aren't real form fields
// (e.g. read-only display rows, section headings).
export function FormLabel({ children, required, hideIndicator, className }) {
  return (
    <label className={className || 'text-[13px] font-medium text-[#4A5E4A] mb-1.5 block'}>
      {children}
      {!hideIndicator && (
        required
          ? <span className="ml-1 text-rose-500">*</span>
          : <span className="ml-1 text-slate-400 text-xs font-normal">(optional)</span>
      )}
    </label>
  )
}

function FormField({ label, error, required, children }) {
  return (
    <div>
      {label && (
        <FormLabel required={required}>{label}</FormLabel>
      )}
      {children}
      {error && (
        <p className="text-[12px] text-[#C0392B] mt-1">{error}</p>
      )}
    </div>
  )
}

export default FormField
