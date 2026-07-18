import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyMessagingMediaType,
  extractMessageAttachments,
  getAttachmentCacheKey,
  getAttachmentContentId,
  getMessageAttachmentIdentityKey,
  isOversizedPrivateBlobPreview,
  isPreviewableMessagingMedia,
  MAX_PRIVATE_MEDIA_BLOB_BYTES,
  normalizeMessageAttachment,
  parseContentDispositionFilename,
  prefersDirectRangeStreaming,
  canUseDirectMediaUrl,
  revokeAllAuthenticatedMediaUrls,
  revokeAuthenticatedMediaUrl,
  revokeMessageAttachmentMediaUrls,
  retainAuthenticatedMediaUrl,
  releaseAuthenticatedMediaUrl,
  getAuthenticatedMediaCacheDebugState,
  __testOnlySeedAuthenticatedMediaCache,
  sanitizeDownloadFilename,
  shouldAutoPreloadMessagingMedia
} from '../../src/services/messagingMedia';

test('classifyMessagingMediaType prefers MIME and known types', () => {
  assert.equal(classifyMessagingMediaType('image/png'), 'image');
  assert.equal(classifyMessagingMediaType('video/mp4'), 'video');
  assert.equal(classifyMessagingMediaType('audio/webm'), 'audio');
  assert.equal(classifyMessagingMediaType('voice_note'), 'voice_note');
  assert.equal(classifyMessagingMediaType('application/pdf'), 'document');
  assert.equal(classifyMessagingMediaType('photo.JPG'), 'image');
});

test('getMessageAttachmentIdentityKey is stable across object identity thrash', () => {
  const a = normalizeMessageAttachment({
    id: 'file_abc',
    name: 'shot.png',
    mimeType: 'image/png',
    url: 'https://cdn.example.com/old-or-storage.png'
  });
  const b = normalizeMessageAttachment({
    id: 'file_abc',
    name: 'shot.png',
    mimeType: 'image/png',
    // Different storage URL string must not change content identity when file id is present.
    url: 'https://storage.googleapis.com/bucket/other-path.png'
  });
  assert.ok(a && b);
  assert.equal(getMessageAttachmentIdentityKey(a), 'file_abc');
  assert.equal(getMessageAttachmentIdentityKey(b), 'file_abc');
  assert.equal(getMessageAttachmentIdentityKey(a), getMessageAttachmentIdentityKey(b));
});

test('normalizeMessageAttachment resolves file ids and content URLs', () => {
  const fromId = normalizeMessageAttachment({ id: 'file_123', name: 'a.png', mimeType: 'image/png' });
  assert.equal(fromId?.fileId, 'file_123');
  assert.equal(fromId?.type, 'image');
  assert.equal(fromId?.requiresAuthFetch, true);
  assert.equal(fromId?.canPreview, true);

  const fromUrl = normalizeMessageAttachment({
    url: '/api/files/content/file_abc',
    name: 'clip.mp4',
    type: 'video'
  });
  assert.equal(fromUrl?.fileId, 'file_abc');
  assert.equal(getAttachmentContentId(fromUrl), 'file_abc');
  assert.equal(getAttachmentCacheKey(fromUrl), 'file_abc');
});

test('normalizeMessageAttachment string file id becomes auth-backed attachment', () => {
  const attachment = normalizeMessageAttachment('file_private_9');
  assert.equal(attachment?.fileId, 'file_private_9');
  assert.equal(attachment?.requiresAuthFetch, true);
});

test('normalizeMessageAttachment supports attachmentId and fallbackUrl variants', () => {
  const a = normalizeMessageAttachment({
    attachmentId: 'att_99',
    fallbackUrl: 'https://cdn.example.com/public/photo.png',
    name: 'photo.png',
    mimeType: 'image/png'
  });
  assert.equal(a?.fileId, 'att_99');
  assert.equal(a?.type, 'image');

  const contentUrlOnly = normalizeMessageAttachment({
    contentUrl: '/api/files/content/file_content_1',
    filename: 'note.webm',
    mimeType: 'audio/webm'
  });
  assert.equal(contentUrlOnly?.fileId, 'file_content_1');
  assert.equal(contentUrlOnly?.type, 'audio');
});

test('normalizeMessageAttachment MIME-first over extension mismatch', () => {
  const a = normalizeMessageAttachment({
    id: 'f1',
    name: 'clip.bin',
    mimeType: 'video/mp4'
  });
  assert.equal(a?.type, 'video');
});

test('normalizeMessageAttachment skips storage-key-only payloads', () => {
  assert.equal(normalizeMessageAttachment({ path: 'uploads/media/abc/raw.bin' }), null);
  assert.equal(normalizeMessageAttachment({ path: 'gs://bucket/object' }), null);
});

