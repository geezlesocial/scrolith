import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPathFromAppUrl, normalizeAllowedHosts } from '../../src/mobile/runtime/deepLinkUtils';

test('extractPathFromAppUrl resolves https app links for allowed hosts', () => {
  const allowedHosts = normalizeAllowedHosts(['scrolith.com', 'www.scrolith.com']);
  assert.equal(
    extractPathFromAppUrl('https://scrolith.com/messages/room-1?focus=latest', allowedHosts),
    '/messages/room-1?focus=latest'
  );
});

test('extractPathFromAppUrl resolves the custom scheme format', () => {
  assert.equal(
    extractPathFromAppUrl('scrolith://freelancer/dashboard?tab=wallet', []),
    '/freelancer/dashboard?tab=wallet'
  );
});

test('extractPathFromAppUrl rejects untrusted hosts', () => {
  const allowedHosts = normalizeAllowedHosts(['scrolith.com']);
  assert.equal(
    extractPathFromAppUrl('https://evil.example.com/messages/room-1', allowedHosts),
    null
  );
});
