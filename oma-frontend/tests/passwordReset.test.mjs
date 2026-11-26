import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDeadLink, readResetLink, requestErrorText } from '../src/pages/Auth/passwordReset.js'
import { SYSTEM_TITLE, SYSTEM_TITLE_READABLE } from '../src/constants/appInfo.js'

test('the uid and token are read from the part after #', () => {
  assert.deepEqual(readResetLink('#uid=OTE&token=c1d-9af'), { uid: 'OTE', token: 'c1d-9af' })
})

test('a link missing either part is not usable', () => {
  for (const hash of ['', '#', '#uid=OTE', '#token=abc', undefined]) assert.equal(readResetLink(hash), null)
})

test('a refused request is explained in one sentence', () => {
  assert.match(requestErrorText({ response: { status: 429 } }), /Too many tries/)
  assert.equal(requestErrorText({ response: { status: 400, data: { new_password: ['Too short.', 'Too common.'] } } }), 'Too short. Too common.')
  assert.equal(requestErrorText({ response: { status: 400, data: { detail: 'Dead link.' } } }), 'Dead link.')
  assert.match(requestErrorText({}), /could not be reached/)
})

test('only an invalid or expired link sends the person back to ask for a new one', () => {
  assert.equal(isDeadLink({ response: { data: { code: 'invalid_link' } } }), true)
  assert.equal(isDeadLink({ response: { data: { new_password: ['x'] } } }), false)
})

test('the readable title and the printed title are the same words, spelled Aringay', () => {
  assert.equal(SYSTEM_TITLE_READABLE.toUpperCase(), SYSTEM_TITLE)
  assert.match(SYSTEM_TITLE, /OF ARINGAY, LA UNION$/)
})
