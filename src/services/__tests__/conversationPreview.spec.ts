import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatConversationPreview,
  getConversationPreviewText,
  getMessagePreviewText,
  MESSAGE_PREVIEW_DEFAULTS,
  normalizePreviewWhitespace
} from '../conversationPreview';

test('normalizePreviewWhitespace collapses and truncates safely', () => {
  assert.equal(normalizePreviewWhitespace('  a \n\n b  '), 'a b');
  const long = 'x'.repeat(200);
  const out = normalizePreviewWhitespace(long, 20);
  assert.ok(out.endsWith('…'));
  assert.ok(out.length <= 21);
});

test('media-only conversation does not show empty', () => {
  const convo = {
    lastMessage: '',
    last_message: '',
    messages: [
      {
        id: 'm1',
        text: '',
        attachments: [{ type: 'image', mimeType: 'image/png', name: 'a.png' }]
      }
    ]
  };
  const text = getConversationPreviewText(convo);
  assert.equal(text, MESSAGE_PREVIEW_DEFAULTS.image);
  assert.notEqual(text, MESSAGE_PREVIEW_DEFAULTS.empty);
});

test('stored preview used when messages array empty but last_message set', () => {
  const text = getConversationPreviewText({
    lastMessage: 'Image',
    last_message: 'Image',
    messages: []
  });
  assert.equal(text, 'Image');
});

test('truly empty conversation shows No messages', () => {
  const text = getConversationPreviewText({ lastMessage: '', messages: [] });
  assert.equal(text, MESSAGE_PREVIEW_DEFAULTS.empty);
});

test('caption beats attachment label', () => {
  const preview = formatConversationPreview({
    message: {
      text: 'Look at this',
      attachments: [{ type: 'image', mimeType: 'image/jpeg' }]
    }
  });
  assert.equal(preview.text, 'Look at this');
  assert.equal(preview.kind, 'text');
});

test('pdf and video mapping', () => {
  assert.equal(
    getMessagePreviewText({
      text: '',
      attachments: [{ mimeType: 'application/pdf', name: 'c.pdf' }]
    }),
    MESSAGE_PREVIEW_DEFAULTS.pdf
  );
  assert.equal(
    getMessagePreviewText({
      text: '',
      attachments: [{ type: 'video', mimeType: 'video/mp4' }]
    }),
    MESSAGE_PREVIEW_DEFAULTS.video
  );
});

test('deleted message label', () => {
  assert.equal(
    getMessagePreviewText({ text: '', isDeleted: true, attachments: [{ type: 'image' }] }),
    MESSAGE_PREVIEW_DEFAULTS.deleted
  );
});

test('voice note by message type', () => {
  assert.equal(
    getMessagePreviewText({ text: '', messageType: 'voice_note' }),
    MESSAGE_PREVIEW_DEFAULTS.voice
  );
});
