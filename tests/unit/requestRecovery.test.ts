import test from 'node:test';
import assert from 'node:assert/strict';
import {
  annotateRecoverableError,
  createOfflineRecoveryError,
  getRecoverableActionMessage,
  isOfflineLikeError,
  isRetryableWriteError,
  isTimeoutLikeError
} from '../../src/mobile/runtime/requestRecovery';

test('createOfflineRecoveryError marks offline and retryable metadata', () => {
  const error = createOfflineRecoveryError();
  assert.equal(error.code, 'OFFLINE');
  assert.equal(error.isOffline, true);
  assert.equal(error.retryable, true);
});

test('retryable write errors include network and 5xx responses', () => {
  assert.equal(isRetryableWriteError({ code: 'ERR_NETWORK', message: 'Network Error' }), true);
  assert.equal(isRetryableWriteError({ response: { status: 503 } }), true);
  assert.equal(isRetryableWriteError({ response: { status: 422 } }), false);
});

test('timeout-like errors are detected consistently', () => {
  assert.equal(isTimeoutLikeError({ code: 'ECONNABORTED' }), true);
  assert.equal(isTimeoutLikeError({ message: 'Request timeout of 10000ms exceeded' }), true);
  assert.equal(isTimeoutLikeError({ message: 'Other failure' }), false);
});

test('annotateRecoverableError preserves retryability metadata', () => {
  const error = annotateRecoverableError({ response: { status: 429 } });
  assert.equal(error.retryable, true);
  assert.equal(error.status, 429);
});

test('recoverable action messages explain offline recovery clearly', () => {
  const error = createOfflineRecoveryError();
  assert.match(getRecoverableActionMessage('Upload', error), /offline/i);
  assert.equal(isOfflineLikeError(error), true);
});
