// Photo documentation per person, for the disaster forms that cover several farmers or fisherfolk in one submission. Each selected
// person has their own list of photos; it travels under their own field (photos_<id>) so the server saves it on that person's
// disaster record(s) only. Nothing is shared between people. Pure functions - no screen, no network.

export const photoField = (id) => `photos_${id}`

// photosByUser: { [person id]: [{ file, ... }] }
export const hasUserPhotos = (photosByUser) => Object.values(photosByUser || {}).some((list) => list && list.length > 0)

export function appendUserPhotos(form, photosByUser) {
  Object.entries(photosByUser || {}).forEach(([id, list]) => (list || []).forEach((p) => form.append(photoField(id), p.file, p.file.name)))
}

export const photoCountText = (count) => (count ? `${count} photo${count === 1 ? '' : 's'}` : 'No photos')

// The first photo problem the server named in an error body (photos_12: ["Photo 1: ..."]), else ''. `nameOf(id)` puts whose photos
// they are in front of it ("Ana Cruz: Photo 1: ..."), so a refused save says which person's photo to fix.
export function photoProblem(data, nameOf) {
  const key = Object.keys(data || {}).find((k) => (k === 'photos' || k.startsWith('photos_')) && Array.isArray(data[k]) && data[k].length)
  if (!key) return ''
  const owner = key.startsWith('photos_') && nameOf ? nameOf(key.slice('photos_'.length)) : ''
  return `${owner ? `${owner}: ` : ''}${data[key][0]}`
}
