import { useMemo, useState } from 'react'
import { BookOpen, Printer } from 'lucide-react'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import PillTabs from '../../components/UI/PillTabs.jsx'
import { SYSTEM_TITLE } from '../../constants/appInfo.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { AUDIENCES, audienceFor, manualFor } from './manualContent.js'
import { printManual } from './manualPrint.js'

// The User Manual: step-by-step guides with screenshots for the kind of account that is signed in (an Admin can also read the others). Print / Save
// as PDF turns the same guides into one document. The words and pictures are in manualContent.js and public/manual/.
export default function ManualPage() {
  const { user, isFarmer, isFisherfolk, isOrg, isAdmin } = useAuth()
  const { showToast } = useToast()
  const own = audienceFor({ role: user?.role, isFarmer, isFisherfolk, isOrg })
  const [chosen, setChosen] = useState(null)
  const audience = isAdmin && chosen ? chosen : own
  const guides = useMemo(() => manualFor(audience), [audience])
  const label = AUDIENCES.find((a) => a.id === audience)?.label || ''
  const [isPrinting, setIsPrinting] = useState(false)

  const print = async () => {
    setIsPrinting(true)
    try {
      await printManual({
        audienceLabel: label, guides, systemTitle: SYSTEM_TITLE,
        printedOn: new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()),
      })
    } catch {
      showToast('The manual could not be printed.', 'error')
    } finally {
      setIsPrinting(false)
    }
  }

  return (
    <PageLayout title="User Manual" subtitle={`Step-by-step guides with screenshots for the ${label} account`}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#E2E8E2] bg-white p-4">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-[#EBF5EE]"><BookOpen className="h-4 w-4 text-[#1B4D2E]" aria-hidden="true" /></div>
          <div className="min-w-0 flex-1 basis-64">
            <h2 className="text-[14px] font-semibold text-[#1A2B1A]">User Manual: {label}</h2>
            <p className="text-[12.5px] text-[#7A8E7A]">Pick a guide below. The screenshots use sample records, not real people.</p>
          </div>
          <button type="button" onClick={print} disabled={isPrinting}
            className="flex items-center gap-1.5 rounded-lg border border-[#D8E2D8] bg-white px-4 py-2 text-[13px] font-medium text-[#1B4D2E] transition-colors hover:bg-[#F5F7F5] disabled:cursor-wait disabled:opacity-60">
            <Printer size={16} aria-hidden="true" /> {isPrinting ? 'Preparing…' : 'Print / Save as PDF'}
          </button>
        </div>

        {isAdmin && (
          <PillTabs ariaLabel="Manual for" tabs={AUDIENCES.map(({ id, label: text }) => ({ id, label: text }))} value={audience} onChange={setChosen} />
        )}

        <nav aria-label="Guides" className="rounded-xl border border-[#E2E8E2] bg-white p-4">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#4A5E4A]">Contents</p>
          <ol className="grid gap-1 sm:grid-cols-2">
            {guides.map((g, i) => (
              <li key={g.id}><a href={`#guide-${g.id}`} className="text-[13px] text-[#1B4D2E] hover:underline">{i + 1}. {g.title}</a></li>
            ))}
          </ol>
        </nav>

        {guides.map((g, i) => (
          <section key={g.id} id={`guide-${g.id}`} className="scroll-mt-20 rounded-xl border border-[#E2E8E2] bg-white p-5" aria-labelledby={`guide-title-${g.id}`}>
            <h2 id={`guide-title-${g.id}`} className="text-[16px] font-semibold text-[#1A2B1A]">{i + 1}. {g.title}</h2>
            <p className="mb-4 mt-1 text-[13px] text-[#4A5E4A]">{g.intro}</p>
            <ol className="space-y-5">
              {g.steps.map((s, j) => (
                <li key={j} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#1B4D2E] text-[11px] font-bold text-white" aria-hidden="true">{j + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] leading-relaxed text-[#1A2B1A]">{s.text}</p>
                    {s.image && (
                      <figure className="mt-2">
                        <img src={s.image.file} alt={s.image.caption} loading="lazy" className="w-full rounded-lg border border-[#E2E8E2]" />
                        <figcaption className="mt-1 text-center text-[11.5px] text-[#7A8E7A]">{s.image.caption}</figcaption>
                      </figure>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </PageLayout>
  )
}
