import { Search } from 'lucide-react'

function SearchBar({ placeholder, value, onChange }) {
  return (
    <div className="relative flex-1">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A8BCA8]"
        size={16}
      />
      <input
        className="w-full h-[38px] pl-9 pr-3 border-0 bg-transparent text-[13px] text-[#1A2B1A] placeholder-[#A8BCA8] focus:outline-none"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </div>
  )
}

export default SearchBar
