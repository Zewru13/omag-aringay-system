import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accountTypeLabel, headerDateTime } from '../src/components/Layout/headerAccount.js'

test('under the name is the type of account', () => {
  const cases = [
    [{ role: 'ADMIN' }, 'Admin'],
    [{ role: 'EVALUATOR' }, 'Focal Person'],
    [{ role: 'CITIZEN', linked_record_type: 'FARMER' }, 'Farmer'],
    [{ role: 'CITIZEN', linked_record_type: 'FISHERFOLK' }, 'Fisherfolk'],
    [{ role: 'CITIZEN', linked_record_type: 'FARMERS_ORG' }, 'Farmers Organization'],
    [{ role: 'CITIZEN', linked_record_type: 'FISHERFOLK_ORG' }, 'Fisherfolk Organization'],
    [{ role: 'CITIZEN' }, 'Account'],
    [null, ''],
  ]
  for (const [user, label] of cases) assert.equal(accountTypeLabel(user), label, JSON.stringify(user))
})

test('the header shows the day, the date and the time', () => {
  assert.equal(headerDateTime(new Date('2026-11-26T15:20:00Z'), { timeZone: 'Asia/Manila' }), 'Thursday, Nov 26, 2026 · 11:20 PM')
})
