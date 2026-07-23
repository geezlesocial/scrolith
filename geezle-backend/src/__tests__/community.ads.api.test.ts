import request from 'supertest';
import app from '../testApp';
import prisma from '../utils/prismaClient';

describe('Community Ads API (basic)', () => {
  let adId: string;

  beforeAll(async () => {
    await prisma.$connect();
    // Ensure dev user exists (auth middleware upserts in real flows)
    await prisma.user.upsert({ where: { id: 'dev-user-id-123' }, update: {}, create: { id: 'dev-user-id-123', email: 'dev@example.com', role: 'FREELANCER', isActive: true } });
    // Ensure dev user exists (auth middleware upserts) and create an ad owned by dev user
    const ad = await prisma.communityAd.create({ data: {
      creatorId: 'dev-user-id-123',
      title: 'Unit Test Ad',
      body: 'Test body',
      placement: 'feed',
      status: 'DRAFT',
      budget: 100,
      remainingBudget: 100,
      currency: 'USD'
    }});
    adId = ad.id;
  });

  afterAll(async () => {
    try {
      await prisma.adPayment.deleteMany({ where: { adId } });
    } catch(e){}
    try { await prisma.communityAd.deleteMany({ where: { id: adId } }); } catch(e){}
    await prisma.$disconnect();
  });

  test('GET /api/community/ads/:id returns the ad to creator', async () => {
    const res = await request(app).get(`/api/community/ads/${adId}`).set('x-dev-role', 'freelancer');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('id', adId);
  });

  test('PUT /api/community/ads/:id allows creator to update when in editable status', async () => {
    const res = await request(app)
      .put(`/api/community/ads/${adId}`)
      .set('x-dev-role', 'freelancer')
      .send({ title: 'Updated Title', budget: 150 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Updated Title');
    expect(Number(res.body.data.budget)).toBe(150);
  });

  test('PUT /api/community/ads/:id sends major ACTIVE edits back to review', async () => {
    // Move ad to ACTIVE
    await prisma.communityAd.update({ where: { id: adId }, data: { status: 'ACTIVE' } });
    const res = await request(app)
      .put(`/api/community/ads/${adId}`)
      .set('x-dev-role', 'freelancer')
      .send({ title: 'Needs Review' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('SUBMITTED_FOR_REVIEW');
  });

  test('GET /api/community/admin/ads returns list for admin', async () => {
    const res = await request(app).get('/api/community/admin/ads').set('x-dev-role', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBeTruthy();
  });
});
