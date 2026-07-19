import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SafeText,
  SafePrice,
  SafeLocation,
  SafeDate,
  SafeAvatarInitials,
  SafeAvatarColor,
  safeJoin,
  extractDisplayString,
  resolveListingMediaCandidates,
  isUnsafeRenderValue,
  SAFE_RENDER_VERSION
} from '../safeRender';

test('safe render version', () => {
  assert.equal(SAFE_RENDER_VERSION, '21.1.1');
});

test('never renders [object Object] for nested category', () => {
  assert.equal(SafeText({ name: 'Electronics' }), 'Electronics');
  assert.equal(SafeText({ foo: 1 }), '');
  assert.equal(extractDisplayString({ label: 'Handmade' }), 'Handmade');
  assert.ok(!safeJoin([{ name: 'A' }, { junk: true }, 'B']).includes('[object Object]'));
  assert.equal(safeJoin([{ name: 'A' }, { junk: true }, 'B']), 'A · B');
});

test('SafePrice formats nested amounts and currency', () => {
  const p = SafePrice({ amount: 49, currency: 'USD' });
  assert.ok(p.includes('49') || p.includes('49.00'));
  assert.equal(SafePrice(null, { fallback: '' }), '');
  assert.equal(SafePrice(undefined), '');
  assert.equal(SafePrice(Number.NaN), '');
});

test('SafeLocation handles objects', () => {
  assert.equal(SafeLocation({ city: 'Singapore', country: 'SG' }), 'Singapore, SG');
  assert.equal(SafeLocation('Remote'), 'Remote');
});

test('SafeDate relative formatting', () => {
  const recent = SafeDate(new Date(Date.now() -  thr_ms(2)));
  assert.ok(recent.includes('h ago') || recent === 'Just now' || recent.includes('m ago'));
  assert.equal(SafeDate('not-a-date', '—'), '—');
});

function thr_ms(h: number) {
  return h * 3600_000;
}

test('avatar initials and colors', () => {
  assert.equal(SafeAvatarInitials({ name: 'John Smith' }), 'JS');
  assert.equal(SafeAvatarInitials({ username: 'alice' }).length >= 1, true);
  const c1 = SafeAvatarColor('user-1');
  const c2 = SafeAvatarColor('user-1');
  assert.equal(c1.bg, c2.bg);
  assert.equal(c1.fg, '#ffffff');
});

test('listing media candidates extract urls', () => {
  const urls = resolveListingMediaCandidates({
    images: [{ url: '/uploads/a.jpg' }, 'https://cdn.example/b.png'],
    thumbnail: '/uploads/c.jpg'
  });
  assert.ok(urls.length >= 2);
  assert.ok(urls.some((u) => u.includes('a.jpg') || u.includes('uploads')));
});

test('isUnsafeRenderValue flags objects and empty', () => {
  assert.equal(isUnsafeRenderValue({ a: 1 }), true);
  assert.equal(isUnsafeRenderValue(null), true);
  assert.equal(isUnsafeRenderValue('[object Object]'), true);
  assert.equal(isUnsafeRenderValue('Hello'), false);
});

test('marketplace subtitle would not include object string', () => {
  const subtitle = safeJoin([
    SafePrice({ amount: 120, currency: 'USD' }),
    SafeText({ name: 'Furniture' }),
    SafeText({ bad: true })
  ]);
  assert.ok(!subtitle.includes('[object Object]'));
  assert.ok(subtitle.toLowerCase().includes('furniture') || subtitle.includes('120'));
});
