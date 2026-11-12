import ErrorMessage from './UI/ErrorMessage.jsx'
import LoadingSpinner from './UI/LoadingSpinner.jsx'
import ModalShell from './UI/ModalShell.jsx'
import ListPrintButton from './ListPrintButton.jsx'
import { DetailTable, FormSection } from './UI/FormTable.jsx'
import { EntryCell, EntryHead, EntryRow, EntryTable, EntryTh } from './UI/EntryTable.jsx'
import { buildPersonHistorySpec } from '../pages/AssistanceManagement/assistanceHistoryReport.js'
import { formatDate } from '../utils/dateFormat.js'

// The Assistance History window of a farmer's or a fisherfolk's profile: who it is, then every assistance they were given, one row each.
// `domain` is 'crop' or 'fisheries' (it picks the printed paper); `history` rows carry a `source_agency` text already joined.
const COLUMNS = ['Assistance Type', 'Source Agency', 'Quantity', 'Season', 'Year', 'Date Given']
const text = (value) => (value === null || value === undefined || value === '' ? '—' : value)

export default function AssistanceHistoryModal({ domain, history, isLoading, error, person, onClose }) {
  return (
    <ModalShell title="Assistance History" onClose={onClose} maxWidth="max-w-3xl">
      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message={error} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap justify-end gap-2">
            <ListPrintButton disabled={history.length === 0} build={async () => buildPersonHistorySpec({ domain, person, records: history })} />
          </div>
          <DetailTable
            title="Beneficiary"
            fields={[
              { label: 'Name', value: person?.name },
              { label: 'RSBSA Number', value: person?.rsbsa },
              { label: 'Barangay', value: person?.barangay },
            ]}
          />
          <FormSection title="Assistance Received">
            {history.length === 0 ? (
              <p className="px-3 py-4 text-center text-[13px] italic text-[#7A8E7A]">No assistance has been recorded yet.</p>
            ) : (
              <EntryTable bare label="Assistance received" testId="assistance-history-table">
                <EntryHead>{COLUMNS.map((c) => <EntryTh key={c}>{c}</EntryTh>)}</EntryHead>
                <tbody>
                  {history.map((r, i) => (
                    <EntryRow key={r.id ?? i}>
                      <EntryCell label="Assistance Type" className="font-medium text-[#1A2B1A]">{text(r.assistance_type)}</EntryCell>
                      <EntryCell label="Source Agency">{text(r.source_agency)}</EntryCell>
                      <EntryCell label="Quantity">{text(r.quantity)}</EntryCell>
                      <EntryCell label="Season">{text(r.season)}</EntryCell>
                      <EntryCell label="Year">{text(r.year)}</EntryCell>
                      <EntryCell label="Date Given" className="whitespace-nowrap">{formatDate(r.date_given)}</EntryCell>
                    </EntryRow>
                  ))}
                </tbody>
              </EntryTable>
            )}
          </FormSection>
        </div>
      )}
    </ModalShell>
  )
}
