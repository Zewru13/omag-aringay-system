const TONE = {
  green:    { bg: '#E7F5EC', text: '#1E5637' },
  amber:    { bg: '#FBEED6', text: '#8A5207' },
  rose:     { bg: '#FBE3E0', text: '#8A1F16' },
  teal:     { bg: '#DCEEF0', text: '#1E4A4F' },
  slate:    { bg: '#F6F5F1', text: '#4A5A4C' },
  // legacy aliases kept for existing call sites during rollout
  blue:     { bg: '#DCEEF0', text: '#1E4A4F' },
  navy:     { bg: '#DCEEF0', text: '#1E4A4F' },
  marigold: { bg: '#FBEED6', text: '#8A5207' },
}

const STATUS_MAP = {
  PLANTED:     TONE.green,
  ACTIVE:      TONE.green,
  active:      TONE.green,
  planted:     TONE.green,
  FOR_HARVEST: TONE.amber,
  UPCOMING:    TONE.amber,
  for_harvest: TONE.amber,
  upcoming:    TONE.amber,
  HARVESTED:   TONE.teal,
  COMPLETED:   TONE.teal,
  harvested:   TONE.teal,
  completed:   TONE.teal,
  OVERDUE:     TONE.rose,
  overdue:     TONE.rose,
  // Scheduled distribution + confirmation lifecycle (interventions.models.DistributionStatus)
  PENDING:               TONE.slate,
  AWAITING_CONFIRMATION: TONE.amber,
  CONFIRMED:             TONE.green,
  NOT_RECEIVED:          TONE.rose,
  RESOLVED:              TONE.teal,
}

const STATUS_DEFAULT = TONE.slate

function StatusPill({ tone = 'slate', status, children }) {
  const colors = status !== undefined ? (STATUS_MAP[status] || STATUS_DEFAULT) : (TONE[tone] || TONE.slate)

  return (
    <span
      className="inline-flex items-center gap-[6px] px-[10px] py-[4px] rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      <span
        className="w-[6px] h-[6px] rounded-full flex-shrink-0"
        style={{ backgroundColor: colors.text }}
        aria-hidden="true"
      />
      {children}
    </span>
  )
}

export default StatusPill
