import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isRecentlyRestoredOnline,
  shouldAttemptRealtimeConnections
} from '../../src/mobile/runtime/networkRuntime';

test('shouldAttemptRealtimeConnections blocks offline runtimes', () => {
  assert.equal(
    shouldAttemptRealtimeConnections({
      isOnline: false,
      isNativePlatform: false,
      isAppActive: true
    }),
    false
  );
});

test('shouldAttemptRealtimeConnections requires active native app state', () => {
  assert.equal(
    shouldAttemptRealtimeConnections({
      isOnline: true,
      isNativePlatform: true,
      isAppActive: false
    }),
    false
  );
  assert.equal(
    shouldAttemptRealtimeConnections({
      isOnline: true,
      isNativePlatform: true,
      isAppActive: true
    }),
    true
  );
});

test('isRecentlyRestoredOnline only reports recent online recovery windows', () => {
  const now = 1_000_000;
  assert.equal(
    isRecentlyRestoredOnline({
      isOnline: true,
      lastOnlineAt: now - 2_000,
      now
    }),
    true
  );
  assert.equal(
    isRecentlyRestoredOnline({
      isOnline: true,
      lastOnlineAt: now - 20_000,
      now
    }),
    false
  );
});
