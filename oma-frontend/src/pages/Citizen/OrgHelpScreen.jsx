import { useState } from 'react'
import { ChevronDown, MapPin } from 'lucide-react'
import { OrgPageHeader, OrgSectionLabel, OrgShell } from './OrgDashboardParts.jsx'
import { labels } from './labels.js'
import { ORG_SURFACE } from './orgStyles.js'

// New screen — spec item 10. Real FAQ content covering the actual
// capabilities this account has (not a placeholder page), plus an OMAg
// contact section that is honestly marked as not-yet-finalized rather than
// inventing a real-looking address/phone/hours.
//
// Mounts through the same OrgShell + OrgPageHeader as every other
// Organization screen (white top bar, sidebar, "< Bumalik" + title in the
// content area) — it was the last screen still on the retired OrgScreen shell,
// whose navy bar with the title inside it made this page look like a
// different app.

function FaqItem({ q, a, isOpen, onToggle }) {
  return (
    <div className="border-b-[0.5px] border-cz-border last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-cz-page"
      >
        <span className="text-[14.5px] font-semibold text-cz-text">{q}</span>
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

export default function OrgHelpScreen({ domain, orgName, onBack, tabBar, active, onNav }) {
  const theme = domain.dashboardTheme
  const H = labels.orgHelp
  const [openKey, setOpenKey] = useState(H.faq[0]?.key || null)

  return (
    <OrgShell
      theme={theme} chipLabel={orgName} active={active}
      onNav={(key) => (key === 'home' ? onBack() : onNav(key))}
      tabBar={tabBar} wide={false}
    >
      <OrgPageHeader title={H.title} onBack={onBack} />
      <div className="max-w-[640px] space-y-4">
        <section>
          <OrgSectionLabel>{H.faqHeading}</OrgSectionLabel>
          <div className={ORG_SURFACE}>
            {H.faq.map((item) => (
              <FaqItem
                key={item.key}
                q={item.q}
                a={item.a}
                isOpen={openKey === item.key}
                onToggle={() => setOpenKey((k) => (k === item.key ? null : item.key))}
              />
            ))}
          </div>
        </section>

        <section>
          <OrgSectionLabel>{H.contactHeading}</OrgSectionLabel>
          <div className="rounded-[12px] border-[0.5px] border-dashed border-cz-border-strong bg-cz-tile-slate-bg p-4">
            <div className="flex items-start gap-3">
              <MapPin size={18} className="mt-0.5 shrink-0 text-cz-text-muted" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-cz-text">{H.contactOfficeName}</p>
                <p className="mt-1 text-[13px] leading-[1.5] text-cz-text-2">{H.contactPlaceholderNote}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </OrgShell>
  )
}
