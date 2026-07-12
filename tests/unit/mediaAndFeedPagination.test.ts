import test from 'node:test';
import assert from 'node:assert/strict';

// node:test does not inject Vite's import.meta.env; polyfill before loading app utils.
const ensureViteEnv = () => {
  const meta = import.meta as ImportMeta & { env?: Record<string, unknown> };
  if (!meta.env || typeof meta.env !== 'object') {
    (meta as any).env = {};
  }
  Object.assign(meta.env as Record<string, unknown>, {
    PROD: false,
    DEV: true,
    MODE: 'test',
    BASE_URL: '/',
    VITE_ALLOW_LOCAL_API_IN_PROD: 'false',
    VITE_API_URL: 'https://api.scrolith.com/api',
    VITE_BACKEND_URL: 'https://api.scrolith.com',
    VITE_FORCE_MOBILE_API_OVERRIDE: 'false'
  });
};

ensureViteEnv();

const loadMediaUtils = async () => {
  ensureViteEnv();
  const [{ resolveInlineMedia }, postAttachment, { resolveUserAvatarUrl }, feedPagination] = await Promise.all([
    import('../../src/utils/inlineMedia.ts'),
    import('../../src/utils/postAttachmentMedia.ts'),
    import('../../src/utils/userAvatar.ts'),
    import('../../src/utils/feedPagination.ts')
  ]);
  return {
    resolveInlineMedia,
    resolvePostAttachmentMediaUrl: postAttachment.resolvePostAttachmentMediaUrl,
    resolvePostAttachmentPosterUrl: postAttachment.resolvePostAttachmentPosterUrl,
    resolveUserAvatarUrl,
    ...feedPagination
  };
};

test('resolvePostAttachmentMediaUrl keeps absolute HTTPS URLs', async () => {
  const { resolvePostAttachmentMediaUrl } = await loadMediaUtils();
  const url = 'https://cdn.example.com/media/photo.jpg';
  assert.equal(resolvePostAttachmentMediaUrl(url), url);
  assert.equal(resolvePostAttachmentMediaUrl({ url }), url);
});

