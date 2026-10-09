import assert from 'node:assert/strict'

const { MAX_PHOTOS, PHOTO_TYPES, PHOTO_MAX_BYTES, classifyPhotoFiles } = await import(new URL('../src/utils/photoRules.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const file = (name, type = 'image/png', size = 1000) => ({ name, type, size })

eq([MAX_PHOTOS, PHOTO_TYPES, PHOTO_MAX_BYTES], [10, ['image/jpeg', 'image/png', 'image/webp'], 5 * 1024 * 1024], 'constants')

const good = [file('a.png'), file('b.jpg', 'image/jpeg'), file('c.webp', 'image/webp')]
eq(classifyPhotoFiles(good, 10), { accepted: good, rejected: [], overflow: false }, 'valid files')
const gif = classifyPhotoFiles([file('x.gif', 'image/gif')], 10)
eq(gif, { accepted: [], rejected: ['x.gif: use a JPG, PNG or WEBP image.'], overflow: false }, 'gif rejected with the exact text')
const big = classifyPhotoFiles([file('big.png', 'image/png', 6 * 1024 * 1024)], 10)
eq(big.rejected, ['big.png: larger than 5 MB.'], 'oversized rejected with the exact text')
eq(classifyPhotoFiles([file('exact.png', 'image/png', 5 * 1024 * 1024)], 10).accepted.length, 1, 'exactly 5 MB is allowed')
const room = classifyPhotoFiles(good, 2)
eq([room.accepted.map((f) => f.name), room.overflow], [['a.png', 'b.jpg'], true], 'room limits the accepted files')
eq(classifyPhotoFiles(good, 0), { accepted: [], rejected: [], overflow: true }, 'no room at all')
eq(classifyPhotoFiles(good, 3).overflow, false, 'exactly enough room is not an overflow')
const mixed = classifyPhotoFiles([file('ok.png'), file('bad.gif', 'image/gif'), file('ok2.png')], 10)
eq([mixed.accepted.map((f) => f.name), mixed.rejected.length], [['ok.png', 'ok2.png'], 1], 'good files survive a bad one')
eq(classifyPhotoFiles([], 10), { accepted: [], rejected: [], overflow: false }, 'empty list')
eq(classifyPhotoFiles([file('notype', '')], 10).rejected.length, 1, 'a file with no type is rejected')
eq(classifyPhotoFiles(null, 10), { accepted: [], rejected: [], overflow: false }, 'null list')
eq(classifyPhotoFiles(good, -3).overflow, true, 'negative room counts as none')
console.log(`ALL ${n} CHECKS PASSED`)
