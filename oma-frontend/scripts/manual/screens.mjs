// All the screens of the User Manual, assembled from parts/*.mjs (a later part with the same id replaces an earlier one).
import { STAFF1 } from './parts/staff1.mjs'
import { STAFF1B } from './parts/staff1b.mjs'
import { STAFF2 } from './parts/staff2.mjs'
import { STAFF3 } from './parts/staff3.mjs'
import { STAFF4 } from './parts/staff4.mjs'
import { STAFF5 } from './parts/staff5.mjs'
import { CITIZEN } from './parts/citizen.mjs'
import { PHONE } from './parts/phone.mjs'

const parts = [STAFF1, STAFF1B, STAFF2, STAFF3, STAFF4, STAFF5, CITIZEN, PHONE]
const byId = new Map()
for (const part of parts) for (const screen of part) byId.set(screen.id, screen)
export const SCREENS = [...byId.values()]
