import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSocketTransports } from '../../src/utils/socket'

test('keeps production transport behavior as polling first with websocket upgrade', () => {
  assert.deepEqual(resolveSocketTransports(), ['polling', 'websocket'])
})

test('supports an explicit websocket-only QA transport without enabling polling', () => {
  assert.deepEqual(resolveSocketTransports('websocket'), ['websocket'])
})

test('ignores unsupported transport values and falls back safely', () => {
  assert.deepEqual(resolveSocketTransports('sse,invalid'), ['polling', 'websocket'])
})
