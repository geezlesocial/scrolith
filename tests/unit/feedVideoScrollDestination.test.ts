import test from 'node:test';
import assert from 'node:assert/strict';

const load = async () => import('../../src/utils/feedVideoScrollDestination.ts');

test('video-backed featured recommendations resolve to a Scroll viewer source', async () => {
  const { resolveVideoRecommendationScrollSource } = await load();
  const source = resolveVideoRecommendationScrollSource({
    kind: 'featured',
    key: 'FEATURED:post-1',
    data: {
      id: 'post-1',
      title: 'Featured launch video',
      media: {
        type: 'video',
        fileId: 'file-video-1',
        url: 'https://cdn.example.com/video.mp4',
        thumbnailUrl: 'https://cdn.example.com/poster.jpg'
      },
      author: { displayName: 'Ada', username: 'ada' }
    }
  } as any);

  assert.equal(source?.sourcePostId, 'post-1');
  assert.equal(source?.fileId, 'file-video-1');
  assert.equal(source?.mediaUrl, 'https://cdn.example.com/video.mp4');
  assert.equal(source?.thumbnailUrl, 'https://cdn.example.com/poster.jpg');
  assert.equal(source?.authorUsername, 'ada');
});

test('non-video featured recommendations do not get hijacked into Scroll', async () => {
  const { resolveVideoRecommendationScrollSource } = await load();
  const source = resolveVideoRecommendationScrollSource({
    kind: 'featured',
    data: {
      id: 'article-1',
      title: 'Featured article',
      media: { type: 'image', url: 'https://cdn.example.com/photo.jpg' }
    }
  } as any);

  assert.equal(source, null);
});
