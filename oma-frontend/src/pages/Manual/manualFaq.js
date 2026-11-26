// The common questions of the User Manual, by the same audience ids as its screen guides. The staff questions are in
// Help/helpContent.js (filtered by role); the farmer, fisherfolk and organization ones are in Account/helpAnswers.js.
import { helpFor } from '../Help/helpContent.js'
import { HELP } from '../Account/helpAnswers.js'

const STAFF_ROLE = { admin: 'ADMIN', focal: 'EVALUATOR' }

// [{ title, items: [{ q, a }] }] for an audience; [] for one that is not known.
export function questionsFor(audience) {
  if (STAFF_ROLE[audience]) return helpFor(STAFF_ROLE[audience]).sections
  const own = HELP[audience]
  return own ? [{ title: 'About your account', items: own.faq }] : []
}

// The ids the page gives each question and About This System, so the search can jump to them.
export const faqTarget = (section, item) => `faq-${section}-${item}`
export const ABOUT_TARGET = 'about-system'

// What the search matches for About This System, besides its title.
export const ABOUT_WORDS = 'System name, the office, the 24 barangays covered, office contact email, and the developers of the system.'
