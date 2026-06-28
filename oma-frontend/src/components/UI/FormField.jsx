export const baseInputClasses =
  'w-full h-[38px] px-3 border border-[#E2E8E2] rounded-lg text-[13px] text-[#1A2B1A] bg-white placeholder-[#A8BCA8] focus:outline-none focus:border-[#1B4D2E] focus:ring-2 focus:ring-[#1B4D2E]/10 transition-colors'

function FormField({ label, error, required, children }) {
  return (
    <div>
      {label && (
        <label className="text-[13px] font-medium text-[#4A5E4A] mb-1.5 block">
          {label}
          {required && <span className="ml-1 text-[#C0392B]">*</span>}
        </label>
      )}
      {children}
      {error && (
        <p className="text-[12px] text-[#C0392B] mt-1">{error}</p>
      )}
    </div>
  )
}

export default FormField
