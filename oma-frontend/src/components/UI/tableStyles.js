// The looks that tables and forms share, named once so that every page that draws its own table, label or filter box uses the same ones.

// A list table's header: dark green with white capitals (the shared DataTable; a page that writes its own <thead> uses these too).
export const TABLE_HEAD_ROW = 'bg-primary'
export const TABLE_HEAD_CELL = 'px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-wider text-white'

// The label above a form box (FormLabel in FormField.jsx draws it with its required mark).
export const FORM_LABEL = 'text-[13px] font-medium text-[#4A5E4A] mb-1.5 block'

// A dropdown in a filter bar.
export const FILTER_SELECT = 'h-[38px] rounded-lg border border-[#E2E8E2] bg-white px-3 text-[13px] text-[#1A2B1A] focus:border-[#1B4D2E] focus:outline-none focus:ring-2 focus:ring-[#1B4D2E]/10'
