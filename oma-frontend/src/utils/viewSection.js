// What a View card says about the section it opens: "3 parcels", "1 machinery line", "None yet".
export function countText(count, noun) {
  const n = Number(count)
  if (!Number.isFinite(n) || n <= 0) return 'None yet'
  return `${n.toLocaleString('en-US')} ${noun}${n === 1 ? '' : 's'}`
}