test('normalizeMessageAttachment handles missing MIME via extension', () => {
  const a = normalizeMessageAttachment({ id: 'f2', name: 'report.pdf' });
  assert.equal(a?.type, 'document');
  assert.equal(a?.canPreview, false);
});

test('extractMessageAttachments includes voice note metadata', () => {
  const list = extractMessageAttachments({
    id: 'm1',
    text: '',
    messageType: 'voice_note',
    voiceNote: { fileId: 'vn_1', durationMs: 3200 },
    attachments: []
  });
  assert.equal(list.length, 1);
  assert.equal(list[0].type, 'voice_note');
  assert.equal(list[0].fileId, 'vn_1');
  assert.equal(list[0].durationMs, 3200);
});

test('extractMessageAttachments dedupes file ids', () => {
  const list = extractMessageAttachments({
    attachments: [
      { id: 'f1', name: 'a.png', mimeType: 'image/png' },
      { fileId: 'f1', name: 'a-dup.png', type: 'image' }
    ]
  });
  assert.equal(list.length, 1);
});

test('extractMessageAttachments historical metadata.voiceNote compatibility', () => {
  const list = extractMessageAttachments({
    id: 'm-hist',
    messageType: 'voice_note',
    metadata: { voiceNote: { file_id: 'vn_hist', duration_ms: 1500 } },
    attachments: []
  });
  assert.equal(list.length, 1);
  assert.equal(list[0].fileId, 'vn_hist');
  assert.equal(list[0].type, 'voice_note');
});

test('extractMessageAttachments multiple attachments preserve order and uniqueness', () => {
  const list = extractMessageAttachments({
    attachments: [
      { id: 'img1', mimeType: 'image/jpeg', name: 'a.jpg' },
      { id: 'doc1', mimeType: 'application/pdf', name: 'b.pdf' },
      { id: 'img1', mimeType: 'image/jpeg', name: 'a-dup.jpg' }
    ]
  });
  assert.equal(list.length, 2);
  assert.equal(list[0].fileId, 'img1');
  assert.equal(list[1].fileId, 'doc1');
});

test('preview and preload policy is conservative', () => {
  assert.equal(isPreviewableMessagingMedia('image'), true);
  assert.equal(isPreviewableMessagingMedia('document'), false);
  assert.equal(shouldAutoPreloadMessagingMedia('image'), true);
  assert.equal(shouldAutoPreloadMessagingMedia('video'), false);
  assert.equal(shouldAutoPreloadMessagingMedia('image', { saveData: true }), true);
  assert.equal(shouldAutoPreloadMessagingMedia('audio', { saveData: true }), false);
  assert.equal(
    shouldAutoPreloadMessagingMedia('audio', { size: MAX_PRIVATE_MEDIA_BLOB_BYTES + 1 }),
    false
  );
  assert.equal(shouldAutoPreloadMessagingMedia('voice_note', { size: 1024 }), true);
});

test('sanitizeDownloadFilename removes path characters', () => {
  const sanitized = sanitizeDownloadFilename('../../secret.pdf');
  assert.equal(sanitized.includes('/'), false);
  assert.equal(sanitized.includes('..'), false);
  assert.ok(sanitized.endsWith('secret.pdf'));
  assert.equal(sanitizeDownloadFilename(''), 'attachment');
  assert.equal(sanitizeDownloadFilename('my file (1).png'), 'my file (1).png');
  assert.equal(sanitizeDownloadFilename('a\\b\\c.exe').includes('\\'), false);
});

test('parseContentDispositionFilename supports quoted, unquoted, and filename*', () => {
  assert.equal(
    parseContentDispositionFilename('attachment; filename="report final.pdf"'),
    'report final.pdf'
  );
  assert.equal(parseContentDispositionFilename('attachment; filename=plain.txt'), 'plain.txt');
  assert.equal(
    parseContentDispositionFilename("attachment; filename*=UTF-8''%E2%82%AC%20rates.csv"),
    '€ rates.csv'
  );
  assert.equal(
    parseContentDispositionFilename('attachment; filename="../../evil.pdf"').includes('..'),
    false
  );
  assert.equal(parseContentDispositionFilename(''), '');
  assert.equal(parseContentDispositionFilename('inline'), '');
});

test('large private video preview limit flags oversized attachments', () => {
  const large = normalizeMessageAttachment({
    id: 'vid_big',
    mimeType: 'video/mp4',
    name: 'big.mp4',
    size: MAX_PRIVATE_MEDIA_BLOB_BYTES + 1
  });
  assert.equal(isOversizedPrivateBlobPreview(large!), true);

  const small = normalizeMessageAttachment({
    id: 'vid_small',
    mimeType: 'video/mp4',
    name: 'small.mp4',
    size: 1024
  });
  assert.equal(isOversizedPrivateBlobPreview(small!), false);

  const publicDirect = normalizeMessageAttachment({
    url: 'https://cdn.example.com/public.mp4',
    name: 'public.mp4',
    mimeType: 'video/mp4',
    size: MAX_PRIVATE_MEDIA_BLOB_BYTES + 10
  });
  // No fileId → requiresAuthFetch false → not treated as private blob preview.
  assert.equal(isOversizedPrivateBlobPreview(publicDirect!), false);
});

