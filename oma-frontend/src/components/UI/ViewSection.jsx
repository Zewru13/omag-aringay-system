import { useState } from 'react'
import Button from './Button.jsx'
import ModalShell from './ModalShell.jsx'
import { countText } from '../../utils/viewSection.js'

// A long section of a profile page, folded into a small card: its name, how many there are, and a View button. View opens the section's own table in a
// floating window (the children), so the profile stays short and every section is one click away.
//   icon / title / count / noun   the card ("Farm Parcels", 3, "parcel" -> "3 parcels")
//   subtitle                      the line under the window's title
//   accent / soft                 the colours of the icon (a fisheries page passes its blue)
export default function ViewSection({
  icon: Icon, title, count, noun, subtitle = '', isLoading = false, accent = '#1B4D2E', soft = '#EBF5EE', maxWidth = 'max-w-5xl', children,
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <section className="flex items-center gap-3 rounded-xl border border-[#E2E8E2] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]" aria-label={title}>
        {Icon && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: soft, color: accent }}>
            <Icon size={18} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14px] font-semibold text-[#1A2B1A]">{title}</h2>
          <p className="text-[12.5px] text-[#7A8E7A]">{isLoading ? 'Loading…' : countText(count, noun)}</p>
        </div>
        <Button type="button" variant="outline" size="sm" aria-haspopup="dialog" onClick={() => setIsOpen(true)}>View</Button>
      </section>

      {isOpen && (
        <ModalShell
          title={title}
          subtitle={subtitle}
          icon={Icon}
          iconColor={accent}
          onClose={() => setIsOpen(false)}
          maxWidth={maxWidth}
          footer={<Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Close</Button>}
        >
          {children}
        </ModalShell>
      )}
    </>
  )
}
