// A cooperative logging for its members who have no activated account: where the two multi-log windows get their lists in that
// case, and the words they use. No screen and no network. The server decides who appears (associations/member_logging.py).
export const MEMBER_CROPS_URL = '/production/monitoring/member-crops/'
export const MEMBER_CYCLES_URL = '/monitoring/aquaculture-cycles/member-cycles/'

// Short on purpose: a phone shows two lines under a window's title.
export const WHO_APPEARS = 'Only members without an activated account are listed.'

// Several members can have a cycle of the same name, so the member is part of the name wherever the window shows it.
export const asMemberCycles = (records) => (records || []).map((cycle) => ({ ...cycle, cycle_name: `${cycle.member_name}, ${cycle.cycle_name}` }))

// Why the window has nothing to tick. `memberCount` is how many members the cooperative may log for; `what` names what they lack.
export const nothingToLogText = (memberCount, what) => (memberCount === 0
  ? 'There is no member you can log for. Members with an activated account log their own activities.'
  : `None of your members without an activated account has ${what} right now.`)
