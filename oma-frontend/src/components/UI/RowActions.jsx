import ActionsMenu from './ActionsMenu.jsx'

// Applies the action-count rule everywhere a table row offers actions:
//   - 2+ applicable actions (for the CURRENT user's role, on THIS row)
//     -> single ⋮ dropdown (ActionsMenu), grouped with dividers.
//   - exactly 1 applicable action -> a single plain inline icon button,
//     never wrapped in a dropdown just to hold one item.
// `actions` is an array of action descriptors (falsy entries are dropped,
// so callers can inline role/status conditionals):
//   { key, label, icon, onClick, tone, group, disabled } — `group` (any
//   value) starts a new group in the ⋮ menu; a divider is drawn between
//   groups. `disabled` greys the control out and blocks onClick (e.g. a
//   request already in flight) without removing it from the count — an
//   action that's temporarily unavailable is still a real action, unlike
//   one a caller omits outright via a falsy conditional.
const toneClasses = {
  default: 'text-slate-500 hover:bg-slate-100',
  amber: 'text-amber-600 hover:bg-amber-50',
  rose: 'text-rose-500 hover:bg-rose-50 hover:text-rose-600',
}

const menuToneClasses = {
  default: 'text-[#1A2B1A] hover:bg-[#F5F7F5]',
  amber: 'text-amber-600 hover:bg-amber-50',
  rose: 'text-[#1A2B1A] hover:bg-rose-50 hover:text-rose-600',
}

const labelledToneClasses = {
  default: 'border-[#C8D5C8] text-[#1B4D2E] hover:bg-[#F0F4F0]',
  amber: 'border-amber-200 text-amber-700 hover:bg-amber-50',
  rose: 'border-rose-200 text-rose-600 hover:bg-rose-50',
}

// Below `md` (where tables turn into cards) each action is a labelled button instead of an icon or a menu.
function PhoneActions({ visible, alwaysVisible = false }) {
  return (
    <div className={alwaysVisible ? 'flex flex-wrap gap-2 md:flex-col md:flex-nowrap md:gap-1.5' : 'flex flex-wrap gap-2 md:hidden'}>
      {visible.map((a) => (
        <button
          key={a.key}
          type="button"
          disabled={a.disabled}
          onClick={(e) => { e.stopPropagation(); if (!a.disabled) a.onClick() }}
          className={`inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap md:min-h-8 rounded-lg border bg-white px-3 text-[12px] font-semibold transition-colors ${
            a.disabled ? 'cursor-not-allowed border-[#E2E8E2] text-[#C8D5C8]' : (labelledToneClasses[a.tone] || labelledToneClasses.default)
          }`}
        >
          <a.icon size={14} aria-hidden="true" /> {a.label}
        </button>
      ))}
    </div>
  )
}

// `inline`: show every action as a labelled button at every width instead of the icon / ⋮ menu on larger screens.
// `alwaysMenu`: a ⋮ menu on larger screens even when only one action applies (so a column of rows looks the same).
function RowActions(props) {
  const visible = props.actions.filter(Boolean)
  if (visible.length === 0) return null
  if (props.inline) return <PhoneActions visible={visible} alwaysVisible />
  return (
    <>
      <PhoneActions visible={visible} />
      <div className="hidden md:block"><DesktopActions {...props} visible={visible} /></div>
    </>
  )
}

function DesktopActions({ visible, menuTitle = 'Actions', menuWidthClassName = 'w-52', alwaysMenu = false }) {
  if (visible.length <= 1 && !alwaysMenu) {
    return (
      <div className="flex items-center gap-0.5">
        {visible.map((a) => (
          <button
            key={a.key}
            type="button"
            title={a.label}
            disabled={a.disabled}
            onClick={(e) => { e.stopPropagation(); if (!a.disabled) a.onClick() }}
            className={`rounded-lg p-1.5 transition-colors ${a.disabled ? 'text-[#C8D5C8] cursor-not-allowed' : (toneClasses[a.tone] || toneClasses.default)}`}
          >
            <a.icon size={14} />
          </button>
        ))}
      </div>
    )
  }

  let lastGroup
  return (
    <ActionsMenu title={menuTitle} menuWidthClassName={menuWidthClassName}>
      {({ close }) => (
        <>
          {visible.map((a) => {
            const showDivider = a.group !== undefined && a.group !== lastGroup && lastGroup !== undefined
            lastGroup = a.group
            return (
              <div key={a.key}>
                {showDivider && <div className="my-1 border-t border-[#F0F4F0]" />}
                <button
                  type="button"
                  disabled={a.disabled}
                  onClick={(e) => { e.stopPropagation(); if (a.disabled) return; close(); a.onClick() }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-[13px] transition-colors ${
                    a.disabled ? 'text-[#C8D5C8] cursor-not-allowed' : (menuToneClasses[a.tone] || menuToneClasses.default)
                  }`}
                >
                  <a.icon size={13} /> {a.label}
                </button>
              </div>
            )
          })}
        </>
      )}
    </ActionsMenu>
  )
}

export default RowActions
