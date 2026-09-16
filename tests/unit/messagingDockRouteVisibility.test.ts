import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMessagingDockExcludedPath,
  shouldShowMessagingDock
} from '../../src/services/messagingSurfaces';

test('dock visible on home and standard platform routes', () => {
  for (const path of ['/', '/home', '/jobs', '/marketplace', '/communities', '/profile/u1', '/company/x', '/settings']) {
    assert.equal(shouldShowMessagingDock(path), true, path);
    assert.equal(isMessagingDockExcludedPath(path), false, path);
  }
});

test('dock hidden on /messages and nested conversation routes', () => {
  for (const path of [
    '/messages',
    '/messages/',
    '/messages/abc123',
    '/messages/abc123/',
    '/messages/abc123/media',
    '/messages/convo-id?tab=media',
    '/messages/convo#section'
  ]) {
    assert.equal(shouldShowMessagingDock(path), false, path);
    assert.equal(isMessagingDockExcludedPath(path), true, path);
  }
});

test('Phase 26B: dock hidden on follow-onboarding so sticky CTA is unobstructed', () => {
  for (const path of ['/auth/follow-onboarding', '/auth/follow-onboarding/', '/auth/follow-onboarding/done']) {
    assert.equal(shouldShowMessagingDock(path), false, path);
    assert.equal(isMessagingDockExcludedPath(path), true, path);
  }
});

test('dock hidden on creation surfaces so composer controls remain unobstructed', () => {
  for (const path of ['/post/create', '/create-job', '/create-gig', '/marketplace/create']) {
    assert.equal(shouldShowMessagingDock(path), false, path);
    assert.equal(isMessagingDockExcludedPath(path), true, path);
  }
});

test('substring false-positive routes are not excluded', () => {
  for (const path of [
    '/direct-messages',
    '/admin/messages',
    '/settings/messages',
    '/user-messages',
    '/messages-archive'
  ]) {
    assert.equal(isMessagingDockExcludedPath(path), false, path);
    assert.equal(shouldShowMessagingDock(path), true, path);
  }
});

test('query and hash alone do not keep dock on messaging routes', () => {
  assert.equal(isMessagingDockExcludedPath('/messages?foo=1'), true);
  assert.equal(isMessagingDockExcludedPath('/messages/#top'), true);
  assert.equal(isMessagingDockExcludedPath('/messages/xyz?tab=media#focus'), true);
});

test('empty and non-path inputs do not exclude dock', () => {
  assert.equal(isMessagingDockExcludedPath(''), false);
  assert.equal(isMessagingDockExcludedPath(null), false);
  assert.equal(isMessagingDockExcludedPath(undefined), false);
});
