import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveGuestMarketplaceListingImage,
  resolveMediaUrl
} from '../../src/utils/guestMarketplaceMedia';

test('resolveMediaUrl: direct string URL', () => {
  assert.equal(resolveMediaUrl('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg');
});

test('resolveMediaUrl: relative path', () => {
  const result = resolveMediaUrl('/uploads/listing.jpg');
  assert.ok(result && result.includes('listing.jpg'));
  assert.notEqual(result, '[object Object]');
});

test('resolveMediaUrl: object with url', () => {
  const result = resolveMediaUrl({ url: 'https://cdn.example.com/from-url.jpg' });
  assert.ok(result?.includes('from-url.jpg'));
});

test('resolveMediaUrl: object with src', () => {
  const result = resolveMediaUrl({ src: 'https://cdn.example.com/from-src.jpg' });
  assert.ok(result?.includes('from-src.jpg'));
});

test('resolveMediaUrl: nested media object', () => {
  const result = resolveMediaUrl({
    media: { thumbnailUrl: 'https://cdn.example.com/nested-thumb.jpg' }
  });
  assert.ok(result?.includes('nested-thumb.jpg'));
});

test('resolveMediaUrl: array of media objects', () => {
  const result = resolveMediaUrl([
    { type: 'video', url: 'https://cdn.example.com/skip.mp4' },
    { type: 'image', url: 'https://cdn.example.com/pick-me.jpg' }
  ]);
  assert.ok(result);
  assert.notEqual(result, '[object Object]');
});

test('resolveMediaUrl: array of strings', () => {
  const result = resolveMediaUrl(['', 'https://cdn.example.com/arr-string.jpg']);
  assert.ok(result?.includes('arr-string.jpg'));
});

test('resolveMediaUrl: JSON-encoded media', () => {
  const result = resolveMediaUrl(JSON.stringify({ url: 'https://cdn.example.com/json.jpg' }));
  assert.ok(result?.includes('json.jpg'));
});

test('resolveMediaUrl: empty array / empty object / null / undefined', () => {
  assert.equal(resolveMediaUrl([]), null);
  assert.equal(resolveMediaUrl({}), null);
  assert.equal(resolveMediaUrl(null), null);
  assert.equal(resolveMediaUrl(undefined), null);
});

test('resolveMediaUrl: malformed media and object coercion artifact', () => {
  assert.equal(resolveMediaUrl('[object Object]'), null);
  assert.equal(resolveMediaUrl({ foo: { bar: 1 } }), null);
  assert.equal(resolveMediaUrl(true), null);
});

test('resolveGuestMarketplaceListingImage: prefers cover/image fields and rejects object coercion', () => {
  const listing = {
    title: 'Sony Xperia 1 IV Mark 4',
    images: [{ url: 'https://cdn.example.com/xperia.jpg', type: 'image' }],
    media: [{ type: 'image', src: 'https://cdn.example.com/xperia-alt.jpg' }]
  };
  const result = resolveGuestMarketplaceListingImage(listing);
  assert.ok(result && !result.includes('[object Object]'));
  assert.match(result, /xperia/i);
});

test('resolveGuestMarketplaceListingImage: object-only images without string coercion', () => {
  // Classic bug shape: images[0] is object; String(images[0]) === "[object Object]"
  const listing = {
    images: [{ notAUrl: true, meta: { w: 1 } }],
    media: [{ type: 'image' }]
  };
  const result = resolveGuestMarketplaceListingImage(listing);
  assert.equal(result, null);
});

test('resolveGuestMarketplaceListingImage: valid string image on listing', () => {
  const result = resolveGuestMarketplaceListingImage({
    image: 'https://cdn.example.com/direct.jpg',
    images: [{ broken: true }]
  });
  assert.ok(result?.includes('direct.jpg'));
});
