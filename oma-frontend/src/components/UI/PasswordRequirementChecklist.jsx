import { Check, X } from 'lucide-react'
import { evaluatePassword } from '../../utils/passwordRules.js'

// Live checklist of the password rules (the rule logic lives in utils/passwordRules.js, a mirror of the server policy
// for instant feedback only — the server always re-validates on submit).
export { evaluatePassword }

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
  const rules = evaluatePassword(password)
  return (
    <ul className="space-y-1 rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-2.5">
      <Item ok={rules.length} label="At least 8 characters" />
      <Item ok={rules.capital} label="1 capital letter" />
      <Item ok={rules.special} label="1 special character (like # or @)" />
      <Item ok={rules.digits} label="At least 3 numbers" />
      <Item ok={rules.notWeak} label="Not a common or easily-guessed password" />
    </ul>
  )
}
