// The photo rules every multi-photo form shares; they mirror the backend (core/photos.py + validate_uploaded_image):
// at most 10 photos, each a JPG, PNG or WEBP of at most 5 MB. The server re-checks everything on submit.

export const MAX_PHOTOS = 10
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024

// Sort a batch of chosen files: the wrong type or too big ones are rejected with a readable text; of the acceptable
// ones only `room` (the free slots) are accepted, and `overflow` says some acceptable files did not fit.
export function classifyPhotoFiles(files, room) {
  const accepted = []
  const rejected = []
  for (const file of Array.from(files || [])) {
    if (!PHOTO_TYPES.includes(file.type)) { rejected.push(`${file.name}: use a JPG, PNG or WEBP image.`); continue }
    if (file.size > PHOTO_MAX_BYTES) { rejected.push(`${file.name}: larger than 5 MB.`); continue }
    accepted.push(file)
  }
  const free = Math.max(0, room)
  return { accepted: accepted.slice(0, free), rejected, overflow: accepted.length > free }
}
