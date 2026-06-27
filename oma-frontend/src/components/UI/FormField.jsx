export const baseInputClasses =
  'w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E4620]/30 focus:border-[#1E4620] transition-colors'

function FormField({ label, error, required, children }) {
  return (
    <div>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-1 text-rose-500">*</span>}
        </label>
      )}
      {children}
      {error && (
        <p className="mt-1.5 text-xs text-rose-600">{error}</p>
      )}
    </div>
  )
}

export default FormField
