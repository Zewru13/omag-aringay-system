// The User Manual as one printable document (Print / Save as PDF): the intro, then the guides of one kind of account, each starting on a new page, with its
// annotated pictures and the table under each picture. buildManualHtml is pure (no screen, no network); printManual writes it into a hidden frame (never the
// app's own page, so no sidebar or buttons are printed) and prints once the images have loaded.

const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const screenHtml = (s, number, baseUrl) => `
      <figure class="screen${s.phone ? ' phone' : ''}">
        <figcaption><b>${esc(number)}. ${esc(s.title)}</b><br><span>${esc(s.purpose)}</span></figcaption>
        <img src="${esc(baseUrl + s.image)}" alt="${esc(s.title)}">
        <table>
          <thead><tr><th class="n">No.</th><th class="el">Element</th><th>What it does</th></tr></thead>
          <tbody>${s.legend.map((r) => `<tr><td class="n"><span class="tag">${r.n}</span></td><td class="el"><b>${esc(r.label)}</b></td><td>${esc(r.desc)}</td></tr>`).join('')}</tbody>
        </table>
      </figure>`

export function buildManualHtml({ audienceLabel, guides, intro, baseUrl = '', systemTitle = 'OMAg Aringay', printedOn = '' }) {
  const toc = guides.map((g, i) => `<li>${i + 1}. ${esc(g.title)}</li>`).join('')
  const about = intro ? `
  <section class="about">
    <h2>About this guide</h2>
    <p>${esc(intro.lead)}</p>
    <ol class="contents">${intro.contents.map((c) => `<li><b>${c.n}. ${esc(c.title)}</b>: ${esc(c.about)}</li>`).join('')}</ol>
    <h3>How to read the pictures</h3>
    <p>${esc(intro.howToRead)}</p>
    <h3>Notes on the pictures</h3>
    <ul>${intro.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
  </section>` : ''
  const body = guides.map((g, i) => `
    <section class="guide">
      <h2>${i + 1}. ${esc(g.title)}</h2>
      <p class="intro">${esc(g.intro)}</p>
      <ol class="steps">${g.steps.map((step) => `<li>${esc(step)}</li>`).join('')}</ol>
      ${g.screens.map((s, k) => screenHtml(s, `${i + 1}.${k + 1}`, baseUrl)).join('')}
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
  .about { page-break-after: always; }
  .about h3 { font-size: 14px; color: #1B4D2E; margin: 16px 0 4px; }
  .about p, .about li { margin: 0 0 4px; }
  .contents { padding-left: 18px; }
  .guide { page-break-before: always; }
  h2 { font-size: 17px; color: #1B4D2E; border-bottom: 2px solid #1B4D2E; padding-bottom: 4px; margin: 0 0 8px; }
  .intro { color: #475569; margin: 0 0 10px; }
  ol.steps { padding-left: 20px; margin: 0 0 12px; }
  ol.steps > li { margin: 0 0 5px; }
  .screen { margin: 0 0 14px; break-inside: avoid; }
  .screen figcaption { margin-bottom: 4px; }
  .screen figcaption span { color: #475569; }
  .screen img { width: 100%; border: 1px solid #cbd5e1; border-radius: 4px; display: block; }
  .screen.phone img { width: auto; max-height: 150mm; margin: 0 auto; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 11px; }
  th { text-align: left; border-bottom: 1px solid #cbd5e1; color: #475569; padding: 3px 4px; }
  td { border-bottom: 1px solid #e2e8f0; padding: 3px 4px; vertical-align: top; }
  .n { width: 30px; } .el { width: 130px; }
  .tag { display: inline-block; min-width: 16px; padding: 0 4px; border-radius: 3px; background: #F97316; color: #fff; font-weight: 700; text-align: center; }
</style></head>
<body>
  <div class="cover">
    <h1>${esc(systemTitle)}</h1>
    <p class="for">User Manual: ${esc(audienceLabel)}</p>
    <p class="meta">Office of the Municipal Agriculturist, Aringay, La Union${printedOn ? ` &middot; printed ${esc(printedOn)}` : ''}</p>
    <ol>${toc}</ol>
  </div>
  ${about}
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