test('resolvePostAttachmentMediaUrl does not double-normalize file content paths', async () => {
  const { resolvePostAttachmentMediaUrl } = await loadMediaUtils();
  const path = '/api/files/content/file_abc123456789';
  const resolved = resolvePostAttachmentMediaUrl(path);
  assert.ok(resolved.includes('/api/files/content/file_abc123456789'));
  assert.equal((resolved.match(/\/api\/files\/content\//g) || []).length, 1);
});

test('resolvePostAttachmentMediaUrl resolves nested file.url and asset/media objects', async () => {
  const { resolvePostAttachmentMediaUrl } = await loadMediaUtils();
  assert.equal(
    resolvePostAttachmentMediaUrl({ file: { url: 'https://cdn.example.com/nested.jpg' } }),
    'https://cdn.example.com/nested.jpg'
  );
  const assetResolved = resolvePostAttachmentMediaUrl({ asset: { path: '/uploads/a.png' } });
  assert.ok(assetResolved.includes('/uploads/a.png') || assetResolved.includes('uploads/a.png'));
  assert.equal(
    resolvePostAttachmentMediaUrl({ media: { url: 'https://cdn.example.com/m.mp4' } }),
    'https://cdn.example.com/m.mp4'
  );
});

test('resolvePostAttachmentMediaUrl resolves file IDs to content endpoint', async () => {
  const { resolvePostAttachmentMediaUrl } = await loadMediaUtils();
  const resolved = resolvePostAttachmentMediaUrl({ fileId: 'file_abc123456789' });
  assert.ok(resolved.includes('/api/files/content/file_abc123456789'));
});

test('resolvePostAttachmentMediaUrl returns empty for malformed/empty media', async () => {
  const { resolvePostAttachmentMediaUrl } = await loadMediaUtils();
  assert.equal(resolvePostAttachmentMediaUrl(null), '');
  assert.equal(resolvePostAttachmentMediaUrl(''), '');
  assert.equal(resolvePostAttachmentMediaUrl('Just a label'), '');
  assert.equal(resolvePostAttachmentMediaUrl({ name: 'no-media' }), '');
});

test('video source and poster resolve independently', async () => {
  const { resolvePostAttachmentMediaUrl, resolvePostAttachmentPosterUrl } = await loadMediaUtils();
  const attachment = {
    url: 'https://cdn.example.com/clip.mp4',
    thumbnailUrl: 'https://cdn.example.com/poster.jpg'
  };
  assert.equal(resolvePostAttachmentMediaUrl(attachment), 'https://cdn.example.com/clip.mp4');
  assert.equal(resolvePostAttachmentPosterUrl(attachment), 'https://cdn.example.com/poster.jpg');

  const nested = {
    file: { url: 'https://cdn.example.com/clip2.mp4' },
    poster: { url: 'https://cdn.example.com/poster2.jpg' }
  };
  assert.equal(resolvePostAttachmentMediaUrl(nested), 'https://cdn.example.com/clip2.mp4');
  assert.equal(resolvePostAttachmentPosterUrl(nested), 'https://cdn.example.com/poster2.jpg');

  const videoOnly = { videoUrl: 'https://cdn.example.com/only.mp4' };
  assert.equal(resolvePostAttachmentMediaUrl(videoOnly), 'https://cdn.example.com/only.mp4');
  assert.equal(resolvePostAttachmentPosterUrl(videoOnly), undefined);
});

test('resolveInlineMedia expands nested file/asset media and poster', async () => {
  const { resolveInlineMedia } = await loadMediaUtils();
  const resolved = resolveInlineMedia({
    type: 'video',
    file: { url: 'https://cdn.example.com/inline.mp4' },
    thumbnail: { url: 'https://cdn.example.com/inline-poster.jpg' }
  });
  assert.equal(resolved.kind, 'video');
  assert.equal(resolved.src, 'https://cdn.example.com/inline.mp4');
  assert.equal(resolved.poster, 'https://cdn.example.com/inline-poster.jpg');
});

test('resolveUserAvatarUrl prefers nested logo/avatar attachments and page logo fields', async () => {
  const { resolveUserAvatarUrl } = await loadMediaUtils();
  assert.equal(
    resolveUserAvatarUrl({ avatar: { url: 'https://cdn.example.com/avatar.png' } }),
    'https://cdn.example.com/avatar.png'
  );
  assert.equal(
    resolveUserAvatarUrl({ logo: { url: 'https://cdn.example.com/logo.png' } }),
    'https://cdn.example.com/logo.png'
  );
  assert.equal(
    resolveUserAvatarUrl({ logoUrl: 'https://cdn.example.com/logo2.png' }),
    'https://cdn.example.com/logo2.png'
  );
  assert.equal(resolveUserAvatarUrl(null), '');
  assert.equal(resolveUserAvatarUrl({ displayName: 'No media' }), '');
});

test('extractNextCursor and extractFeedItemList read nested feed contracts', async () => {
  const { extractNextCursor, extractFeedItemList } = await loadMediaUtils();
  assert.equal(extractNextCursor({ nextCursor: 'c1' }), 'c1');
  assert.equal(extractNextCursor({ data: { next_cursor: 'c2' } }), 'c2');
  assert.equal(extractNextCursor({ pagination: { nextCursor: 'c3' } }), 'c3');
  assert.equal(extractNextCursor({}), null);

  assert.deepEqual(extractFeedItemList({ items: [{ id: '1' }] }), [{ id: '1' }]);
  assert.deepEqual(extractFeedItemList({ data: { posts: [{ id: '2' }] } }), [{ id: '2' }]);
  assert.deepEqual(extractFeedItemList({ data: { data: { items: [{ id: '3' }] } } }), [{ id: '3' }]);
});

test('mergeUniqueFeedItems appends and ignores duplicates', async () => {
  const { mergeUniqueFeedItems } = await loadMediaUtils();
  const first = mergeUniqueFeedItems([], [{ id: 'a' }, { id: 'b' }]);
  assert.equal(first.addedCount, 2);
  assert.equal(first.merged.length, 2);

  const second = mergeUniqueFeedItems(first.merged, [{ id: 'b' }, { id: 'c' }]);
  assert.equal(second.addedCount, 1);
  assert.deepEqual(
    second.merged.map((item) => item.id),
    ['a', 'b', 'c']
  );
});

test('shouldContinueOffsetFallback only when full unique progress exists', async () => {
  const { shouldContinueOffsetFallback } = await loadMediaUtils();
  assert.equal(
    shouldContinueOffsetFallback({
      usedOffsetFallback: true,
      nextCursor: null,
      pageItemCount: 20,
      pageSize: 20,
      uniqueAddedCount: 5
    }),
    true
  );
  assert.equal(
    shouldContinueOffsetFallback({
      usedOffsetFallback: true,
      nextCursor: null,
      pageItemCount: 20,
      pageSize: 20,
      uniqueAddedCount: 0
    }),
    false
  );
  assert.equal(
    shouldContinueOffsetFallback({
      usedOffsetFallback: true,
      nextCursor: 'still-here',
      pageItemCount: 20,
      pageSize: 20,
      uniqueAddedCount: 5
    }),
    false
  );
  assert.equal(
    shouldContinueOffsetFallback({
      usedOffsetFallback: false,
      nextCursor: null,
      pageItemCount: 20,
      pageSize: 20,
      uniqueAddedCount: 5
    }),
    false
  );
});
