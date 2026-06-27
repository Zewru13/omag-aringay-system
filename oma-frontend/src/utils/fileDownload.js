/**
 * Downloads a file from the given URL using the provided axios instance.
 * Reads the filename from Content-Disposition if present, otherwise uses fallbackFilename.
 * Throws on network/server errors so the caller can show a message.
 */
export async function downloadFile(axiosInstance, url, fallbackFilename) {
  const response = await axiosInstance.get(url, { responseType: 'blob' })

  const disposition = response.headers['content-disposition']
  let filename = fallbackFilename
  if (disposition) {
    const match = disposition.match(/filename="?([^";\n]+)"?/i)
    if (match?.[1]) {
      filename = match[1].trim()
    }
  }

  const objectUrl = window.URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = objectUrl
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => window.URL.revokeObjectURL(objectUrl), 150)
}
