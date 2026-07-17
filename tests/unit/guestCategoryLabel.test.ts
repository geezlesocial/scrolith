import test from 'node:test';
import assert from 'node:assert/strict';
import {
  humanizeCategorySlug,
  resolveCategoryLabel,
  resolveGuestMarketplaceCategoryLabel
} from '../../src/utils/guestCategoryLabel';
import { resolveGuestMarketplaceListingImage } from '../../src/utils/guestMarketplaceMedia';

// --- resolveCategoryLabel: positive cases ---

test('1 plain string category', () => {
  assert.equal(resolveCategoryLabel('Electronics'), 'Electronics');
});

test('2 categoryName string via guest listing helper', () => {
  assert.equal(
    resolveGuestMarketplaceCategoryLabel({ categoryName: 'Phones' }),
    'Phones'
  );
});

test('3 category_name string via guest listing helper', () => {
  assert.equal(
    resolveGuestMarketplaceCategoryLabel({ category_name: 'Gadgets' }),
    'Gadgets'
  );
});

test('4 object with name', () => {
  assert.equal(resolveCategoryLabel({ name: 'Electronics' }), 'Electronics');
});

test('5 object with title', () => {
  assert.equal(resolveCategoryLabel({ title: 'Home Goods' }), 'Home Goods');
});

test('6 object with label', () => {
  assert.equal(resolveCategoryLabel({ label: 'Services' }), 'Services');
});

test('7 object with categoryName', () => {
  assert.equal(resolveCategoryLabel({ categoryName: 'Fashion' }), 'Fashion');
});

test('8 object with displayName', () => {
  assert.equal(resolveCategoryLabel({ displayName: 'Automotive' }), 'Automotive');
});

test('9 object with value', () => {
  assert.equal(resolveCategoryLabel({ value: 'Sports' }), 'Sports');
});

test('10 nested object', () => {
  assert.equal(
    resolveCategoryLabel({ category: { name: 'Nested Electronics' } }),
    'Nested Electronics'
  );
});

test('11 array containing valid object', () => {
  assert.equal(
    resolveCategoryLabel([{ id: 1 }, { name: 'From Array Object' }]),
    'From Array Object'
  );
});

test('12 array containing valid string', () => {
  assert.equal(resolveCategoryLabel(['', 'From Array String']), 'From Array String');
});

test('13 JSON-encoded object', () => {
  assert.equal(
    resolveCategoryLabel(JSON.stringify({ name: 'JSON Electronics' })),
    'JSON Electronics'
  );
});

test('14 slug humanization', () => {
  assert.equal(humanizeCategorySlug('consumer-electronics'), 'Consumer Electronics');
  assert.equal(humanizeCategorySlug('professional_services'), 'Professional Services');
  assert.equal(humanizeCategorySlug('home-and-garden'), 'Home And Garden');
  assert.equal(resolveCategoryLabel({ slug: 'consumer-electronics' }), 'Consumer Electronics');
});

// --- negative / edge cases ---

test('15 empty string', () => {
  assert.equal(resolveCategoryLabel(''), null);
  assert.equal(resolveCategoryLabel('   '), null);
});

test('16 empty object', () => {
  assert.equal(resolveCategoryLabel({}), null);
});

test('17 null', () => {
  assert.equal(resolveCategoryLabel(null), null);
});

test('18 undefined', () => {
  assert.equal(resolveCategoryLabel(undefined), null);
});

test('19 numeric ID', () => {
  assert.equal(resolveCategoryLabel(12345), null);
  assert.equal(resolveCategoryLabel('987654321'), null);
});

test('20 UUID-like value', () => {
  assert.equal(resolveCategoryLabel('7bbbd34e-9c9e-4ee2-bb38-a66de9973114'), null);
  assert.equal(
    resolveCategoryLabel({ name: '7bbbd34e-9c9e-4ee2-bb38-a66de9973114' }),
    null
  );
});

test('21 URL-like value', () => {
  assert.equal(resolveCategoryLabel('https://scrolith.com/categories/electronics'), null);
  assert.equal(resolveCategoryLabel({ name: 'https://example.com/x' }), null);
});

test('22 malformed JSON', () => {
  assert.equal(resolveCategoryLabel('{not-valid-json'), null);
  assert.equal(resolveCategoryLabel('{broken'), null);
});

test('23 literal [object Object]', () => {
  assert.equal(resolveCategoryLabel('[object Object]'), null);
  assert.equal(resolveCategoryLabel('prefix [object Object] suffix'), null);
});

test('24 circular object', () => {
  const circular: Record<string, unknown> = { id: 'x' };
  circular.self = circular;
  assert.equal(resolveCategoryLabel(circular), null);
  const withName: Record<string, unknown> = { name: 'Safe' };
  withName.self = withName;
  assert.equal(resolveCategoryLabel(withName), 'Safe');
});

