// Shared styling for full-screen tabular bulk-entry pages (crop monitoring,
// fisheries stocking). Both used to hand-roll their own "cellInputClasses"
// inside a floating ModalShell — sized cramped (h-9, text-[12px], px-2) to
// squeeze into a max-w-6xl dialog. Now that each lives on its own full-width
// page there's no reason to keep them small or independently duplicated, so
// this is the one shared definition both pages import.

export const bulkCellInputClasses =
  'w-full h-10 px-2.5 border border-[#C8D5C8] rounded-md text-[13px] text-[#1A2B1A] bg-white placeholder-[#8AA08A] focus:outline-none focus:border-[#1B4D2E] focus:ring-2 focus:ring-[#1B4D2E]/20 transition-colors'

// Table header cell — larger and better-spaced than the old 10px all-caps
// label, still white-on-green to match the rest of the app's table headers.
export const bulkThClasses =
  'px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-white whitespace-nowrap'

export const bulkThCenterClasses =
  'px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-white whitespace-nowrap'

// Standard cell padding, applied uniformly across every column (including
// the "#", toggle, and remove-row columns) so spacing is consistent
// throughout the table, not just on the data-entry cells.
export const bulkTdClasses = 'px-3 py-3 align-top'

// Sub-field label used inside the expandable "More" row — unchanged in
// substance from the old modal, just centralized here alongside everything
// else these pages share.
export const bulkSubLabelClasses = 'mb-1.5 text-[12px] font-medium text-[#4A5E4A]'
