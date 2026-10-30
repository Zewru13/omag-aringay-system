import { useRef, useState } from 'react'
import { Download, FileSpreadsheet, Trash2, Upload, X } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useSuggestSearch from '../../hooks/useSuggestSearch.js'
import { downloadFile } from '../../utils/fileDownload.js'
import { localToday } from '../../utils/inputGuards.js'
import { MEMBER_POSITIONS, addMemberLine } from './registrationMembers.js'

// The members of an organization, as lines on its registration form: pick registered farmers / fisherfolk from the registry, and/or attach a
// members file. The form owns the list (lines made by makeMemberLine, checked by memberLinesProblem, sent through memberPayload); the file is
// read once the organization is saved, in the same Import Members window as the organization's page. Nothing is saved from here.
const SUB_TH = 'px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#4A5E4A] whitespace-nowrap'
const SUB_CELL = 'px-2 py-2 align-top max-md:block max-md:w-full max-md:px-0 max-md:py-1 max-md:text-left max-md:before:mb-0.5 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]'

export default function MembersEditor({ type, lines, onChange, registered, importFile, onImportFile }) {
  const { showToast } = useToast()
  const nextUid = useRef(1)
  const fileRef = useRef(null)
  const [search, setSearch] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)
  const farmers = type === 'farmers'
  const noun = farmers ? 'farmer' : 'fisherfolk'

  const { results, isSearching, hasSearched, failed } = useSuggestSearch(
    search,
    (q) => api.get(farmers ? '/farmers/' : '/fisheries/fisherfolk/', { params: { search: q } })
      .then((r) => (Array.isArray(r.data) ? r.data : (r.data.results || []))),
  )

  const add = (person) => {
    if (lines.some((l) => l.person_id === person.id)) { showToast(`${person.full_name} is already in the list.`, 'error'); return }
    onChange(addMemberLine(lines, person, Date.now() + nextUid.current++))
    setSearch('')
  }
  const update = (uid, patch) => onChange(lines.map((l) => (l._uid === uid ? { ...l, ...patch } : l)))

  const downloadTemplate = async () => {
    setIsDownloading(true)
    try {
      await downloadFile(api, `/organizations/${type}/members/import/template/`, `${type}_organization_members_import_template.xlsx`)
    } catch {
      showToast('Failed to download the template.', 'error')
    } finally {
      setIsDownloading(false)
    }
  }

  const chooseFile = (event) => {
    const chosen = event.target.files?.[0] || null
    event.target.value = ''
    if (chosen) onImportFile(chosen)
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="member-search" className="mb-1 block text-[12px] font-medium text-[#4A5E4A]">Add a registered {noun}</label>
        <input
          id="member-search" className={baseInputClasses} placeholder="Name or RSBSA number..." autoComplete="off" value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (results[0]) add(results[0]) } }}
        />
        {results.length > 0 && (
          <div className={`mt-1 max-h-44 overflow-y-auto rounded-xl border border-[#E2E8E2] bg-white transition-opacity ${isSearching ? 'opacity-60' : ''}`}>
            {results.map((p) => (
              <button key={p.id} type="button" onClick={() => add(p)} className="w-full p-2 text-left text-[13px] hover:bg-[#F9FAF9]">
                <span className="font-medium text-[#1A2B1A]">{p.full_name}</span>
                <span className="ml-2 text-[#7A8E7A]">RSBSA No.: {p.rsbsa_number}</span>
              </button>
            ))}
          </div>
        )}
        {hasSearched && !failed && results.length === 0 && <p className="mt-1 text-[12px] text-[#7A8E7A]">No registered {noun} found. Register them first.</p>}
        {failed && <p className="mt-1 text-[12px] text-rose-600">Search failed. Please try again.</p>}
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

      <div className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-3">
        <p className="mb-1 text-[12px] font-semibold text-[#1A2B1A]">Import members from a file</p>
        <p className="mb-2 text-[12px] text-[#7A8E7A]">
          Attach the members file (RSBSA number, position, date joined). Once the organization is saved, the Import Members window opens with the file so you can check it before it is imported.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={chooseFile} />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#1B4D2E]/30 bg-[#EBF5EE]/50 px-3 text-[12px] font-semibold text-[#1B4D2E] hover:bg-[#EBF5EE]">
            <Upload size={13} aria-hidden="true" /> {importFile ? 'Change file' : 'Import members'}
          </button>
          <button type="button" onClick={downloadTemplate} disabled={isDownloading}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#D8E2D8] bg-white px-3 text-[12px] font-medium text-[#1B4D2E] hover:bg-[#F5F7F5] disabled:opacity-60">
            <Download size={13} aria-hidden="true" /> {isDownloading ? 'Downloading…' : 'Download template'}
          </button>
          {importFile && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] text-[#1A2B1A] ring-1 ring-[#E2E8E2]">
              <FileSpreadsheet size={13} className="text-[#1B4D2E]" aria-hidden="true" /> {importFile.name}
              <button type="button" aria-label="Remove the file" title="Remove the file" onClick={() => onImportFile(null)} className="text-rose-500 hover:text-rose-700"><X size={13} /></button>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
