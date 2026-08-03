import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeJobAttachment, isSameJobAttachment, parseJobAttachment } from '../../src/utils/jobAttachments';
import type { UploadedFile } from '../../src/types';

const baseFile = {
  id: 'file-123',
  user_id: 'user-1',
  name: 'brief.mp4',
  type: 'video',
  size: 1024,
  url: 'https://cdn.scrolith.com/uploads/brief.mp4',
  category: 'portfolio',
  created_at: '2026-08-02T00:00:00.000Z'
} as UploadedFile;

test('encodes uploaded files without using the filename as a caption', () => {
  const encoded = encodeJobAttachment(baseFile);
  const parsed = parseJobAttachment(encoded);

  assert.equal(parsed.fileId, 'file-123');
  assert.equal(parsed.name, 'brief.mp4');
  assert.equal(parsed.kind, 'video');
  assert.equal(parsed.url, baseFile.url);
  assert.equal(encoded.includes('"caption"'), false);
});

test('infers PDF and image previews from legacy attachment URLs', () => {
  assert.equal(parseJobAttachment('https://cdn.scrolith.com/spec.pdf').kind, 'pdf');
  assert.equal(parseJobAttachment('https://cdn.scrolith.com/reference.JPG?token=redacted').kind, 'image');
});

test('deduplicates by file identity when metadata is present', () => {
  const first = encodeJobAttachment(baseFile);
  const second = encodeJobAttachment({ ...baseFile, name: 'renamed.mp4' });

  assert.equal(isSameJobAttachment(first, second), true);
});
