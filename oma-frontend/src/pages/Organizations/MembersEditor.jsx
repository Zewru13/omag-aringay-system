import { useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { localToday } from '../../utils/inputGuards.js'
import ImportFileAttach from './ImportFileAttach.jsx'
import MembersPickerModal from './MembersPickerModal.jsx'
import { MEMBER_POSITIONS, addMemberLine } from './registrationMembers.js'

// The members of an organization, as lines on its registration or edit form: "Add Members" opens a table of the registered farmers / fisherfolk who
// are not members yet (search, select, choose each one's position), and/or a members file is attached (registration only: `onImportFile`). The form
// owns the list (lines made by makeMemberLine, checked by memberLinesProblem, sent through memberPayload); the file is read once the organization is
// saved, in the same Import Members window as the organization's page. Nothing is saved from here.
const SUB_TH = 'px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#4A5E4A] whitespace-nowrap'
const SUB_CELL = 'px-2 py-2 align-top max-md:block max-md:w-full max-md:px-0 max-md:py-1 max-md:text-left max-md:before:mb-0.5 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]'

export default function MembersEditor({ type, lines, onChange, registered, organizationId = null, importFile = null, onImportFile = null }) {
  const nextUid = useRef(1)
  const [showPicker, setShowPicker] = useState(false)

  const addPicked = (picked) => {
    let next = lines
    picked.forEach(({ person, position }) => { next = addMemberLine(next, person, Date.now() + nextUid.current++, position) })
    onChange(next)
    setShowPicker(false)
  }
  const update = (uid, patch) => onChange(lines.map((l) => (l._uid === uid ? { ...l, ...patch } : l)))

  return (
    <div className="space-y-3">
      <div>
        <button type="button" onClick={() => setShowPicker(true)}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#1B4D2E] px-4 text-[13px] font-semibold text-white hover:bg-[#235E38]">
          <Plus size={15} aria-hidden="true" /> Add Members
        </button>
      </div>

      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#C8D5C8] px-4 py-3 text-[13px] text-[#7A8E7A]">No members added. Leave it empty to add them later from the organization page.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#E2E8E2] bg-white max-md:overflow-visible max-md:border-0 max-md:bg-transparent">
          <table className="min-w-full table-fixed text-sm max-md:block" aria-label="Members to add">
            <thead className="bg-[#EBF5EE] max-md:hidden">
              <tr>
                <th className={SUB_TH}>Member</th>
                <th className={SUB_TH} style={{ width: 170 }}>Position</th>
                <th className={SUB_TH} style={{ width: 170 }}>Date joined</th>
                <th style={{ width: 52 }} />
              </tr>
            </thead>
            <tbody className="max-md:block">
              {lines.map((line, i) => (
                <tr key={line._uid} className="border-b border-[#F0F4F0] max-md:mb-2 max-md:block max-md:rounded-xl max-md:border max-md:border-[#E2E8E2] max-md:bg-white max-md:p-3">
                  <td data-label={`Member ${i + 1}`} className={SUB_CELL}>
                    <span className="block text-[13px] font-medium text-[#1A2B1A]">{line.name}</span>
                    <span className="block text-[11.5px] text-[#7A8E7A]">{line.rsbsa}</span>
                  </td>
                  <td data-label="Position" className={SUB_CELL}>
                    <select className={baseInputClasses} value={line.position} aria-label={`Position of ${line.name}`} onChange={(e) => update(line._uid, { position: e.target.value })}>
                      {MEMBER_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>
                  <td data-label="Date joined" className={SUB_CELL}>
                    <input type="date" className={baseInputClasses} value={line.date_joined} max={localToday()} aria-label={`Date joined of ${line.name}`}
                      title={registered ? `Left blank, the date registered (${registered}) is used` : 'Left blank, today is used'}
                      onChange={(e) => update(line._uid, { date_joined: e.target.value })} />
                  </td>
                  <td className="px-2 py-2 text-center max-md:block max-md:px-0 max-md:text-right">
                    <button type="button" title="Remove member" onClick={() => onChange(lines.filter((l) => l._uid !== line._uid))}
                      className="inline-flex items-center gap-1.5 rounded-md p-1.5 text-rose-500 hover:bg-rose-50 max-md:min-h-[40px] max-md:px-3 max-md:text-[13px] max-md:font-medium">
                      <Trash2 size={13} aria-hidden="true" /> <span className="md:hidden">Remove</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lines.length > 0 && <p className="text-[12px] text-[#7A8E7A]">A blank date joined uses the date registered of the organization.</p>}

      {onImportFile && (
        <div className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-3">
          <p className="mb-1 text-[12px] font-semibold text-[#1A2B1A]">Import members from a file</p>
          <p className="mb-2 text-[12px] text-[#7A8E7A]">
            Attach the members file (RSBSA number, position, date joined). Once the organization is saved, the Import Members window opens with the file so you can check it before it is imported.
          </p>
          <ImportFileAttach chooseLabel="Import members" templateUrl={`/organizations/${type}/members/import/template/`}
            templateFilename={`${type}_organization_members_import_template.xlsx`} file={importFile} onFile={onImportFile} />
        </div>
      )}

      {showPicker && (
        <MembersPickerModal type={type} organizationId={organizationId} taken={lines.map((l) => l.person_id)} onAdd={addPicked} onClose={() => setShowPicker(false)} />
      )}
    </div>
  )
}
