import { open } from './cdp.mjs'
const width = Number(process.argv[2] || 1440)
const c = await open({ tokensFile: 'role_tokens.json', width, height: 1000 })
const out = {}
await c.go('/fisheries-monitoring?tab=stocking', 5000)

// the real popup menu of the first rows
out.menus = await c.evaluate("const trs=[...document.querySelectorAll('tbody tr')].filter(r=>r.querySelector('[title=Actions]')); const res=[]; for (const r of trs.slice(0,3)) { r.querySelector('[title=Actions]').click(); await sleep(400); const m=[...document.body.children].filter(e=>e.style.position==='fixed'&&e.className.includes('shadow-lg')).pop(); res.push(m?[...m.querySelectorAll('button')].map(b=>b.textContent.trim()):null); document.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); await sleep(200) } return res")

// Activity Logs of the first row
await c.evaluate("const r=document.querySelector('tbody tr'); r.querySelector('[title=Actions]').click(); await sleep(400); const m=[...document.body.children].filter(e=>e.style.position==='fixed'&&e.className.includes('shadow-lg')).pop(); [...m.querySelectorAll('button')].find(b=>/Activity Logs/.test(b.textContent)).click(); await sleep(2500)")
out.logs = await c.evaluate("const m=document.querySelector('.modal-content'); if(!m) return 'no modal'; return { title: m.querySelector('h2').textContent, subtitle: m.querySelector('h2').nextElementSibling?.textContent, pills: [...m.querySelectorAll('button[aria-pressed]')].map(b=>b.textContent.trim()), rows: [...m.querySelectorAll('[data-testid=activity-log-row]')].map(r=>r.innerText.replace(/\\s+/g,' ').slice(0,150)), empty: !!m.querySelector('[data-testid=activity-logs-empty]') }")
await c.shot(`part1_logs_${width}.png`)
await c.evaluate("[...document.querySelectorAll('.modal-content button[aria-pressed]')].find(b=>/^Health Log/.test(b.textContent.trim())).click(); await sleep(400)")
out.healthOnly = await c.evaluate("return [...document.querySelectorAll('.modal-content [data-testid=activity-log-row]')].map(r=>r.innerText.replace(/\\s+/g,' ').slice(0,60))")
await c.evaluate("document.querySelector('.modal-content button[aria-label=Close]').click(); await sleep(500)")

// View Details
await c.evaluate("const r=document.querySelector('tbody tr'); r.querySelector('[title=Actions]').click(); await sleep(400); const m=[...document.body.children].filter(e=>e.style.position==='fixed'&&e.className.includes('shadow-lg')).pop(); [...m.querySelectorAll('button')].find(b=>/View Details/.test(b.textContent)).click(); await sleep(2500)")
out.details = await c.evaluate("const m=document.querySelector('.modal-content'); return [...m.querySelectorAll('span.text-\\\\[12px\\\\]')].map(e=>e.textContent.trim())")
await c.shot(`part1_details_${width}.png`)
out.errs = c.logs.slice(0, 3)
console.log(JSON.stringify(out, null, 1))
c.close()
