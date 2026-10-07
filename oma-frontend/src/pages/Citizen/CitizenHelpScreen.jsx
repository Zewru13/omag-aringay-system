import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, RefreshCcw, SquarePen, Lock } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { CitizenBody, CitizenScreen, CitizenSubHeader } from './citizenUI.jsx'

// Farmer/Fisherfolk individual Help screen. Shared between both
// domains -- only `theme` and `L` (labels.farmerHelp / labels.fisherfolkHelp)
// differ. Desktop and mobile are genuinely different layouts per the
// reference, not one responsive component: desktop shows a "Field
// Behaviors" legend card in a sidebar column; mobile omits that card and
// shows a Log out row instead. `bare` selects which one renders --
// callers only ever reach this already knowing which POV they're in
// (see CitizenProfileScreen's identical bare convention), so there is no
// Tailwind breakpoint switching the two internally.

const CARD = 'overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface'

function FaqItem({ q, a, isOpen, onToggle }) {
  return (
    <div className="border-b-[0.5px] border-cz-border last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-cz-page"
      >
        <span className="text-[14px] font-semibold text-cz-text">{q}</span>
        <ChevronDown
          size={17}
          className={`shrink-0 text-cz-text-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <p className="px-4 pb-4 text-[13.5px] leading-[1.55] text-cz-text-2">{a}</p>
        </div>
      </div>
    </div>
  )
}

function ContactCard({ L }) {
  const rows = [
    [L.contactOfficeLabel, L.contactOfficeValue],
    [L.contactAddressLabel, L.contactAddressValue],
    [L.contactPhoneLabel, L.contactPhoneValue],
    [L.contactHoursLabel, L.contactHoursValue],
  ]
  return (
    <div className={`${CARD} p-4`}>
      <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{L.contactHeading}</p>
      <div className="mb-3 rounded-[10px] border border-[#F5E0A3] bg-cz-alert-bg px-3.5 py-2.5">
        <p className="text-[12.5px] italic leading-[1.5] text-cz-alert-title">{L.contactPlaceholderNote}</p>
      </div>
      <div className="space-y-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <p className="text-[11px] font-medium text-cz-text-muted">{label}</p>
            <p className="mt-0.5 text-[13.5px] italic leading-[1.4] text-cz-text-2">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function BehaviorsCard({ theme, L }) {
  const rows = [
    { Icon: SquarePen, tone: theme.accentText, label: L.behaviorInstantLabel, desc: L.behaviorInstantDesc },
    { Icon: RefreshCcw, tone: 'text-amber-600', label: L.behaviorRequestLabel, desc: L.behaviorRequestDesc },
    { Icon: Lock, tone: 'text-cz-text-muted', label: L.behaviorReadonlyLabel, desc: L.behaviorReadonlyDesc },
  ]
  return (
    <div className={`${CARD} p-4`}>
      <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{L.behaviorsHeading}</p>
      <div className="space-y-3">
        {rows.map(({ Icon, tone, label, desc }) => (
          <div key={label} className="flex items-start gap-2.5">
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cz-page ${tone}`}>
              <Icon size={13} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-cz-text">{label}</p>
              <p className="text-[12.5px] leading-[1.4] text-cz-text-2">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FaqCard({ L, openKey, setOpenKey }) {
  return (
    <section className={CARD}>
      <div className="border-b-[0.5px] border-cz-border bg-cz-page px-4 py-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{L.faqHeading}</p>
      </div>
      {L.faq.map((item) => (
        <FaqItem
          key={item.key}
          q={item.q}
          a={item.a}
          isOpen={openKey === item.key}
          onToggle={() => setOpenKey((k) => (k === item.key ? null : item.key))}
        />
      ))}
    </section>
  )
}

export default function CitizenHelpScreen({ theme, L, onBack, tabBar, bare = false }) {
  const [openKey, setOpenKey] = useState(null)
  const { logout } = useAuth()
  const navigate = useNavigate()
  const doLogout = () => { logout(); navigate('/login') }

  // ── Desktop POV: two-column, Field Behaviors card, no logout row here
  //    (logout already lives in the account dropdown) ────────────────────
  if (bare) {
    return (
      <div className="mx-auto max-w-[900px] px-6 py-5">
        <div className="grid grid-cols-[1.5fr_1fr] items-start gap-5">
          <FaqCard L={L} openKey={openKey} setOpenKey={setOpenKey} />
          <div className="space-y-4">
            <ContactCard L={L} />
            <BehaviorsCard theme={theme} L={L} />
          </div>
        </div>
      </div>
    )
  }

  // ── Phone POV: single column, no Field Behaviors card, Log out row
  //    instead (this sub-view has no persistent nav shell to log out from)
  return (
    <CitizenScreen hasTabBar>
      <CitizenSubHeader theme={theme} title={L.title} subtitle={L.subtitle} onBack={onBack} />
      <CitizenBody className="space-y-4">
        <FaqCard L={L} openKey={openKey} setOpenKey={setOpenKey} />
        <ContactCard L={L} />
        <button
          type="button"
          onClick={doLogout}
          className="flex w-full items-center justify-center gap-2 rounded-[10px] border-[0.5px] border-cz-danger-border bg-cz-surface py-3.5 text-[14.5px] font-medium text-cz-danger-accent transition-colors hover:bg-cz-danger-bg"
        >
          <LogOut size={16} aria-hidden="true" />
          {L.logoutCta}
        </button>
      </CitizenBody>
      {tabBar}
    </CitizenScreen>
  )
}
