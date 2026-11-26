import { test } from 'node:test'
import assert from 'node:assert/strict'
import { userColumns } from '../src/pages/Users/userTabs.js'

const keys = (tab) => userColumns(tab).map((c) => c.key)

test('only the staff table has a status column', () => {
  assert.deepEqual(keys('staff'), ['name_cell', 'email', 'role_pill', 'status_pill', 'actions'])
  for (const tab of ['fisherfolk', 'farmers', 'organizations']) {
    assert.deepEqual(keys(tab), ['name_cell', 'email', 'role_pill', 'actions'], tab)
  }
})
