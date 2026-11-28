// Saving a backup file where the Admin chooses. A browser only opens its Save As window at the moment of a click, so the place is
// asked for first and the file is written to it once the backup is ready. Browsers without that window (Firefox, Safari, phones,
// and some with it switched off) download the file the usual way.

// -> { kind: 'picked', handle } | { kind: 'download' } | { kind: 'cancelled' }
export async function askWhereToSave(name, win = globalThis.window) {
  if (!win?.showSaveFilePicker) return { kind: 'download' }
  try {
    const handle = await win.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Backup file', accept: { 'application/zip': ['.zip'] } }] })
    return { kind: 'picked', handle }
  } catch (error) {
    return error?.name === 'AbortError' ? { kind: 'cancelled' } : { kind: 'download' }
  }
}

// Writes the whole file to the chosen place. A file that cannot be finished is given up and the error is passed on.
export async function writeToHandle(handle, blob) {
  const writable = await handle.createWritable()
  try {
    await writable.write(blob)
    await writable.close()
  } catch (error) {
    try { await writable.abort() } catch { /* already closed or gone */ }
    throw error
  }
}
