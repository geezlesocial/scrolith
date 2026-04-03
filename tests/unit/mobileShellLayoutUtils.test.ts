import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldUseMobileShellViewportFor } from '../../src/mobile/home/mobileShellLayoutUtils';

test('uses mobile shell for narrow phone-sized screens', () => {
  assert.equal(shouldUseMobileShellViewportFor(430, false, 1180), true);
});

test('keeps desktop shell for wide non-touch layouts', () => {
  assert.equal(shouldUseMobileShellViewportFor(1366, false, 1180), false);
});

test('treats coarse-touch tablets as mobile shell up to the tablet ceiling', () => {
  assert.equal(shouldUseMobileShellViewportFor(1180, true, 1180), true);
  assert.equal(shouldUseMobileShellViewportFor(1400, true, 1180), false);
});
