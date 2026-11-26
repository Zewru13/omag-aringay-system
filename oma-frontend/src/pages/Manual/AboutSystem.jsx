import { Info } from 'lucide-react'
import { SYSTEM_TITLE, MAIN_DEVELOPER, CO_DEVELOPER, SCHOOL, OFFICE_CONTACT } from '../../constants/appInfo.js'
import { ABOUT_TARGET } from './manualFaq.js'

const CELL = 'rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] p-4'
const LABEL = 'mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7A8E7A]'
const LINK = 'hover:text-[#1B4D2E] hover:underline'

// About This System: what it is, the office it serves, how to reach it and who built it. The same for every account.
export default function AboutSystem() {
  return (
    <section id={ABOUT_TARGET} className="scroll-mt-32 rounded-xl border border-[#E2E8E2] bg-white p-5" aria-labelledby="about-system-title">
      <h2 id="about-system-title" className="mb-3 flex items-center gap-2 text-[16px] font-semibold text-[#1A2B1A]">
        <Info className="h-4 w-4 text-[#1B4D2E]" aria-hidden="true" /> About This System
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={CELL}>
          <p className={LABEL}>System Name</p>
          <p className="text-[13px] font-medium text-[#1A2B1A]">{SYSTEM_TITLE}</p>
        </div>
        <div className={CELL}>
          <p className={LABEL}>Office</p>
          <p className="text-[13px] font-medium text-[#1A2B1A]">Office of the Municipal Agriculturist (OMAg)</p>
          <p className="mt-0.5 text-[12px] text-[#7A8E7A]">Aringay, La Union</p>
        </div>
        <div className={CELL}>
          <p className={LABEL}>Coverage</p>
          <p className="text-[13px] font-medium text-[#1A2B1A]">24 Barangays of Aringay</p>
          <p className="mt-0.5 text-[12px] text-[#7A8E7A]">La Union, Region I</p>
        </div>
        <div className={CELL}>
          <p className={LABEL}>Office Contact</p>
          {OFFICE_CONTACT.emails.map((email) => (
            <p key={email} className="break-all text-[13px] font-medium text-[#1A2B1A]">
              <a href={`mailto:${email}`} className={LINK}>{email}</a>
            </p>
          ))}
        </div>
        <div className={`${CELL} sm:col-span-2`}>
          <p className={LABEL}>System Developed By</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold text-[#1B4D2E]">Main Developer</p>
              <p className="text-[13px] font-medium text-[#1A2B1A]">{MAIN_DEVELOPER.name}</p>
              <p className="mt-0.5 break-all text-[12px] text-[#7A8E7A]"><a href={`mailto:${MAIN_DEVELOPER.email}`} className={LINK}>{MAIN_DEVELOPER.email}</a></p>
              <p className="text-[12px] text-[#7A8E7A]"><a href={`tel:${MAIN_DEVELOPER.phone}`} className={LINK}>{MAIN_DEVELOPER.phone}</a></p>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold text-[#1B4D2E]">Co-Developer</p>
              <p className="text-[13px] font-medium text-[#1A2B1A]">{CO_DEVELOPER.name}</p>
            </div>
          </div>
          <p className="mt-3 text-[12px] text-[#7A8E7A]">{SCHOOL}</p>
        </div>
      </div>
    </section>
  )
}
