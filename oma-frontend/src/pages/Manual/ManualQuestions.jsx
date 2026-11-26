import { ChevronDown, HelpCircle } from 'lucide-react'
import { faqTarget } from './manualFaq.js'

// The common questions under the screen guides. `open` is the set of ids shown open; the search at the top of the page opens the
// question it jumps to.
export default function ManualQuestions({ sections, open, onToggle }) {
  if (!sections.length) return null
  return (
    <section id="manual-questions" className="scroll-mt-32 rounded-xl border border-[#E2E8E2] bg-white p-5" aria-labelledby="manual-questions-title">
      <h2 id="manual-questions-title" className="flex items-center gap-2 text-[16px] font-semibold text-[#1A2B1A]">
        <HelpCircle className="h-4 w-4 text-[#1B4D2E]" aria-hidden="true" /> Common questions
      </h2>
      <div className="mt-3 space-y-5">
        {sections.map((section, s) => (
          <section key={section.title} aria-label={section.title}>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7A8E7A]">{section.title}</h3>
            {section.items.map((faq, i) => {
              const id = faqTarget(s, i)
              const shown = open.has(id)
              return (
                <div key={faq.q} id={id} className="scroll-mt-32 border-b border-[#F0F4F0] last:border-0">
                  <button type="button" onClick={() => onToggle(id)} aria-expanded={shown}
                    className="flex min-h-[44px] w-full items-center justify-between gap-3 py-2.5 text-left hover:text-[#1B4D2E]">
                    <span className="text-[13px] font-medium text-[#1A2B1A]">{faq.q}</span>
                    <ChevronDown className={`h-4 w-4 flex-none text-[#A8BCA8] transition-transform duration-200 ${shown ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  {shown && <p className="pb-3.5 text-[13px] leading-relaxed text-[#4A5E4A]">{faq.a}</p>}
                </div>
              )
            })}
          </section>
        ))}
      </div>
    </section>
  )
}
