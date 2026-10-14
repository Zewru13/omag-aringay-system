// A small two-way switch for how the same data is shown (e.g. All crops / By farmer). `options` is [{ id, label }].
export default function ViewToggle({ options, value, onChange, ariaLabel }) {
  return (
    <div className="inline-flex w-fit items-center gap-1 rounded-lg border border-[#E2E8E2] bg-white p-0.5" role="group" aria-label={ariaLabel}>
      {options.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={`rounded-md px-3 py-1 text-[12px] font-medium transition-colors ${
            value === id ? 'bg-[#1B4D2E] text-white' : 'text-[#4A5E4A] hover:bg-[#F5F7F5]'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
