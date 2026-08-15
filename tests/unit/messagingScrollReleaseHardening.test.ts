import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');

test('messaging surfaces share the 4000 character contract', () => {
  const composer = read('src/components/messaging/SmartComposer.tsx');
  const inline = read('src/components/messaging/InlineMessageComposer.tsx');
  const messages = read('src/messages/Messages.tsx');
  const window = read('src/components/messaging/MessagingChatWindow.tsx');
  const policy = read('src/services/messagingComposer.ts');

  assert.match(policy, /MAX_MESSAGE_CHARACTERS\s*=\s*4000/);
  assert.match(composer, /maxLength=\{messageLengthLimit\}/);
  assert.match(composer, /slice\(0, messageLengthLimit\)/);
  assert.match(inline, /<SmartComposer/);
  assert.match(messages, /MAX_MESSAGE_CHARACTERS/);
  assert.match(window, /maxLength=\{MAX_MESSAGE_CHARACTERS\}/);
});

test('Scroll retries do not mutate signed URLs and retain attachment fallback', () => {
  const card = read('src/features/scroll/ScrollCard.tsx');
  const inline = read('src/utils/inlineMedia.ts');

  assert.match(card, /isSignedOrTokenizedUrl\(raw\)/);
  assert.match(card, /media\.fileId \? resolvePostAttachmentMediaUrl/);
  assert.match(inline, /fileId: pair\.fileId/);
  assert.match(card, /onLoadedData=\{\(\) => setMediaError\(false\)\}/);
});