test('25 excessive nesting', () => {
  let nested: any = { name: 'Deep' };
  for (let i = 0; i < 20; i++) nested = { category: nested };
  // Depth guard should not throw; may or may not resolve depending on depth
  assert.doesNotThrow(() => resolveCategoryLabel(nested));
  const result = resolveCategoryLabel(nested);
  assert.ok(result === null || result === 'Deep');
  assert.notEqual(result, '[object Object]');
});

test('26 very long category', () => {
  const long = `Category ${'Word '.repeat(40)}`.trim();
  const result = resolveCategoryLabel(long);
  assert.ok(result);
  assert.ok(result.length <= 64);
  assert.notEqual(result, '[object Object]');
});

test('27 control characters', () => {
  assert.equal(resolveCategoryLabel('Electronics\u0000\u0007'), 'Electronics');
  assert.equal(resolveCategoryLabel('\u0001\u0002'), null);
});

test('28 fallback to Marketplace', () => {
  assert.equal(resolveGuestMarketplaceCategoryLabel(null), 'Marketplace');
  assert.equal(resolveGuestMarketplaceCategoryLabel({}), 'Marketplace');
  assert.equal(resolveGuestMarketplaceCategoryLabel({ category: {} }), 'Marketplace');
  assert.equal(
    resolveGuestMarketplaceCategoryLabel({ category: { id: 'cmr10v7zl00qhs601wckqwk78' } }),
    'Marketplace'
  );
});

// --- production-shaped Sony Xperia listing mapper contract ---

test('Sony Xperia production-shaped listing: category Electronics, no [object Object]', () => {
  const listing = {
    id: 'cmr4cgqtf04rds6011k22nirw',
    title: 'Sony Xperia 1 IV Mark 4',
    categoryId: 'cmr10v7zl00qhs601wckqwk78',
    category: {
      id: 'cmr10v7zl00qhs601wckqwk78',
      name: 'Electronics',
      slug: 'electronics',
      icon: null,
      description: 'Phones, gadgets, accessories, and smart devices.',
      type: 'MARKETPLACE'
    },
    seller: {
      id: 'cmr3ye85n031us601osey0e1i',
      name: 'Nelu Jane Taganahan'
    },
    price: 13500,
    media: [
      {
        type: 'image',
        url: 'https://api.scrolith.com/api/files/content/7bbbd34e-9c9e-4ee2-bb38-a66de9973114'
      }
    ]
  };

  const category = resolveGuestMarketplaceCategoryLabel(listing);
  assert.equal(category, 'Electronics');
  assert.notEqual(category, '[object Object]');
  assert.ok(!category.includes('[object Object]'));

  // Priority: categoryName wins over object category
  assert.equal(
    resolveGuestMarketplaceCategoryLabel({
      ...listing,
      categoryName: 'Priority Name'
    }),
    'Priority Name'
  );

  // Invalid object category → Marketplace
  assert.equal(
    resolveGuestMarketplaceCategoryLabel({
      title: listing.title,
      category: { id: listing.category.id }
    }),
    'Marketplace'
  );

  // Media path unchanged (Phase 18.3 regression)
  const image = resolveGuestMarketplaceListingImage(listing);
  assert.ok(image && image.includes('7bbbd34e'));
  assert.ok(!image.includes('[object Object]'));

  // Simulated normalized preview item (mapper contract)
  const previewItem = {
    id: String(listing.id),
    title: String(listing.title).trim(),
    seller: 'Scrolith seller',
    category,
    price: Number(listing.price) || undefined,
    image: image || undefined
  };

  assert.equal(typeof previewItem.category, 'string');
  assert.equal(previewItem.title, 'Sony Xperia 1 IV Mark 4');
  assert.equal(previewItem.price, 13500);
  assert.notEqual(previewItem.category, '[object Object]');
  // JSX-safe: category is always a primitive string
  assert.equal(Object.prototype.toString.call(previewItem.category), '[object String]');
});

test('field priority: categoryName > category_name > category object', () => {
  assert.equal(
    resolveGuestMarketplaceCategoryLabel({
      categoryName: 'A',
      category_name: 'B',
      category: { name: 'C' }
    }),
    'A'
  );
  assert.equal(
    resolveGuestMarketplaceCategoryLabel({
      category_name: 'B',
      category: { name: 'C' }
    }),
    'B'
  );
  assert.equal(
    resolveGuestMarketplaceCategoryLabel({
      category: { name: 'C' }
    }),
    'C'
  );
});

test('never returns object coercion artifacts from classic String(category) bug shape', () => {
  const buggyShape = {
    id: 'x',
    name: 'Electronics',
    slug: 'electronics'
  };
  // Classic defect: String(buggyShape) === '[object Object]'
  assert.equal(String(buggyShape), '[object Object]');
  assert.equal(resolveCategoryLabel(buggyShape), 'Electronics');
  assert.equal(resolveGuestMarketplaceCategoryLabel({ category: buggyShape }), 'Electronics');
});
