export const baseInputClasses =
  'w-full h-[38px] px-3 border border-[#E2E8E2] rounded-lg text-[13px] text-[#1A2B1A] bg-white placeholder-[#A8BCA8] focus:outline-none focus:border-[#1B4D2E] focus:ring-2 focus:ring-[#1B4D2E]/10 transition-colors'

// Shared label renderer: required fields get a red asterisk, everything else
// gets a muted "(optional)" suffix, so a field is never left unmarked.
// Pass hideIndicator to suppress this for labels that aren't real form fields
// (e.g. read-only display rows, section headings).
//
// pillLabel is an opt-in alternate style (small REQUIRED/OPTIONAL badge
// instead of asterisk/text) — off by default so every existing caller keeps
// today's look; only callers that explicitly pass it get the new style.
export function FormLabel({ children, required, hideIndicator, pillLabel, className }) {
  if (pillLabel) {
    return (
      <label className={className || 'mb-1.5 flex items-center gap-2 text-[13px] font-medium text-[#1A2B1A]'}>
        {children}
        {!hideIndicator && (
          <span className="rounded-full bg-[#EFEDE6] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#7A8E7A]">
            {required ? 'Required' : 'Optional'}
          </span>
        )}
      </label>
    )
  }
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

function FormField({ label, error, required, pillLabel, children }) {
  return (
    <div>
      {label && (
        <FormLabel required={required} pillLabel={pillLabel}>{label}</FormLabel>
      )}
      {children}
      {error && (
        <p className="text-[12px] text-[#C0392B] mt-1">{error}</p>
      )}
    </div>
  )
}

export default FormField
