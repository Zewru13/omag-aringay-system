// The User Manual as one printable document (Print / Save as PDF): the guides of one kind of account, each starting on a new page, with its
// screenshots. buildManualHtml is pure (no screen, no network); printManual writes it into a hidden frame (never the app's own page, so no sidebar or
// buttons are printed) and prints once the images have loaded.

const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function buildManualHtml({ audienceLabel, guides, baseUrl = '', systemTitle = 'OMAg Aringay', printedOn = '' }) {
  const toc = guides.map((g, i) => `<li>${i + 1}. ${esc(g.title)}</li>`).join('')
  const body = guides.map((g, i) => `
    <section class="guide">
      <h2>${i + 1}. ${esc(g.title)}</h2>
      <p class="intro">${esc(g.intro)}</p>
      <ol>${g.steps.map((s) => `
        <li><p>${esc(s.text)}</p>${s.image ? `<figure><img src="${esc(baseUrl + s.image.file)}" alt="${esc(s.image.caption)}"><figcaption>${esc(s.image.caption)}</figcaption></figure>` : ''}</li>`).join('')}
      </ol>
    </section>`).join('')
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(systemTitle)} User Manual: ${esc(audienceLabel)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: #0f172a; font-size: 12px; line-height: 1.5; margin: 0; }
  .cover { text-align: center; padding: 80px 0 40px; page-break-after: always; }
  .cover h1 { font-size: 26px; margin: 0 0 6px; color: #1B4D2E; }
  .cover .for { font-size: 18px; margin: 0 0 24px; }
  .cover .meta { color: #64748b; font-size: 11px; }
  .cover ol { display: inline-block; text-align: left; margin-top: 28px; padding-left: 0; list-style: none; }
  .cover li { margin: 3px 0; }
  .guide { page-break-before: always; }
  .guide:first-of-type { page-break-before: auto; }
  h2 { font-size: 17px; color: #1B4D2E; border-bottom: 2px solid #1B4D2E; padding-bottom: 4px; margin: 0 0 8px; }
  .intro { color: #475569; margin: 0 0 12px; }
  ol { padding-left: 20px; margin: 0; }
  ol > li { margin: 0 0 12px; break-inside: avoid; }
  ol > li p { margin: 0 0 6px; }
  figure { margin: 6px 0 0; }
  img { width: 100%; border: 1px solid #cbd5e1; border-radius: 4px; }
  figcaption { font-size: 10px; color: #64748b; text-align: center; margin-top: 2px; }
</style></head>
<body>
  <div class="cover">
    <h1>${esc(systemTitle)}</h1>
    <p class="for">User Manual: ${esc(audienceLabel)}</p>
    <p class="meta">Office of the Municipal Agriculturist, Aringay, La Union${printedOn ? ` &middot; printed ${esc(printedOn)}` : ''}</p>
    <ol>${toc}</ol>
  </div>
  ${body}
</body></html>`
}

export function printManual(options) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
    document.body.appendChild(frame)
    const cleanup = () => setTimeout(() => frame.remove(), 1000)
    try {
      const doc = frame.contentWindow.document
      doc.open()
      doc.write(buildManualHtml({ ...options, baseUrl: window.location.origin }))
      doc.close()
      const loaded = Array.from(doc.images).map((img) => new Promise((done) => {
        if (img.complete) { done(); return }
        img.addEventListener('load', done, { once: true })
        img.addEventListener('error', done, { once: true })
      }))
      Promise.race([Promise.all(loaded), new Promise((done) => setTimeout(done, 20000))]).then(() => {
        try {
          frame.contentWindow.addEventListener('afterprint', cleanup, { once: true })
          frame.contentWindow.focus()
          frame.contentWindow.print()
          setTimeout(() => frame.remove(), 60000)
          resolve()
        } catch (err) { cleanup(); reject(err) }
      })
    } catch (err) {
      cleanup()
      reject(err)
    }
  })
}
