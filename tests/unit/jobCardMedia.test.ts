import assert from 'node:assert/strict';
import test from 'node:test';
import { getJobCardMedia } from '../../src/utils/jobCardMedia';

test('selects job-owned image and never falls back to client avatar', () => {
  const media = getJobCardMedia({
    image: 'https://api.scrolith.com/uploads/profile.png',
    clientAvatar: 'https://api.scrolith.com/uploads/avatar.png',
    attachments: ['scrolith-job-attachment:{"url":"https://cdn.scrolith.com/job.jpg","type":"image","width":1600,"height":900}']
  });

  assert.equal(media?.type, 'image');
  assert.equal(media?.url, 'https://cdn.scrolith.com/job.jpg');
});

test('selects one best video and preserves its thumbnail', () => {
  const media = getJobCardMedia({
    videos: [{ url: 'https://cdn.scrolith.com/job.mp4', type: 'video', thumbnailUrl: 'https://cdn.scrolith.com/job.jpg', width: 1920, height: 1080 }],
    clientAvatar: 'https://cdn.scrolith.com/avatar.jpg'
  });

  assert.deepEqual(media && { type: media.type, url: media.url, thumbnailUrl: media.thumbnailUrl }, {
    type: 'video',
    url: 'https://cdn.scrolith.com/job.mp4',
    thumbnailUrl: 'https://cdn.scrolith.com/job.jpg'
  });
});

test('returns null for a text-only job', () => {
  assert.equal(getJobCardMedia({ title: 'Text-only job', clientAvatar: 'https://cdn.scrolith.com/avatar.jpg' }), null);
});
