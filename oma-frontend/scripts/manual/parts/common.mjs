// Shared helpers of the User Manual's screen specs (see ../screens.mjs and ../shoot.mjs for how a spec is used).
//   id, audience (admin | focal | farmer | fisherfolk | org | all), role (the sample account), url, phone (390x844 instead of 1280x800), height (a taller desktop picture), file (under public/manual/)
//   js: runs in the page after it loads (open a window, a tab, a menu); wait / after: milliseconds to let it settle
//   callouts: [{ find: { text | css, tag?, exact?, nth?, last?, up? }, label, desc, pad?, tag?: 'left' }]  The numbers follow this order and are the legend's numbers.
//   title / purpose: the heading and the one line under it in the manual.
export const click = (text, tag = 'button') => `const b=[...document.querySelectorAll('${tag}')].find(x=>x.offsetParent&&x.textContent.trim()==='${text}'); if(b) b.click()`
export const clickIncl = (text, tag = 'button') => `const b=[...document.querySelectorAll('${tag}')].find(x=>x.offsetParent&&x.textContent.trim().includes(${JSON.stringify(text)})); if(b) b.click()`
export const wait = (ms) => `await new Promise(r=>setTimeout(r,${ms}))`
export const rowMenu = "const r=[...document.querySelectorAll('tbody tr')].filter(x=>x.offsetParent)[0]; const bs=[...r.querySelectorAll('button')]; bs[bs.length-1].click()"
export const rowMenuThen = (text, ms = 700) => `${rowMenu}; ${wait(ms)}; ${clickIncl(text)}`
// Opens the Filters row and chooses a "Group by" value (the list pages' Group by select).
export const groupBy = (value) => `const f=[...document.querySelectorAll('button')].find(x=>x.offsetParent&&x.textContent.trim().startsWith('Filters')); if(f) f.click(); await new Promise(r=>setTimeout(r,800)); const s=document.querySelector('select[aria-label="Group by"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(value)}); s.dispatchEvent(new Event('change',{bubbles:true}))`
export const expandMenu = "document.querySelectorAll('aside nav button, aside button').forEach(b=>{ if(!/Dashboard/.test(b.textContent)) b.click() })"

export const A = (o) => ({ role: 'ADMIN', audience: 'admin', ...o })
export const F = (o) => ({ role: 'EVALUATOR', audience: 'focal', ...o })
export const FA = (o) => ({ role: 'CITIZEN:FARMER', audience: 'farmer', ...o })
export const FI = (o) => ({ role: 'CITIZEN:FISHERFOLK', audience: 'fisherfolk', ...o })
export const O = (o) => ({ role: 'CITIZEN:FARMERS_ORG', audience: 'org', ...o })

// Finders used by most list pages
export const SIDEBAR = { css: 'aside' }
export const SEARCH = { css: 'input[type=search]' }
export const FILTERS = { text: 'Filters', tag: 'button', exact: true }
export const PRINT = { text: 'Print Report', tag: 'button', exact: true }
export const DOWNLOAD = { text: 'Download Report', tag: 'button', exact: true }
export const COLS = { css: 'thead' }
export const ROW1 = { css: 'tbody tr', nth: 0 }
export const PAGER = { text: 'Showing', tag: 'span, p, div', up: 1 }
export const ACTIONS1 = { css: 'tbody tr:first-child button[aria-label="Actions"], tbody tr:first-child td:last-child button', nth: 0 }
export const MENU_TOGGLE = { css: 'header button', nth: 0 }
export const BELL = { css: 'button[aria-label*="otification"]' }
export const ACCOUNT = { css: 'button[aria-label="Open account menu"]' }

// The same wording for the table footer and the row menu of the list pages
export const PAGER_ROW = { label: 'Page bar', desc: 'How many rows match, and Previous page / Next page buttons to move through them. The list shows a page at a time.' }
export const FILTERS_ROW = { find: FILTERS, label: 'Filters', desc: 'Opens or closes the filter row under the buttons. Each filter narrows the table, and Print Report / Download Report then give only what is shown.' }
export const PRINT_ROW = { find: PRINT, label: 'Print Report', desc: 'Opens a print preview of the table as filtered (the filters and search words are applied). Sent to the printer or saved as PDF from the browser.' }
export const DOWNLOAD_ROW = { find: DOWNLOAD, label: 'Download Report', desc: 'Saves the same report as a PDF file on your computer, with the filters and the search applied.' }
export const SEARCH_ROW = (what) => ({ find: SEARCH, label: 'Search box', desc: `Type to find ${what}. The table updates as you type.` })
export const PAGER_FIND = PAGER
