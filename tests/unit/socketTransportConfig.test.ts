import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSocketOrigin, resolveSocketTransports } from '../../src/utils/socket'

test('keeps production transport behavior as polling first with websocket upgrade', () => {
  assert.deepEqual(resolveSocketTransports(), ['polling', 'websocket'])
})

test('supports an explicit websocket-only QA transport without enabling polling', () => {
  assert.deepEqual(resolveSocketTransports('websocket'), ['websocket'])
})

test('ignores unsupported transport values and falls back safely', () => {
  assert.deepEqual(resolveSocketTransports('sse,invalid'), ['polling', 'websocket'])
})

test('prefers the dedicated realtime origin over the REST origin', () => {
  assert.equal(
    resolveSocketOrigin(
      'https://realtime-qa.scrolith.com///',
      'https://api.scrolith.com'
    ),
    'https://realtime-qa.scrolith.com'
  )
})

test('falls back to the REST origin when no dedicated realtime origin is configured', () => {
  assert.equal(resolveSocketOrigin('', 'https://api.scrolith.com/'), 'https://api.scrolith.com')
})
