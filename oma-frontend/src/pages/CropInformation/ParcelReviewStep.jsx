import { EntryCell, EntryHead, EntryRow, EntryTable, EntryTh } from '../../components/UI/EntryTable.jsx'
import { reviewRows } from './parcelWizard.js'

// Step 3 of Add Farm Parcels: everything that is about to be saved, one table line per parcel.
export default function ParcelReviewStep({ rows, cropTypes, farmerName }) {
  const lines = reviewRows(rows, cropTypes)
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-[#1A2B1A]">
        <span className="font-semibold">{lines.length} parcel{lines.length === 1 ? '' : 's'}</span> will be added to <span className="font-semibold">{farmerName}</span>.
        They are saved together: if one is refused, none is saved.
      </p>
      <EntryTable label="Parcels to be saved" testId="parcel-review">
        <EntryHead>
          <EntryTh>Parcel</EntryTh>
          <EntryTh>Area (ha)</EntryTh>
          <EntryTh>Land Ownership</EntryTh>
          <EntryTh>Farm Type / Schedule</EntryTh>
          <EntryTh>Classifications</EntryTh>
          <EntryTh>Crops</EntryTh>
        </EntryHead>
        <tbody>
          {lines.map((line) => (
            <EntryRow key={line.id}>
              <EntryCell label="Parcel">
                <p className="whitespace-nowrap text-[13px] font-medium text-[#1A2B1A] max-md:whitespace-normal">{line.number}</p>
                <p className="text-[12px] text-[#7A8E7A]">{line.barangay}</p>
              </EntryCell>
              <EntryCell label="Area (ha)" className="text-[13px] text-[#1A2B1A]">{line.area}</EntryCell>
              <EntryCell label="Land Ownership">
                <p className="text-[13px] text-[#1A2B1A]">{line.ownership}</p>
                {line.taxDec && <p className="text-[12px] text-[#7A8E7A]">Tax Dec: {line.taxDec}</p>}
              </EntryCell>
              <EntryCell label="Farm Type / Schedule">
                <p className="text-[13px] text-[#1A2B1A]">{line.farmType}</p>
                <p className="text-[12px] text-[#7A8E7A]">{line.schedule}</p>
              </EntryCell>
              <EntryCell label="Classifications" className="text-[13px] text-[#1A2B1A]">{line.classifications}</EntryCell>
              <EntryCell label="Crops" className="text-[13px] text-[#1A2B1A]">
                {line.crops.length === 0
                  ? <span className="text-[#7A8E7A]">No crops</span>
                  : <ul className="space-y-0.5">{line.crops.map((crop, i) => <li key={i}>{crop}</li>)}</ul>}
              </EntryCell>
            </EntryRow>
          ))}
        </tbody>
      </EntryTable>
    </div>
  )
}
