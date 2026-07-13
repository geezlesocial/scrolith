import test from 'node:test';
import assert from 'node:assert/strict';

// node:test does not inject Vite's import.meta.env; polyfill before loading app utils.
// Must assign real properties on import.meta.env so static reads in apiBase work.
const ensureViteEnv = () => {
  const meta = import.meta as ImportMeta & { env?: Record<string, unknown> };
  if (!meta.env || typeof meta.env !== 'object') {
    try {
      Object.defineProperty(meta, 'env', {
        value: {},
        writable: true,
        configurable: true,
        enumerable: true
      });
    } catch {
      (meta as any).env = {};
    }
  }
  Object.assign(meta.env as Record<string, unknown>, {
    PROD: false,
    DEV: true,
    MODE: 'test',
    BASE_URL: '/',
    VITE_ALLOW_LOCAL_API_IN_PROD: 'false',
    VITE_API_URL: 'https://api.scrolith.com/api',
    VITE_API_BASE_URL: 'https://api.scrolith.com/api',
    VITE_BACKEND_URL: 'https://api.scrolith.com',
    VITE_FORCE_MOBILE_API_OVERRIDE: 'false',
    VITE_PUBLIC_APP_DOMAIN: 'scrolith.com'
  });
};

ensureViteEnv();

const loadMediaUtils = async () => {
  ensureViteEnv();
  const [
    { resolveInlineMedia },
    postAttachment,
    { resolveUserAvatarUrl },
    feedPagination,
    { resolveAssetUrl, resolveResponsiveAssetUrl },
    continuousFeed
  ] = await Promise.all([
    import('../../src/utils/inlineMedia.ts'),
    import('../../src/utils/postAttachmentMedia.ts'),
    import('../../src/utils/userAvatar.ts'),
    import('../../src/utils/feedPagination.ts'),
    import('../../src/utils/assetUrl.ts'),
    import('../../src/utils/continuousFeed.ts')
  ]);
  return {
    resolveInlineMedia,
    resolvePostAttachmentMediaUrl: postAttachment.resolvePostAttachmentMediaUrl,
    resolvePostAttachmentPosterUrl: postAttachment.resolvePostAttachmentPosterUrl,
    resolveUserAvatarUrl,
    resolveAssetUrl,
    resolveResponsiveAssetUrl,
    ...feedPagination,
    ...continuousFeed
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
  const diskResolved = resolvePostAttachmentMediaUrl({ fileId: 'disk:avatars/user1.jpg' });
  assert.ok(diskResolved.includes('/api/files/content/'));
  assert.ok(diskResolved.includes('disk'));
  // Relative content paths should become absolute API-hosted URLs
  const relative = resolvePostAttachmentMediaUrl({ url: '/api/files/content/file_abc123456789' });
  assert.ok(relative.includes('api.scrolith.com') || relative.includes('/api/files/content/file_abc123456789'));
  const scrolithHost = resolvePostAttachmentMediaUrl({
    url: 'https://scrolith.com/api/files/content/file_abc123456789'
  });
  assert.ok(scrolithHost.includes('api.scrolith.com'));
  assert.ok(!scrolithHost.startsWith('https://scrolith.com/api/files'));
});

test('resolveAssetUrl never rewrites canonical API content or signed URLs', async () => {
  const { resolveAssetUrl, resolveResponsiveAssetUrl } = await loadMediaUtils();
  const apiContent = 'https://api.scrolith.com/api/files/content/file_abc123456789';
  assert.equal(resolveAssetUrl(apiContent), apiContent);

  const signedGcs =
    'https://storage.googleapis.com/bucket/key.jpg?X-Goog-Algorithm=GOOG4&X-Goog-Signature=abc123&X-Goog-Credential=x';
  assert.equal(resolveAssetUrl(signedGcs), signedGcs);
  assert.equal(resolveResponsiveAssetUrl(signedGcs, { width: 200, height: 200 }), signedGcs);

  const externalCdn = 'https://cdn.example.com/media/photo.jpg';
  assert.equal(resolveAssetUrl(externalCdn), externalCdn);

  // SPA host asset paths must still be rewritten off the frontend shell.
  const spaHost = resolveAssetUrl('https://scrolith.com/api/files/content/file_abc123456789');
  assert.ok(spaHost.includes('api.scrolith.com'));
  assert.ok(!spaHost.startsWith('https://scrolith.com/api/files'));
});

