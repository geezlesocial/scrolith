import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyScrolithaClientError } from '../../src/utils/scrolithaErrors';

test('maps Copilot allowlist failures to a non-retryable controlled-beta message', () => {
  const result = classifyScrolithaClientError({
    response: { status: 403, data: { code: 'USER_NOT_IN_BETA_ALLOWLIST' } }
  });
  assert.equal(result.kind, 'allowlist_required');
  assert.equal(result.retryable, false);
});

test('maps Copilot consent failures to AI settings', () => {
  const result = classifyScrolithaClientError({
    response: { status: 403, data: { code: 'AI_CONSENT_REQUIRED' } }
  });
  assert.equal(result.kind, 'consent_required');
  assert.equal(result.retryable, false);
});

test('maps provider failure to a retryable response', () => {
  const result = classifyScrolithaClientError({
    response: { status: 503, data: { code: 'OLLAMA_UNAVAILABLE' } }
  });
  assert.equal(result.kind, 'provider_unavailable');
  assert.equal(result.retryable, true);
});
