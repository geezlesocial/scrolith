import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../testApp';
import prisma from '../utils/prismaClient';

describe('Community boost prefill', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';
  const ownerId = 'boost-community-owner';
  const viewerId = 'boost-community-viewer';
  const ownerToken = jwt.sign({ id: ownerId }, JWT_SECRET);
  const viewerToken = jwt.sign({ id: viewerId }, JWT_SECRET);
  const previousDevBypass = process.env.ALLOW_DEV_AUTH_BYPASS;
  let postId: string;
  let pageId: string;
  let clubId: string;
  let postFileId: string;
  let pageLogoFileId: string;
  let pageCoverFileId: string;

  beforeAll(async () => {
    await prisma.$connect();

    await prisma.user.upsert({
      where: { id: ownerId },
      update: { email: 'boost.community.owner@example.com', role: 'FREELANCER', isActive: true },
      create: {
        id: ownerId,
        email: 'boost.community.owner@example.com',
        role: 'FREELANCER',
        isActive: true
      }
    });

    await prisma.user.upsert({
      where: { id: viewerId },
      update: { email: 'boost.community.viewer@example.com', role: 'FREELANCER', isActive: true },
      create: {
        id: viewerId,
        email: 'boost.community.viewer@example.com',
        role: 'FREELANCER',
        isActive: true
      }
    });

    const postFile = await prisma.file.create({
      data: {
        id: 'boost-community-post-file',
        ownerId,
        ownerRole: 'FREELANCER',
        filename: 'boost-community-post-file.jpg',
        originalName: 'boost-community-post-file.jpg',
        mimeType: 'image/jpeg',
        size: BigInt(2048),
        url: 'https://cdn.scrolith.test/boost-community-post-file.jpg',
        storageKey: 'community/posts/boost-community-post-file.jpg',
        storageProvider: 'local',
        thumbnailUrl: 'https://cdn.scrolith.test/boost-community-post-file-thumb.jpg',
        width: 1200,
        height: 900,
        visibility: 'PUBLIC'
      }
    });
    postFileId = postFile.id;

    const pageLogo = await prisma.file.create({
      data: {
        id: 'boost-community-page-logo',
        ownerId,
        ownerRole: 'FREELANCER',
        filename: 'boost-community-page-logo.png',
        originalName: 'boost-community-page-logo.png',
        mimeType: 'image/png',
        size: BigInt(1024),
        url: 'https://cdn.scrolith.test/boost-community-page-logo.png',
        storageKey: 'community/pages/boost-community-page-logo.png',
        storageProvider: 'local',
        thumbnailUrl: 'https://cdn.scrolith.test/boost-community-page-logo-thumb.png',
        width: 800,
        height: 800,
        visibility: 'PUBLIC'
      }
    });
    pageLogoFileId = pageLogo.id;

    const pageCover = await prisma.file.create({
      data: {
        id: 'boost-community-page-cover',
        ownerId,
        ownerRole: 'FREELANCER',
        filename: 'boost-community-page-cover.jpg',
        originalName: 'boost-community-page-cover.jpg',
        mimeType: 'image/jpeg',
        size: BigInt(3072),
        url: 'https://cdn.scrolith.test/boost-community-page-cover.jpg',
        storageKey: 'community/pages/boost-community-page-cover.jpg',
        storageProvider: 'local',
        thumbnailUrl: 'https://cdn.scrolith.test/boost-community-page-cover-thumb.jpg',
        width: 1600,
        height: 900,
        visibility: 'PUBLIC'
      }
    });
    pageCoverFileId = pageCover.id;

    const post = await prisma.communityPost.create({
      data: {
        authorId: ownerId,
        title: 'Boostable Community Post',
        content: 'A post used to verify boost prefill.',
        status: 'active',
        visibility: 'public',
        attachments: [postFile.id],
        tags: ['boost', 'community'],
        location: 'Bacoor, Cavite'
      }
    });
    postId = post.id;

    const page = await prisma.communityBusinessPage.create({
      data: {
        ownerId,
        name: 'Boostable Business Page',
        handle: 'boostable-page',
        slug: 'boostable-page',
        tagline: 'A page used to verify boost prefill.',
        description: 'Business page boost content.',
        category: 'Services',
        status: 'active',
        logoFileId: pageLogo.id,
        coverFileId: pageCover.id
      }
    });
    pageId = page.id;

    const club = await prisma.communityClub.create({
      data: {
        ownerId,
        name: 'Boostable Group',
        slug: 'boostable-group',
        summary: 'A group used to verify boost prefill.',
        description: 'Group boost content.',
        visibility: 'PUBLIC',
        category: 'Networking',
        location: 'Bacoor, Cavite',
        joinMode: 'open',
        postPermission: 'members',
        membersCanInvite: true,
        coverImage: 'https://cdn.scrolith.test/boost-community-group-cover.jpg',
        avatarImage: 'https://cdn.scrolith.test/boost-community-group-avatar.jpg',
        status: 'active'
      }
    });
    clubId = club.id;
  });

  afterAll(async () => {
    if (previousDevBypass === undefined) {
      delete process.env.ALLOW_DEV_AUTH_BYPASS;
    } else {
      process.env.ALLOW_DEV_AUTH_BYPASS = previousDevBypass;
    }
    await prisma.communityPost.deleteMany({ where: { id: postId } }).catch(() => null);
    await prisma.communityBusinessPage.deleteMany({ where: { id: pageId } }).catch(() => null);
    await prisma.communityClub.deleteMany({ where: { id: clubId } }).catch(() => null);
    await prisma.file.deleteMany({
      where: { id: { in: [postFileId, pageLogoFileId, pageCoverFileId] } }
    }).catch(() => null);
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, viewerId] } } }).catch(() => null);
    await prisma.$disconnect();
  });

  test('owner can load post boost prefill with media payload', async () => {
    const res = await request(app)
      .get(`/api/community/ads/boost/post/${postId}/prefill`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sourceType).toBe('COMMUNITY_POST');
    expect(res.body.data.destinationUrl).toContain(`/post/${postId}`);
    expect(res.body.data.mediaFileIds).toEqual([postFileId]);
    expect(res.body.data.media).toHaveLength(1);
    expect(res.body.data.media[0]).toMatchObject({
      id: postFileId,
      type: 'image'
    });
  });

  test('owner can load page boost prefill with canonical page destination', async () => {
    const res = await request(app)
      .get(`/api/community/ads/boost/page/${pageId}/prefill`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sourceType).toBe('BUSINESS_PAGE');
    expect(res.body.data.destinationUrl).toContain('/company/boostable-page');
    expect(res.body.data.mediaFileIds).toEqual([pageCoverFileId, pageLogoFileId]);
    expect(res.body.data.media).toHaveLength(2);
  });

  test('owner can load group boost prefill and keep direct image urls', async () => {
    const res = await request(app)
      .get(`/api/community/ads/boost/group/${clubId}/prefill`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sourceType).toBe('COMMUNITY_GROUP');
    expect(res.body.data.destinationUrl).toContain('/community/clubs?group=boostable-group');
    expect(res.body.data.mediaFileIds).toHaveLength(2);
    expect(res.body.data.media).toHaveLength(2);
    expect(String(res.body.data.media[0].url || '')).toContain('boost-community-group');
  });

  test('non-owner is denied boost prefill access for pages', async () => {
    const res = await request(app)
      .get(`/api/community/ads/boost/page/${pageId}/prefill`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('guest is denied boost prefill access for groups', async () => {
    const res = await request(app).get(`/api/community/ads/boost/group/${clubId}/prefill`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
