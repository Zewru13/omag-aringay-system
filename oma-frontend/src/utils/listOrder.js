// Last in, first out: the newest row (the highest id) comes first, so a row just added is the first one of the table. The list given is
// not changed; a row with no id counts as the oldest. Used by the settings tables, which add a row in the table itself (InlineAddRow).
export const newestFirst = (rows) => [...rows].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))
