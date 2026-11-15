import StatusPill from '../../components/UI/StatusPill.jsx'
import { toneOf } from './statusTone.js'

// The status badge of the account screens: one of four tones, decided by statusTone.js from the status itself (or given as `tone`).
// Drawn with the office StatusPill so a badge looks the same everywhere.
const PILL_TONE = { green: 'green', amber: 'amber', red: 'rose', grey: 'slate' }

export default function StatusBadge({ status, tone, children }) {
  return <StatusPill tone={PILL_TONE[tone || toneOf(status)]}>{children ?? status}</StatusPill>
}
