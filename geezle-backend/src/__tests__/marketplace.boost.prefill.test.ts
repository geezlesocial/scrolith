import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../testApp';
import prisma from '../utils/prismaClient';

describe('Marketplace boost prefill', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';
  const ownerId = 'boost-owner-user';
  const viewerId = 'boost-viewer-user';
  const ownerToken = jwt.sign({ id: ownerId }, JWT_SECRET);
  const viewerToken = jwt.sign({ id: viewerId }, JWT_SECRET);
  const previousDevBypass = process.env.ALLOW_DEV_AUTH_BYPASS;
  let listingId: string;
  let listingWithoutMediaId: string;
  let fileId: string;

  beforeAll(async () => {
    await prisma.$connect();

    await prisma.user.upsert({
      where: { id: ownerId },
      update: { email: 'boost.owner@example.com', role: 'FREELANCER', isActive: true },
      create: {
        id: ownerId,
        email: 'boost.owner@example.com',
        role: 'FREELANCER',
        isActive: true
      }
    });

    await prisma.user.upsert({
      where: { id: viewerId },
      update: { email: 'boost.viewer@example.com', role: 'FREELANCER', isActive: true },
      create: {
        id: viewerId,
        email: 'boost.viewer@example.com',
        role: 'FREELANCER',
        isActive: true
      }
    });

    const file = await prisma.file.create({
      data: {
        id: 'boost-listing-file',
        ownerId,
        ownerRole: 'FREELANCER',
        filename: 'boost-listing-file.png',
        originalName: 'boost-listing-file.png',
        mimeType: 'image/png',
        size: BigInt(12345),
        url: 'https://cdn.scrolith.test/boost-listing-file.png',
        storageKey: 'boost/listing/file.png',
        storageProvider: 'local',
        thumbnailUrl: 'https://cdn.scrolith.test/boost-listing-file-thumb.png',
        width: 1200,
        height: 900,
        visibility: 'PUBLIC'
      }
    });
    fileId = file.id;

    const listing = await prisma.marketplaceListing.create({
      data: {
        id: 'boost-listing-1',
        sellerId: ownerId,
        title: 'Boostable Marketplace Listing',
        slug: 'boostable-marketplace-listing',
        description: 'A listing used to verify boost prefill.',
        price: 250,
        currency: 'USD',
        quantity: 1,
        status: 'active',
        reviewStatus: 'approved',
        location: 'Bacoor, Cavite',
        meetupPreferences: ['public_meetup'],
        deliveryOptions: ['pickup'],
        paymentMethods: ['wallet'],
        tags: ['test', 'boost'],
        condition: 'used',
        contactPreference: 'message'
      }
    });
    listingId = listing.id;

    await prisma.marketplaceListingMedia.create({
      data: {
        id: 'boost-listing-media',
        listingId: listing.id,
        fileId: file.id,
        type: 'image',
        url: file.url,
        storagePath: 'marketplace/listings/boost-listing-file.png',
        thumbnailUrl: file.thumbnailUrl,
        sortOrder: 0,
        mimeType: file.mimeType,
        sizeBytes: BigInt(12345),
        width: 1200,
        height: 900
      }
    });

    const listingWithoutMedia = await prisma.marketplaceListing.create({
      data: {
        id: 'boost-listing-2',
        sellerId: ownerId,
        title: 'Boostable Marketplace Listing No Media',
        slug: 'boostable-marketplace-listing-no-media',
        description: 'A listing without media.',
        price: 150,
        currency: 'USD',
        quantity: 1,
        status: 'active',
        reviewStatus: 'approved',
        location: 'Imus, Cavite',
        meetupPreferences: ['public_meetup'],
        deliveryOptions: ['pickup'],
        paymentMethods: ['wallet'],
        tags: ['test'],
        condition: 'new',
        contactPreference: 'message'
      }
    });
    listingWithoutMediaId = listingWithoutMedia.id;
  });

  afterAll(async () => {
    if (previousDevBypass === undefined) {
      delete process.env.ALLOW_DEV_AUTH_BYPASS;
    } else {
      process.env.ALLOW_DEV_AUTH_BYPASS = previousDevBypass;
    }
    await prisma.marketplaceListingMedia.deleteMany({ where: { listingId: { in: [listingId, listingWithoutMediaId] } } }).catch(() => null);
    await prisma.marketplaceAuditLog.deleteMany({ where: { listingId: { in: [listingId, listingWithoutMediaId] } } }).catch(() => null);
    await prisma.marketplaceListing.deleteMany({ where: { id: { in: [listingId, listingWithoutMediaId] } } }).catch(() => null);
    await prisma.file.deleteMany({ where: { id: fileId } }).catch(() => null);
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, viewerId] } } }).catch(() => null);
    await prisma.$disconnect();
  });

  test('owner can load boost prefill with canonical destination and media references', async () => {
    const res = await request(app)
      .get(`/api/community/ads/boost/listing/${listingId}/prefill`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sourceType).toBe('MARKETPLACE_LISTING');
    expect(res.body.data.listingId).toBe(listingId);
    expect(res.body.data.listingUrl).toContain('/marketplace/listing/boostable-marketplace-listing');
    expect(res.body.data.destinationUrl).toContain('/marketplace/listing/boostable-marketplace-listing');
    expect(res.body.data.mediaFileIds).toEqual([fileId]);
    expect(Array.isArray(res.body.data.media)).toBe(true);
    expect(res.body.data.media[0]).toMatchObject({ id: 'boost-listing-media', fileId });
  });

  test('non-owner is denied boost prefill access', async () => {
    const res = await request(app)
      .get(`/api/community/ads/boost/listing/${listingId}/prefill`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('guest is denied boost prefill access', async () => {
    const res = await request(app).get(`/api/community/ads/boost/listing/${listingId}/prefill`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('listing without images still returns valid boost payload', async () => {
    const res = await request(app)
      .get(`/api/community/ads/boost/listing/${listingWithoutMediaId}/prefill`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.listingId).toBe(listingWithoutMediaId);
    expect(Array.isArray(res.body.data.mediaFileIds)).toBe(true);
    expect(res.body.data.mediaFileIds).toHaveLength(0);
    expect(Array.isArray(res.body.data.media)).toBe(true);
    expect(res.body.data.media).toHaveLength(0);
  });
});
