import { FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'

// The fields of a crop harvest as table rows, shared by Record Harvest and Edit Harvest Record so the two always show the same fields in the same
// order with the same names. Each window passes its own inputs (and keeps its own rules); this only lays them out.
//   dateInput, areaInput, unitSelect, quantityInput, notesInput   the controls
//   dateHint / areaHint / quantityHint                            small text under a control (a note, an error)
//   reason                                                        the late-harvest block (Record Harvest only), shown under the date
//   quantityExtra                                                 under the quantity: the total-kg box, the estimate comparison
export default function HarvestFormRows({ title = 'Harvest Details', dateInput, dateHint = null, reason = null, areaInput, areaHint = null, unitSelect, quantityInput, quantityHint = null, quantityExtra = null, notesInput }) {
  return (
    <FormSection title={title}>
      <FormRows label="Harvest details">
        <FormRow>
          <FormCell label="Harvested Date" required wide hint={dateHint}>
            <div className="md:max-w-[16rem]">{dateInput}</div>
          </FormCell>
        </FormRow>
        {reason && (
          <FormRow>
            <FormCell label="Reason" wide>{reason}</FormCell>
          </FormRow>
        )}
        <FormRow>
          <FormCell label="Area Harvested (ha)" required hint={areaHint}>{areaInput}</FormCell>
          <FormCell label="Unit of Measure" required>{unitSelect}</FormCell>
        </FormRow>
        <FormRow>
          <FormCell label="Quantity Harvested" required wide hint={quantityHint}>
            <div className="md:max-w-[16rem]">{quantityInput}</div>
            {quantityExtra}
          </FormCell>
        </FormRow>
        <FormRow>
          <FormCell label="Remarks" wide>{notesInput}</FormCell>
        </FormRow>
      </FormRows>
    </FormSection>
  )
}
