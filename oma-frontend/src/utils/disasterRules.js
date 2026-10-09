// Total Loss means the whole recorded area is affected; the server rejects it otherwise. `maxArea` is the recorded
// planted or pond area in hectares (null when the record has none, in which case the server cannot enforce the rule
// and the form does not block it either). Compared with a small tolerance so 2 equals 2.00.
export const isWholeArea = (areaText, maxArea) => {
  if (maxArea === null || maxArea === undefined) return true
  if (areaText === '' || areaText === null || areaText === undefined) return false
  const area = parseFloat(areaText)
  return !Number.isNaN(area) && Math.abs(area - maxArea) < 0.00005
}
