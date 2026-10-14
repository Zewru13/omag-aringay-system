// Phone layout pieces for the forecasting pages (crop and fisheries).
//
// ForecastCard: one growing crop / stocking as a compact card — name and status on top, who and where under it,
// a row of up to three figures, and one full-width action. `stats` is [{ label, value, sub?, subTone? }].
//
// STACK_TABLES: put on the wrapper of a table to turn every table inside it into labelled cards on phones
// (each <td data-label="..."> shows its label above the value); desktop is untouched.

export const STACK_TABLES = 'max-md:[&_tr]:border-b max-md:[&_tr]:border-[#F0F4F0] max-md:[&_table]:block max-md:[&_tbody]:block max-md:[&_thead]:hidden max-md:[&_tr]:block max-md:[&_tr]:px-3 max-md:[&_tr]:py-2.5 max-md:[&_td]:block max-md:[&_td]:w-full max-md:[&_td]:px-0 max-md:[&_td]:py-1 max-md:[&_td]:text-left max-md:[&_td[data-label]]:before:mb-0.5 max-md:[&_td[data-label]]:before:block max-md:[&_td[data-label]]:before:text-[11px] max-md:[&_td[data-label]]:before:font-semibold max-md:[&_td[data-label]]:before:uppercase max-md:[&_td[data-label]]:before:tracking-wide max-md:[&_td[data-label]]:before:text-[#7A8E7A] max-md:[&_td[data-label]]:before:content-[attr(data-label)]'

const SUB_TONE = { rose: 'text-rose-600', amber: 'text-amber-700', muted: 'text-[#7A8E7A]' }

export function ForecastCard({ title, status, subtitle, stats = [], onOpen, openLabel = 'View details', expanded, children }) {
  return (
    <div className="rounded-xl border border-[#E2E8E2] bg-white p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[15px] font-semibold leading-snug text-[#1A2B1A]">{title}</p>
        {status}
      </div>
      {subtitle && <p className="mt-0.5 text-[12px] leading-snug text-[#7A8E7A]">{subtitle}</p>}

      {stats.length > 0 && (
        <dl className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-[#F5F8F5] p-2.5">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#7A8E7A]">{s.label}</dt>
              <dd className="mt-0.5 text-[13px] font-semibold leading-tight text-[#1A2B1A]">{s.value}</dd>
              {s.sub && <p className={`mt-0.5 text-[10.5px] leading-tight ${SUB_TONE[s.subTone || 'muted']}`}>{s.sub}</p>}
            </div>
          ))}
        </dl>
      )}

      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={expanded}
          className="mt-3 flex min-h-[40px] w-full items-center justify-center rounded-lg border border-[#C8D5C8] text-[13px] font-medium text-[#1B4D2E] transition-colors hover:bg-[#F0F4F0]"
        >
          {openLabel}
        </button>
      )}
      {children}
    </div>
  )
}
