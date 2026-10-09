// Who has approved an organization's profile change request, and who is still needed.
// An organization's reviewed change needs one Admin AND one Focal Person (role EVALUATOR);
// farmer/fisherfolk requests and older rows need one approval (`requires_both` is false).

const ROLE_TITLES = { ADMIN: 'Admin', EVALUATOR: 'Focal Person' }

// One line per role for a two-approval request; [] for a single-approval one.
export const approvalLines = (request) => {
  if (!request?.requires_both) return []
  return [
    {
      role: 'Admin',
      done: Boolean(request.admin_approved_at),
      by: request.admin_approved_by_name || '',
      at: request.admin_approved_at || null,
    },
    {
      role: 'Focal Person',
      done: Boolean(request.focal_approved_at),
      by: request.focal_approved_by_name || '',
      at: request.focal_approved_at || null,
    },
  ]
}

export const waitingText = (request) => {
  const awaiting = (request?.requires_both ? request.awaiting || [] : []).filter((role) => ROLE_TITLES[role])
  if (awaiting.length === 0) return 'Pending review'
  return `Waiting for approval from the ${awaiting.map((role) => ROLE_TITLES[role]).join(' and the ')}`
}

// `role` is the account role: 'ADMIN' or 'EVALUATOR'.
export const hasApproved = (request, role) => {
  if (!request?.requires_both) return false
  if (role === 'ADMIN') return Boolean(request.admin_approved_at)
  if (role === 'EVALUATOR') return Boolean(request.focal_approved_at)
  return false
}
