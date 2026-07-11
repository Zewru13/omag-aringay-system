import { Check, X } from 'lucide-react'

// Client-side mirror of the server-side policy (accounts/validators.py +
// AUTH_PASSWORD_VALIDATORS) for instant feedback only. The server always
// re-validates on submit — this is not the source of truth.
const LOCAL_DENYLIST_TERMS = [
  'aringay', 'omag', 'oma aringay', 'omaaringay', 'password', 'capstone',
  'municipalagriculturist', 'launion', 'la union', 'agriculturist',
]

// A short sample of the most common passwords, for instant feedback only —
// the server checks against Django's full common-password list on submit.
const OBVIOUSLY_COMMON = [
  'password123', '123456789012345', 'qwertyuiopasdfgh', 'letmein12345678',
  'iloveyou12345678', 'football1234567', 'baseball1234567', 'princess123456',
]

export function evaluatePassword(password) {
  const trimmed = password || ''
  const lower = trimmed.toLowerCase()
  const meetsLength = trimmed.length >= 15
  const hitsLocalTerm = LOCAL_DENYLIST_TERMS.some(term => lower.includes(term))
  const hitsCommon = OBVIOUSLY_COMMON.some(term => lower === term)
  const notObviouslyWeak = trimmed.length === 0 ? null : !hitsLocalTerm && !hitsCommon
  return { meetsLength, notObviouslyWeak }
}

function Item({ ok, label }) {
  const state = ok === null ? 'pending' : ok ? 'pass' : 'fail'
  const colorCls = state === 'pass' ? 'text-emerald-600' : state === 'fail' ? 'text-rose-500' : 'text-[#A8BCA8]'
  return (
    <li className={`flex items-center gap-1.5 text-[12px] ${colorCls}`}>
      {state === 'pass' ? <Check size={13} /> : state === 'fail' ? <X size={13} /> : <span className="w-[13px] h-[13px] rounded-full border border-current inline-block" />}
      {label}
    </li>
  )
}

export default function PasswordRequirementChecklist({ password }) {
  const { meetsLength, notObviouslyWeak } = evaluatePassword(password)
  return (
    <ul className="space-y-1 rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-2.5">
      <Item ok={password ? meetsLength : null} label="At least 15 characters (passphrases welcome)" />
      <Item ok={notObviouslyWeak} label="Not a common or easily-guessed password" />
    </ul>
  )
}
