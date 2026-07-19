import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatLastMessagePreview,
  classifyAttachmentKind,
  resolveStoredLastMessageText,
  MESSAGE_PREVIEW_LABELS
} from '../lastMessagePreview';

test('text message wins over attachments', () => {
  const preview = formatLastMessagePreview({
    text: '  Hello   world  \n',
    attachments: [{ mimeType: 'image/png', type: 'image', name: 'a.png' }]
  });
  assert.equal(preview.text, 'Hello world');
  assert.equal(preview.kind, 'text');
});

test('image-only message preview', () => {
  const preview = formatLastMessagePreview({
    text: '',
    attachments: [{ mimeType: 'image/jpeg', type: 'image', name: 'shot.jpg' }]
  });
  assert.equal(preview.text, MESSAGE_PREVIEW_LABELS.image);
  assert.equal(preview.kind, 'image');
  assert.equal(preview.isDeleted, false);
});

test('video-only message preview', () => {
  const preview = formatLastMessagePreview({
    text: null,
    attachments: [{ mimeType: 'video/mp4', type: 'video' }]
  });
  assert.equal(preview.text, MESSAGE_PREVIEW_LABELS.video);
});

test('audio and voice previews', () => {
  assert.equal(
    formatLastMessagePreview({
      text: '',
      attachments: [{ mimeType: 'audio/mpeg', type: 'audio' }]
    }).text,
    MESSAGE_PREVIEW_LABELS.audio
  );
  assert.equal(
    formatLastMessagePreview({
      text: '',
      messageType: 'voice_note',
      voiceNote: { durationMs: 1200 }
    }).text,
    MESSAGE_PREVIEW_LABELS.voice
  );
});

test('pdf and document previews', () => {
  assert.equal(
    formatLastMessagePreview({
      text: '  ',
      attachments: [{ mimeType: 'application/pdf', name: 'r.pdf' }]
    }).text,
    MESSAGE_PREVIEW_LABELS.pdf
  );
  assert.equal(
    formatLastMessagePreview({
      text: '',
      attachments: [
        {
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          name: 'resume.docx'
        }
      ]
    }).text,
    MESSAGE_PREVIEW_LABELS.document
  );
});

test('multiple attachments use plural labels', () => {
  const preview = formatLastMessagePreview({
    text: '',
    attachments: [
      { mimeType: 'image/png', type: 'image' },
      { mimeType: 'image/jpeg', type: 'image' }
    ]
  });
  assert.equal(preview.text, '2 images');
  assert.equal(preview.attachmentCount, 2);
});

test('mixed attachments label as Attachments', () => {
  const preview = formatLastMessagePreview({
    text: '',
    attachments: [
      { mimeType: 'image/png', type: 'image' },
      { mimeType: 'video/mp4', type: 'video' }
    ]
  });
  assert.equal(preview.text, MESSAGE_PREVIEW_LABELS.attachments);
});

test('deleted message overrides attachment label', () => {
  const preview = formatLastMessagePreview({
    text: '',
    isDeleted: true,
    attachments: [{ mimeType: 'image/png', type: 'image' }]
  });
  assert.equal(preview.text, MESSAGE_PREVIEW_LABELS.deleted);
  assert.equal(preview.kind, 'deleted');
});

test('empty conversation uses empty kind', () => {
  const preview = formatLastMessagePreview(null);
  assert.equal(preview.kind, 'empty');
  assert.equal(preview.text, MESSAGE_PREVIEW_LABELS.empty);
});

test('attachment id-only messages fall back to file/generic', () => {
  const preview = formatLastMessagePreview({
    text: '',
    attachments: ['file_abc'],
    messageType: 'file'
  });
  assert.ok(preview.text.length > 0);
  assert.notEqual(preview.kind, 'empty');
});

test('stored preview used when message missing attachment detail', () => {
  const preview = formatLastMessagePreview(
    { text: '', attachments: [] },
    { fallbackStoredPreview: 'Image' }
  );
  assert.equal(preview.text, 'Image');
});

test('resolveStoredLastMessageText never null for media-only', () => {
  const stored = resolveStoredLastMessageText({
    text: '',
    attachments: [{ mimeType: 'image/webp', type: 'image' }]
  });
  assert.equal(stored, MESSAGE_PREVIEW_LABELS.image);
});

test('classifyAttachmentKind covers common mime types', () => {
  assert.equal(classifyAttachmentKind({ mimeType: 'image/heic' }), 'image');
  assert.equal(classifyAttachmentKind({ mimeType: 'application/pdf' }), 'pdf');
  assert.equal(classifyAttachmentKind({ name: 'notes.txt', mimeType: 'text/plain' }), 'document');
});