test('resolvePostAttachmentMediaUrl prefers valid absolute URL over fileId', async () => {
  const { resolvePostAttachmentMediaUrl } = await loadMediaUtils();
  const absolute = 'https://api.scrolith.com/api/files/content/real_file_id_123456';
  assert.equal(
    resolvePostAttachmentMediaUrl({
      url: absolute,
      fileId: 'some_other_id_should_not_win'
    }),
    absolute
  );
  // Absolute content URL passed as fileId must not be double-wrapped.
  assert.equal(resolvePostAttachmentMediaUrl({ fileId: absolute }), absolute);
  // Nested logo/cover shapes
  assert.equal(
    resolvePostAttachmentMediaUrl({ logo: { url: 'https://cdn.example.com/logo.png' } }),
    'https://cdn.example.com/logo.png'
  );
  assert.equal(
    resolvePostAttachmentMediaUrl({ cover: { fileId: 'cover_file_id_12345' } }).includes(
      '/api/files/content/cover_file_id_12345'
    ),
    true
  );
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

test('continuous feed keys dedupe by sourceType + sourceId across sources', async () => {
  const { buildFeedEntityKey, mergeContinuousFeedItems, extractHasMore, resolveFeedTerminalState, shouldHaltEmptyPageLoop, interleaveForDiversity } =
    await loadMediaUtils();

  assert.equal(buildFeedEntityKey('post', 'abc'), 'post:abc');
  assert.equal(buildFeedEntityKey('job', 'abc'), 'job:abc');

  const first = mergeContinuousFeedItems(
    [{ id: 'p1', type: 'post' }],
    [
      { id: 'p1', type: 'post' },
      { id: 'j1', type: 'job' },
      { id: 'p1', type: 'recommendation' }
    ]
  );
  // same plain id still blocked once; job is unique
  assert.equal(first.addedCount, 1);
  assert.equal(first.merged.length, 2);

  assert.equal(extractHasMore({ data: { hasMore: true } }), true);
  assert.equal(extractHasMore({ has_more: false }), false);
  assert.equal(extractHasMore({}), null);

  assert.equal(
    resolveFeedTerminalState({
      nextCursor: 'c1',
      uniqueAddedCount: 0
    }).canContinue,
    true
  );
  assert.equal(
    resolveFeedTerminalState({
      nextCursor: null,
      hasMoreFlag: false,
      uniqueAddedCount: 0,
      secondarySourcesRemaining: false
    }).isTerminal,
    true
  );
  assert.equal(
    resolveFeedTerminalState({
      nextCursor: null,
      uniqueAddedCount: 0,
      secondarySourcesRemaining: true
    }).canContinue,
    true
  );

  assert.equal(shouldHaltEmptyPageLoop(2, 2), true);
  assert.equal(shouldHaltEmptyPageLoop(1, 2), false);

  const interleaved = interleaveForDiversity(
    [
      { type: 'ad', authorId: 'a' },
      { type: 'ad', authorId: 'b' },
      { type: 'post', authorId: 'c' }
    ],
    { maxConsecutiveSameType: 1 }
  );
  assert.equal(interleaved.length, 3);
  // Should not keep two ads consecutive when a post is available
  assert.notEqual(interleaved[0].type === 'ad' && interleaved[1].type === 'ad', true);
});

test('media resolvers remain stable for continuous-feed attachment payloads', async () => {
  const { resolvePostAttachmentMediaUrl, resolveAssetUrl } = await loadMediaUtils();
  const content = 'https://api.scrolith.com/api/files/content/file_feed_media_123456';
  assert.equal(resolvePostAttachmentMediaUrl({ url: content, fileId: 'other_id_should_not_win' }), content);
  assert.equal(resolveAssetUrl(content), content);
  const signed =
    'https://storage.googleapis.com/bucket/key.jpg?X-Goog-Algorithm=GOOG4&X-Goog-Signature=abc';
  assert.equal(resolveAssetUrl(signed), signed);
});
