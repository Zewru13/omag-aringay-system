// A parcel's declared crops come from the RSBSA form's own crop list, while
// monitoring records use the crop catalog, and the two spell some crops
// differently ("Bitter Gourd (Ampalaya)" vs "Ampalaya"). Comparing the full
// name plus the text before and inside the parentheses lines them up.
// (The backend applies the same rule: production/parcel_link.py.)
function cropKeys(name) {
  const n = String(name || '').toLowerCase().trim()
  const keys = new Set([n])
  const m = n.match(/^(.*?)\s*\((.*?)\)\s*$/)
  if (m) { keys.add(m[1].trim()); keys.add(m[2].trim()) }
  return keys
}

export function sameCrop(a, b) {
  const ka = cropKeys(a)
  for (const k of cropKeys(b)) if (ka.has(k)) return true
  return false
}

// The crop a parcel declares, by name ("Other" carries its own free text).
export const declaredCropName = (farmCrop) => (
  farmCrop.crop_name === 'Other' ? (farmCrop.crop_name_other || 'Other') : farmCrop.crop_name
)
