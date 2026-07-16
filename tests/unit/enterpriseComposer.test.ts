/**
 * Phase 5.1 — enterprise composer draft + attachment + publish-guard contracts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildComposerDraftKey,
  clearComposerDraft,
  isComposerDraftMeaningful,
  loadComposerDraft,
  saveComposerDraft
} from '../../src/components/composer/composerDraftStore.ts';
import {
  canPublishWithAttachments,
  COMPOSER_MAX_ATTACHMENTS,
  inferComposerMediaKind,
  validateComposerFile
} from '../../src/components/composer/composerAttachments.ts';
import { createPublishGuard } from '../../src/components/composer/composerPublishGuard.ts';
import {
  composerEntryCard,
  composerModalShell,
  composerPrimaryBtn
} from '../../src/components/composer/composerClasses.ts';

test('composer draft key is namespaced by user surface and identity', () => {
  const key = buildComposerDraftKey({
    userId: 'user-1',
    surface: 'member-home',
    identityId: 'page-9'
  });
  assert.match(key, /user-1/);
  assert.match(key, /member-home/);
  assert.match(key, /page-9/);
});

test('composer draft meaningfulness ignores empty drafts', () => {
  assert.equal(isComposerDraftMeaningful({ title: '', content: '  ' }), false);
  assert.equal(isComposerDraftMeaningful({ content: 'Hello network' }), true);
  assert.equal(isComposerDraftMeaningful({ topic: 'AI' }), true);
});

test('composer draft save/load/clear round-trip in sessionStorage when available', () => {
  if (typeof globalThis.sessionStorage === 'undefined') {
    // jsdom not available in node:test — exercise pure helpers only.
    assert.equal(isComposerDraftMeaningful({ content: 'x' }), true);
    return;
  }
  const key = buildComposerDraftKey({ userId: 'u', surface: 'member-home', identityId: 'user' });
  clearComposerDraft(key);
  assert.equal(loadComposerDraft(key), null);
  saveComposerDraft(key, { content: 'Draft body', visibility: 'public' });
  const loaded = loadComposerDraft(key);
  assert.ok(loaded);
  assert.equal(loaded?.content, 'Draft body');
  clearComposerDraft(key);
  assert.equal(loadComposerDraft(key), null);
});

test('attachment validation rejects empty and oversized images', () => {
  const empty = new File([], 'empty.png', { type: 'image/png' });
  const emptyResult = validateComposerFile(empty);
  assert.equal(emptyResult.ok, false);

  const big = new File([new Uint8Array(30 * 1024 * 1024)], 'big.png', { type: 'image/png' });
  const bigResult = validateComposerFile(big);
  assert.equal(bigResult.ok, false);

  const ok = new File([new Uint8Array(1024)], 'ok.png', { type: 'image/png' });
  const okResult = validateComposerFile(ok, { currentCount: 0 });
  assert.equal(okResult.ok, true);
  if (okResult.ok) assert.equal(okResult.kind, 'image');
});

test('attachment limit is enforced', () => {
  const file = new File([new Uint8Array(10)], 'a.png', { type: 'image/png' });
  const result = validateComposerFile(file, {
    currentCount: COMPOSER_MAX_ATTACHMENTS,
    maxAttachments: COMPOSER_MAX_ATTACHMENTS
  });
  assert.equal(result.ok, false);
});

test('inferComposerMediaKind classifies common types', () => {
  assert.equal(inferComposerMediaKind({ type: 'image/jpeg', name: 'a.jpg' }), 'image');
  assert.equal(inferComposerMediaKind({ type: 'video/mp4', name: 'a.mp4' }), 'video');
  assert.equal(inferComposerMediaKind({ type: 'application/pdf', name: 'a.pdf' }), 'document');
});

test('canPublishWithAttachments blocks uploading or errored media', () => {
  assert.equal(canPublishWithAttachments([{ uploading: true }]).ok, false);
  assert.equal(canPublishWithAttachments([{ error: 'fail' }]).ok, false);
  assert.equal(canPublishWithAttachments([{ id: 'f1' }]).ok, true);
  assert.equal(canPublishWithAttachments([{ id: undefined } as any]).ok, false);
});

test('publish guard is single-flight', () => {
  const guard = createPublishGuard();
  assert.equal(guard.tryBegin(), true);
  assert.equal(guard.tryBegin(), false);
  assert.equal(guard.isBusy(), true);
  guard.end();
  assert.equal(guard.tryBegin(), true);
  guard.end();
});

test('composer class contracts avoid layout-lift transforms', () => {
  assert.match(composerEntryCard, /rounded-2xl/);
  assert.equal(composerEntryCard.includes('-translate-y'), false);
  assert.match(composerModalShell, /max-w-3xl/);
  assert.match(composerPrimaryBtn, /rounded-full/);
});
