import test from 'node:test';
import assert from 'node:assert/strict';
import { getScrolithaMessageSecurityStatus } from '../scrolitha.publicProfile';

test('encryption audit finds transport-only (not E2EE)', () => {
  const status = getScrolithaMessageSecurityStatus();
  assert.equal(status.e2eeImplemented, false);
  assert.equal(status.e2eeVerified, false);
  assert.equal(status.e2eeAvailable, false);
  assert.equal(status.verification.supported, false);
  assert.equal(status.verification.safetyNumber, null);
  assert.equal(status.auditFinding, 'B_TRANSPORT_AND_STORAGE_ONLY');
  assert.equal(status.scrolithaSpecific.serverReadsPlaintext, true);
  assert.equal(status.scrolithaSpecific.aiOrchestrationReadsPlaintext, true);
  assert.ok(String(status.transport.protocol).includes('TLS') || String(status.transport.protocol).includes('HTTPS'));
});

test('security guidance is non-empty and honest', () => {
  const status = getScrolithaMessageSecurityStatus();
  assert.ok(Array.isArray(status.userGuidance) && status.userGuidance.length >= 1);
  assert.ok(status.verification.message.toLowerCase().includes('unavailable'));
});
