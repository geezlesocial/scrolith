/**
 * Phase 29.3 — group UX pure helpers (node:test)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMultiTyperLabel,
  formatMultiRecorderLabel,
  resolveGroupComposerRestriction
} from '../groupMessagingUx.ts';

test('multi-typer labels', () => {
  assert.equal(formatMultiTyperLabel([{ userId: 'a', name: 'John' }], 'me'), 'John is typing…');
  assert.equal(
    formatMultiTyperLabel(
      [
        { userId: 'a', name: 'John' },
        { userId: 'b', name: 'Mary' }
      ],
      'me'
    ),
    'John and Mary are typing…'
  );
  assert.equal(
    formatMultiTyperLabel(
      [
        { userId: 'a', name: 'A' },
        { userId: 'b', name: 'B' },
        { userId: 'c', name: 'C' }
      ],
      'me'
    ),
    '3 people are typing…'
  );
  assert.equal(formatMultiTyperLabel([{ userId: 'me', name: 'Me' }], 'me'), null);
});

test('recording labels', () => {
  assert.equal(formatMultiRecorderLabel([{ userId: 'a', name: 'Sam' }], 'x'), 'Sam is recording…');
});

test('composer restriction DM safe', () => {
  assert.equal(
    resolveGroupComposerRestriction({ isGroup: false, messagingMode: 'LOCKED' }).blocked,
    false
  );
  assert.equal(
    resolveGroupComposerRestriction({ isGroup: true, messagingMode: 'LOCKED' }).blocked,
    true
  );
  assert.match(
    resolveGroupComposerRestriction({
      isGroup: true,
      messagingMode: 'ANNOUNCEMENT',
      canSend: false
    }).message,
    /admins/i
  );
  const hint = resolveGroupComposerRestriction({
    isGroup: true,
    messagingMode: 'EVERYONE',
    canSend: true,
    content: { allowImages: false }
  });
  assert.equal(hint.blocked, false);
  assert.match(hint.message, /Images/i);
});
