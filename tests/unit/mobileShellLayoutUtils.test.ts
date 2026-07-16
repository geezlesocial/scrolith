import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESKTOP_MEMBER_HOME_MIN_WIDTH,
  shouldUseMobileShellViewportFor
} from '../../src/mobile/home/mobileShellLayoutUtils';

test('uses mobile shell for narrow phone-sized screens', () => {
  assert.equal(shouldUseMobileShellViewportFor(430, false, 1024), true);
  assert.equal(shouldUseMobileShellViewportFor(390, true, DESKTOP_MEMBER_HOME_MIN_WIDTH), true);
});

test('keeps desktop shell for common laptop widths including 1366', () => {
  assert.equal(shouldUseMobileShellViewportFor(1366, false, 1024), false);
  assert.equal(shouldUseMobileShellViewportFor(1280, false, 1024), false);
  assert.equal(shouldUseMobileShellViewportFor(1440, false, 1024), false);
  assert.equal(shouldUseMobileShellViewportFor(1920, false, 1024), false);
});

test('does not force mobile shell on coarse-touch hybrid laptops at desktop widths', () => {
  // Regression: previous rule (coarse && width<=1366) blocked Member Home 3-col
  assert.equal(shouldUseMobileShellViewportFor(1180, true, 1024), false);
  assert.equal(shouldUseMobileShellViewportFor(1280, true, 1024), false);
  assert.equal(shouldUseMobileShellViewportFor(1366, true, 1024), false);
  assert.equal(shouldUseMobileShellViewportFor(1024, true, 1024), false);
});

test('still uses mobile shell below the desktop floor even with touch', () => {
  assert.equal(shouldUseMobileShellViewportFor(1023, true, 1024), true);
  assert.equal(shouldUseMobileShellViewportFor(900, true, 1024), true);
  assert.equal(shouldUseMobileShellViewportFor(768, false, 1024), true);
});

test('desktop member home min width is aligned to Tailwind lg', () => {
  assert.equal(DESKTOP_MEMBER_HOME_MIN_WIDTH, 1024);
});