test('direct Range preference only when native URL needs no bearer', () => {
  const privateVideo = normalizeMessageAttachment({
    id: 'priv_v',
    mimeType: 'video/mp4',
    name: 'a.mp4',
    url: '/api/files/content/priv_v'
  });
  assert.equal(privateVideo?.requiresAuthFetch, true);
  assert.equal(canUseDirectMediaUrl(privateVideo!), false);
  assert.equal(prefersDirectRangeStreaming(privateVideo!), false);

  const publicVideo = normalizeMessageAttachment({
    url: 'https://cdn.example.com/clip.mp4',
    name: 'clip.mp4',
    mimeType: 'video/mp4'
  });
  assert.equal(canUseDirectMediaUrl(publicVideo!), true);
  assert.equal(prefersDirectRangeStreaming(publicVideo!), true);
});

test('reference-safe object URL lifecycle retains and releases without revoking live consumers', () => {
  revokeAllAuthenticatedMediaUrls();
  const revoked: string[] = [];
  const originalRevoke = URL.revokeObjectURL;
  // @ts-expect-error node may not define createObjectURL
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };

  try {
    __testOnlySeedAuthenticatedMediaCache('file_shared', 'blob:test-shared', 0);
    const first = retainAuthenticatedMediaUrl('file_shared');
    const second = retainAuthenticatedMediaUrl('file_shared');
    assert.equal(first, 'blob:test-shared');
    assert.equal(second, 'blob:test-shared');
    const stateAfterRetain = getAuthenticatedMediaCacheDebugState().find((e) => e.key === 'file_shared');
    assert.equal(stateAfterRetain?.refCount, 2);

    // One consumer unmounts — URL must remain while another holds it.
    releaseAuthenticatedMediaUrl('file_shared');
    assert.equal(
      getAuthenticatedMediaCacheDebugState().find((e) => e.key === 'file_shared')?.refCount,
      1
    );
    assert.equal(revoked.includes('blob:test-shared'), false);

    releaseAuthenticatedMediaUrl('file_shared');
    assert.equal(
      getAuthenticatedMediaCacheDebugState().find((e) => e.key === 'file_shared')?.refCount,
      0
    );
    // Zero-ref entries stay until prune/logout; not immediately revoked.
    assert.equal(revoked.includes('blob:test-shared'), false);

    // Logout clears all private blob URLs.
    revokeAllAuthenticatedMediaUrls();
    assert.deepEqual(getAuthenticatedMediaCacheDebugState(), []);
    assert.ok(revoked.includes('blob:test-shared'));

    // Idempotent second logout.
    revokeAllAuthenticatedMediaUrls();
  } finally {
    URL.revokeObjectURL = originalRevoke;
  }
});

test('unsend targeted cleanup revokes only affected attachment keys', () => {
  revokeAllAuthenticatedMediaUrls();
  const revoked: string[] = [];
  const originalRevoke = URL.revokeObjectURL;
  // @ts-expect-error node polyfill
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };
  try {
    __testOnlySeedAuthenticatedMediaCache('keep_file', 'blob:keep', 1);
    __testOnlySeedAuthenticatedMediaCache('gone_file', 'blob:gone', 1);
    revokeMessageAttachmentMediaUrls({
      attachments: [{ id: 'gone_file', mimeType: 'image/png', name: 'x.png' }]
    });
    assert.ok(revoked.includes('blob:gone'));
    assert.equal(revoked.includes('blob:keep'), false);
    assert.equal(getAuthenticatedMediaCacheDebugState().some((e) => e.key === 'keep_file'), true);
    assert.equal(getAuthenticatedMediaCacheDebugState().some((e) => e.key === 'gone_file'), false);
    revokeAllAuthenticatedMediaUrls();
  } finally {
    URL.revokeObjectURL = originalRevoke;
  }
});

test('download-only fallback condition for oversized private video', () => {
  const attachment = normalizeMessageAttachment({
    fileId: 'huge_vid',
    name: 'huge.mp4',
    mimeType: 'video/mp4',
    size: 80 * 1024 * 1024
  });
  assert.ok(attachment);
  assert.equal(attachment!.type, 'video');
  assert.equal(attachment!.requiresAuthFetch, true);
  assert.equal(isOversizedPrivateBlobPreview(attachment!), true);
  // Shared renderer must not auto-preload video regardless.
  assert.equal(shouldAutoPreloadMessagingMedia(attachment!.type), false);
});
