import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Fish, Info, Search, ShieldCheck, Sprout, UserCheck, Users } from 'lucide-react'
import { flatTopics, searchTopics } from './helpTopics.js'

// The topic list of Help, on the right: Search help, then the topics under the kind of account they are for, in the menu's
// order. A group of the menu (Registration, Crop Management...) opens and closes. The list scrolls on its own.
const ICONS = { admin: ShieldCheck, focal: UserCheck, farmer: Sprout, fisherfolk: Fish, org: Users, system: Info }
const ROW = 'flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors'

function Topic({ topicKey, title, note, current, onPick, indent }) {
  const open = topicKey === current
  return (
    <button type="button" onClick={() => onPick(topicKey)} aria-current={open ? 'page' : undefined}
      className={`${ROW} ${indent ? 'pl-6' : ''} ${open ? 'bg-[#EBF5EE] font-semibold text-[#1B4D2E]' : 'text-[#1A2B1A] hover:bg-[#F5F7F5]'}`}>
      <span className="min-w-0">
        {title}
        {note && <span className="block text-[11px] font-normal text-[#7A8E7A]">{note}</span>}
      </span>
      <ChevronRight size={14} aria-hidden="true" className="flex-none text-[#A8BCA8]" />
    </button>
  )
}

export default function HelpTopicList({ groups, current, onPick }) {
  const [query, setQuery] = useState('')
  const all = useMemo(() => flatTopics(groups), [groups])
  const results = useMemo(() => searchTopics(groups, query), [groups, query])
  const searching = query.trim().length > 0
  // The menu groups the reader opened or closed. The one holding the open topic is open until it is closed.
  const [folders, setFolders] = useState({})
  const holder = all.find((t) => t.key === current)
  const isOpen = (id) => folders[id] ?? (holder?.folder && `${holder.group}.${holder.folder}` === id) ?? false

  return (
    <div>
      <div className="flex items-center gap-2 rounded-lg border border-[#D8E2D8] bg-[#FBFCFB] px-2.5 focus-within:border-[#1B4D2E] focus-within:ring-2 focus-within:ring-[#1B4D2E]/15">
        <Search size={15} aria-hidden="true" className="flex-none text-[#7A8E7A]" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search help" aria-label="Search help"
          className="h-10 min-w-0 flex-1 bg-transparent text-[13.5px] text-[#1A2B1A] outline-none placeholder:text-[#A8BCA8]" />
      </div>
      <p className="sr-only" role="status">{searching ? `${results.length} topic${results.length === 1 ? '' : 's'} found` : ''}</p>

      <nav aria-label="Help topics" className="mt-3 max-h-[60vh] overflow-y-auto pr-1 lg:max-h-[calc(100vh-230px)]">
        {searching ? (
          results.length === 0 ? (
            <p className="px-2.5 py-4 text-[13px] text-[#7A8E7A]">No topic matches &ldquo;{query.trim()}&rdquo;. Try a shorter word, such as the name of a page or button.</p>
          ) : results.map((hit) => {
            const found = all.find((t) => t.key === hit.key)
            return <Topic key={hit.key} topicKey={hit.key} title={found.title} note={groups.find((g) => g.id === found.group)?.label}
              current={current} onPick={(key) => onPick(key, hit.picture)} />
          })
        ) : groups.map((group) => {
          const Icon = ICONS[group.id] || Info
          return (
            <div key={group.id} className="mb-3">
              <p className="mb-1 flex items-center gap-2 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7A8E7A]">
                <Icon size={13} aria-hidden="true" /> {group.label}
              </p>
              {group.topics.map((entry) => {
                if (!entry.topics) return <Topic key={entry.id} topicKey={`${group.id}.${entry.id}`} title={entry.title} current={current} onPick={onPick} />
                const id = `${group.id}.${entry.id}`
                const open = isOpen(id)
                const Arrow = open ? ChevronDown : ChevronRight
                return (
                  <div key={entry.id}>
                    <button type="button" aria-expanded={open} onClick={() => setFolders((f) => ({ ...f, [id]: !open }))} className={`${ROW} text-[#1A2B1A] hover:bg-[#F5F7F5]`}>
                      <span className="min-w-0">{entry.title}</span>
                      <Arrow size={14} aria-hidden="true" className="flex-none text-[#A8BCA8]" />
                    </button>
                    {open && entry.topics.map((t) => <Topic key={t.id} topicKey={`${group.id}.${t.id}`} title={t.title} current={current} onPick={onPick} indent />)}
                  </div>
                )
              })}
            </div>
          )
        })}
      </nav>
    </div>
  )
}
