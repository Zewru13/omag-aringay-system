import { ownerLine, ownershipLabel } from '../../utils/ownership.js'

// The Ownership cell of the Aquaculture Monitoring and Aquaculture Records tables: the ownership, and under "Tenant" the saved owner's name
// ("Owner: Juan Dela Cruz") in smaller, secondary text. `record` carries the cycle's ownership and owner_name (a stocking record does).
export default function OwnershipCell({ record }) {
  const owner = ownerLine(record)
  return (
    <span className="block">
      <span className="block">{ownershipLabel(record?.ownership)}</span>
      {owner && <span className="block max-w-[10rem] whitespace-normal break-words text-[11.5px] text-[#7A8E7A]">{owner}</span>}
    </span>
  )
}
