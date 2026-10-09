// Shared building blocks for the Farmer citizen forms (Log, Disaster):
// the hairline input, the labelled field block, the solid-green choice pill
// and the green-tinted group box, exactly as UPDATED FARMER CITIZEN UI.docx
// draws them. Farmer-only; Fisherfolk forms keep their own controls.

export const FIELD = 'w-full rounded-[10px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3.5 py-[13px] text-[15px] text-cz-text placeholder:text-cz-text-muted focus:border-cz-crop-deep focus:outline-none disabled:opacity-50'

export function Block({ label, required, optional, last, error, children }) {
  return (
    <div className={last ? '' : 'mb-[18px]'}>
      {label && (
        <label className="mb-2 block text-[14px] font-medium text-cz-text">
          {label}
          {required && <span className="ml-1 text-cz-danger-accent">*</span>}
          {optional && ` ${optional}`}
        </label>
      )}
      {children}
      {error && <p className="mt-1.5 text-[12px] text-cz-danger-accent">{error}</p>}
    </div>
  )
}

// Solid-green when chosen, hairline outline otherwise. `tone` swaps the chosen
// look for a semantic one (the disaster damage levels).
const CHOSEN = {
  green: 'bg-cz-crop-header',
  low: 'border-[0.5px] border-cz-status-good-fg bg-cz-status-good-bg',
  medium: 'border-[0.5px] border-cz-warn-accent bg-cz-warn-bg',
  high: 'border-[0.5px] border-cz-danger-accent bg-cz-danger-bg',
}
const CHOSEN_TEXT = {
  green: 'font-semibold text-white',
  low: 'font-semibold text-cz-status-good-fg',
  medium: 'font-semibold text-cz-warn-accent',
  high: 'font-semibold text-cz-danger-accent',
}

export function Choice({ selected, onClick, tone = 'green', disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`min-h-[46px] rounded-[10px] px-0.5 py-3 transition-colors disabled:opacity-50 sm:px-1 ${
        selected
          ? CHOSEN[tone]
          : 'border-[0.5px] border-cz-border-strong bg-cz-surface hover:bg-cz-page'
      }`}
    >
      <span className={`whitespace-nowrap text-[11.5px] sm:text-[13px] ${selected ? CHOSEN_TEXT[tone] : 'text-cz-text-2'}`}>
        {children}
      </span>
    </button>
  )
}

export function SoftBox({ children }) {
  return (
    <div className="mb-[18px] rounded-[12px] border-[0.5px] border-cz-crop-300 bg-cz-soft-crop p-3.5">
      {children}
    </div>
  )
}
