import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeScrolithaCard,
  buildConfirmationCard,
  buildWalletCard,
  buildCardsFromSuggestedActions,
  normalizeScrolithaCards
} from '../scrolitha.cards';
import {
  mintConfirmationToken,
  consumeConfirmationToken,
  hashConfirmationPayload
} from '../scrolitha.confirmationTokens';
import { listScrolithaTools, listScrolithaToolsByRiskClass } from '../scrolitha.tools';
import { formatFileUnderstandingContext, isSupportedUnderstandingMime } from '../scrolitha.fileUnderstanding';

test('normalizeScrolithaCard rejects invalid payloads', () => {
  assert.equal(normalizeScrolithaCard(null), null);
  assert.equal(normalizeScrolithaCard({ summary: 'no title' }), null);
});

test('normalizeScrolithaCard maps unknown types safely', () => {
  const card = normalizeScrolithaCard({
    type: 'future_widget',
    title: 'Hello',
    summary: 'World',
    entityId: 'e1'
  });
  assert.ok(card);
  assert.equal(card!.type, 'unknown');
  assert.equal(card!.version, 1);
  assert.equal(card!.title, 'Hello');
});

test('buildConfirmationCard includes confirm action with token', () => {
  const card = buildConfirmationCard({
    title: 'Publish post',
    summary: 'Will publish to your feed',
    actionId: 'ap_1',
    toolKey: 'CREATE_POST',
    confirmationToken: 'sct_test',
    reversible: false
  });
  assert.equal(card.type, 'confirmation');
  assert.ok(card.actions.some((a) => a.kind === 'confirm' && a.confirmationToken === 'sct_test'));
});

test('buildWalletCard exposes balance metadata', () => {
  const card = buildWalletCard({ balance: 12.5, currency: 'USD' });
  assert.equal(card.type, 'wallet');
  assert.equal(card.metadata.balance, 12.5);
});

test('buildCardsFromSuggestedActions produces confirmation cards', () => {
  const cards = buildCardsFromSuggestedActions(
    [
      {
        actionId: 'a1',
        actionKey: 'create_gig',
        toolKey: 'CREATE_GIG',
        summary: 'Create gig draft',
        requiresConfirmation: true
      }
    ],
    { confirmationTokens: { a1: 'sct_abc' } }
  );
  assert.equal(cards.length, 1);
  assert.equal(cards[0].type, 'confirmation');
});

test('normalizeScrolithaCards bounds length', () => {
  const cards = normalizeScrolithaCards(
    Array.from({ length: 20 }, (_, i) => ({ type: 'navigation', title: `T${i}`, summary: 's', deepLink: '/' })),
    5
  );
  assert.equal(cards.length, 5);
});

test('confirmation tokens are single-use and user-bound', () => {
  const { token } = mintConfirmationToken({
    userId: 'user-1',
    toolKey: 'CREATE_GIG',
    actionId: 'plan-1',
    payload: { title: 'x' }
  });
  assert.ok(token.startsWith('sct_'));

  const badUser = consumeConfirmationToken({
    token,
    userId: 'user-2',
    toolKey: 'CREATE_GIG',
    actionId: 'plan-1'
  });
  assert.equal(badUser.ok, false);

  const ok = consumeConfirmationToken({
    token,
    userId: 'user-1',
    toolKey: 'CREATE_GIG',
    actionId: 'plan-1'
  });
  assert.equal(ok.ok, true);

  const reused = consumeConfirmationToken({
    token,
    userId: 'user-1',
    toolKey: 'CREATE_GIG',
    actionId: 'plan-1'
  });
  assert.equal(reused.ok, false);
});

test('hashConfirmationPayload is stable for same object keys', () => {
  const a = hashConfirmationPayload({ b: 1, a: 2 });
  const b = hashConfirmationPayload({ a: 2, b: 1 });
  // Note: JSON.stringify key order follows Object.keys sort only if we sort keys — implementation sorts keys
  assert.equal(typeof a, 'string');
  assert.equal(a.length, 64);
  assert.equal(a, b);
});

test('tool inventory includes risk classes and messaging-safe reads', () => {
  const tools = listScrolithaTools();
  assert.ok(tools.length >= 20);
  const profile = tools.find((t) => t.key === 'GET_ME_PROFILE');
  assert.ok(profile);
  assert.equal(profile!.riskClass, 'read_only');
  assert.equal(profile!.messagingSafe, true);

  const admin = tools.find((t) => t.key === 'VIEW_SCROLITHA_AUDIT_LOGS' || t.scope === 'admin');
  assert.ok(admin);
  const groups = listScrolithaToolsByRiskClass();
  assert.ok(groups.read_only.length >= 5);
  assert.ok(groups.administrative.length >= 1);
});

test('file understanding MIME gate and context format', () => {
  assert.equal(isSupportedUnderstandingMime('application/pdf'), true);
  assert.equal(isSupportedUnderstandingMime('image/png'), true);
  assert.equal(isSupportedUnderstandingMime('application/x-msdownload'), false);

  const ctx = formatFileUnderstandingContext([
    {
      fileId: 'f1',
      name: 'resume.pdf',
      mimeType: 'application/pdf',
      size: 1000,
      kind: 'document',
      extractedText: null,
      note: 'Document attached'
    }
  ]);
  assert.ok(ctx.includes('UNTRUSTED_USER_ATTACHMENTS'));
  assert.ok(ctx.includes('resume.pdf'));
});
