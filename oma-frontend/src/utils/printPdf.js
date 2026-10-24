// Print a report from the Reports page: the page fetches the same PDF that "Preview PDF" gives (so the printed report and the PDF
// always show the same title, period, logo, summary and table) and prints it from a hidden frame. The app's own screen is never
// printed. Nothing is changed on the server.

export const isPdfHead = (head) => String(head || '').startsWith('%PDF')

const FRAME_STYLE = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'

export async function printPdf(axiosInstance, url) {
  const response = await axiosInstance.get(url, { responseType: 'blob' })
  const head = response.data instanceof Blob ? await response.data.slice(0, 5).text() : ''
  if (!isPdfHead(head)) throw new Error('The report could not be generated.')
  const objectUrl = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))

  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = FRAME_STYLE
    const cleanup = () => {
      setTimeout(() => { frame.remove(); window.URL.revokeObjectURL(objectUrl) }, 1000)
    }
    frame.onload = () => {
      try {
        frame.contentWindow.focus()
        frame.contentWindow.print()
        // Where the browser cannot print the PDF from a frame, the report opens in its own tab instead of printing nothing.
        setTimeout(cleanup, 60000)
        resolve()
      } catch (err) {
        cleanup()
        const tab = window.open(objectUrl, '_blank')
        if (tab) resolve()
        else reject(err)
      }
    }
    frame.src = objectUrl
    document.body.appendChild(frame)
  })
}
