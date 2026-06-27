import { Search } from 'lucide-react'

function SearchBar({ placeholder, value, onChange }) {
  return (
    <div className="relative w-full">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        size={16}
      />
      <input
        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#1E4620] focus:ring-2 focus:ring-[#1E4620]/20 md:text-sm"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </div>
  )
}

export default SearchBar
