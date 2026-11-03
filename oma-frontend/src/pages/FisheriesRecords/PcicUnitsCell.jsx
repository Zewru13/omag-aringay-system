import PcicCheck from '../../components/UI/PcicCheck.jsx'
import { pcicUnitsCell } from './pcicUnits.js'

// The "PCIC INSURED" cell of Aquaculture Monitoring: one read-only tick per pond / cage of the row's cycle, labelled (Pond 1, Cage 2 ...),
// like the crops' PCIC INSURED column but per pond or cage. A row with no ponds/cages shows a single tick for the record itself.
// The insurance is changed in the cycle's Edit form.
export default function PcicUnitsCell({ units, recordInsured }) {
  const cell = pcicUnitsCell(units, recordInsured)
  if (cell.mode === 'record') return <PcicCheck insured={recordInsured} />
  return (
    <ul className="space-y-0.5" aria-label={`PCIC insurance: ${cell.summary}`} title={cell.summary}>
      {cell.shown.map((unit) => (
        <li key={unit.id} className="flex items-center gap-1.5 whitespace-nowrap text-[12px] text-[#1A2B1A]">
          <PcicCheck insured={unit.insured} />
          {unit.label}
        </li>
      ))}
      {cell.hiddenCount > 0 && (
        <li className="text-[11px] text-[#7A8E7A]" title={units.slice(cell.shown.length).map((u) => `${u.label}: ${u.insured ? 'insured' : 'not insured'}`).join('\n')}>
          {cell.hiddenText}
        </li>
      )}
    </ul>
  )
}
