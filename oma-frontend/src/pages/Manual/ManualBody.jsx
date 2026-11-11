import { useMemo, useState } from 'react'
import { BookOpen, Printer } from 'lucide-react'
import PillTabs from '../../components/UI/PillTabs.jsx'
import { SYSTEM_TITLE } from '../../constants/appInfo.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { AUDIENCES, audienceFor, manualFor, manualIntro } from './manualContent.js'
import { printManual } from './manualPrint.js'

const CARD = 'rounded-xl border border-[#E2E8E2] bg-white p-5'

// One annotated picture: its title, the picture with its numbered orange boxes, and the table that says what each number is.
function Screen({ screen, number }) {
  return (
    <figure className="rounded-lg border border-[#E2E8E2] bg-[#FBFCFB] p-3">
      <figcaption className="mb-2">
        <p className="text-[13.5px] font-semibold text-[#1A2B1A]">{number}. {screen.title}</p>
        <p className="text-[12.5px] text-[#4A5E4A]">{screen.purpose}</p>
      </figcaption>
      <a href={screen.image} target="_blank" rel="noreferrer" className="block" aria-label={`Open the ${screen.title} picture full size`}>
        <img src={screen.image} alt={`${screen.title}: ${screen.purpose}`} loading="lazy"
          width={screen.width || (screen.phone ? 780 : 1280)} height={screen.height || (screen.phone ? 1688 : 800)}
          className={`h-auto rounded-md border border-[#E2E8E2] ${screen.phone ? 'mx-auto w-full max-w-[300px]' : 'w-full'}`} />
      </a>
      <ol className="mt-3 divide-y divide-[#EEF2EE] text-[12.5px]" aria-label="What each number in the picture is">
        {screen.legend.map((row) => (
          <li key={row.n} className="flex gap-2.5 py-1.5">
            <span className="mt-px inline-flex h-5 min-w-5 flex-none items-center justify-center rounded bg-[#F97316] px-1 text-[11px] font-bold text-white" aria-hidden="true">{row.n}</span>
            <p className="min-w-0 flex-1 text-[#1A2B1A]"><span className="font-semibold">{row.label}:</span> {row.desc}</p>
          </li>
        ))}
      </ol>
    </figure>
  )
}

// The User Manual's annotated screen guides for the kind of account that is signed in (an Admin can also read the others). Print / Save as PDF turns the same
// guides into one document. The words are in manualContent.js; the pictures and their number tables come from the screenshot tool (scripts/manual/shoot.mjs).
// It is the whole of the User Manual page (ManualPage.jsx, /manual); the quick guide and the questions are on the Help pages, not here.
export default function ManualBody() {
  const { user, isFarmer, isFisherfolk, isOrg, isAdmin } = useAuth()
  const { showToast } = useToast()
  const own = audienceFor({ role: user?.role, isFarmer, isFisherfolk, isOrg })
  const [chosen, setChosen] = useState(null)
  const audience = isAdmin && chosen ? chosen : own
  const guides = useMemo(() => manualFor(audience), [audience])
  const intro = useMemo(() => manualIntro(audience), [audience])
  const label = AUDIENCES.find((a) => a.id === audience)?.label || ''
  const [isPrinting, setIsPrinting] = useState(false)

  const print = async () => {
    setIsPrinting(true)
    try {
      await printManual({
        audienceLabel: label, guides, intro, systemTitle: SYSTEM_TITLE,
        printedOn: new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()),
      })
    } catch {
      showToast('The manual could not be printed.', 'error')
    } finally {
      setIsPrinting(false)
    }
  }

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#E2E8E2] bg-white p-4">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-[#EBF5EE]"><BookOpen className="h-4 w-4 text-[#1B4D2E]" aria-hidden="true" /></div>
          <div className="min-w-0 flex-1 basis-64">
            <h2 className="text-[14px] font-semibold text-[#1A2B1A]">Screen guides: {label}</h2>
            <p className="text-[12.5px] text-[#7A8E7A]">Pick a guide below. The pictures use sample records, not real people.</p>
          </div>
          <button type="button" onClick={print} disabled={isPrinting}
            className="flex items-center gap-1.5 rounded-lg border border-[#D8E2D8] bg-white px-4 py-2 text-[13px] font-medium text-[#1B4D2E] transition-colors hover:bg-[#F5F7F5] disabled:cursor-wait disabled:opacity-60">
            <Printer size={16} aria-hidden="true" /> {isPrinting ? 'Preparing…' : 'Print / Save as PDF'}
          </button>
        </div>

        {isAdmin && (
          <PillTabs ariaLabel="Manual for" tabs={AUDIENCES.map(({ id, label: text }) => ({ id, label: text }))} value={audience} onChange={setChosen} />
        )}

        <section className={CARD} aria-labelledby="manual-intro">
          <h2 id="manual-intro" className="text-[16px] font-semibold text-[#1A2B1A]">About this guide</h2>
          <p className="mt-1 text-[13px] text-[#4A5E4A]">{intro.lead}</p>
          <nav aria-label="Guides" className="mt-3">
            <ol className="space-y-1.5">
              {intro.contents.map((c) => (
                <li key={c.n} className="text-[13px] text-[#1A2B1A]">
                  <a href={`#guide-${guides[c.n - 1].id}`} className="font-semibold text-[#1B4D2E] hover:underline">{c.n}. {c.title}</a>
                  <span className="text-[#4A5E4A]">: {c.about}</span>
                </li>
              ))}
            </ol>
          </nav>
        </section>

        <section className={CARD} aria-labelledby="manual-howto">
          <h2 id="manual-howto" className="text-[15px] font-semibold text-[#1A2B1A]">How to read the pictures</h2>
          <p className="mt-1 flex items-start gap-2 text-[13px] text-[#4A5E4A]">
            <span className="mt-0.5 inline-flex h-5 min-w-5 flex-none items-center justify-center rounded bg-[#F97316] px-1 text-[11px] font-bold text-white" aria-hidden="true">1</span>
            <span>{intro.howToRead}</span>
          </p>
        </section>

        <section className={CARD} aria-labelledby="manual-notes">
          <h2 id="manual-notes" className="text-[15px] font-semibold text-[#1A2B1A]">Notes on the pictures</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-[#4A5E4A]">
            {intro.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </section>

        {guides.map((g, i) => (
          <section key={g.id} id={`guide-${g.id}`} className={`${CARD} scroll-mt-20`} aria-labelledby={`guide-title-${g.id}`}>
            <h2 id={`guide-title-${g.id}`} className="text-[16px] font-semibold text-[#1A2B1A]">{i + 1}. {g.title}</h2>
            <p className="mb-3 mt-1 text-[13px] text-[#4A5E4A]">{g.intro}</p>
            <ol className="mb-4 space-y-2">
              {g.steps.map((step, j) => (
                <li key={step} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#1B4D2E] text-[11px] font-bold text-white" aria-hidden="true">{j + 1}</span>
                  <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-[#1A2B1A]">{step}</p>
                </li>
              ))}
            </ol>
            <div className="space-y-4">
              {g.screens.map((s, k) => <Screen key={s.id} screen={s} number={`${i + 1}.${k + 1}`} />)}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
