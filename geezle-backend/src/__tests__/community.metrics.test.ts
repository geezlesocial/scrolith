import request from 'supertest';
import app from '../testApp';
import prisma from '../utils/prismaClient';

describe('Community metrics endpoints', () => {
  let postId: string | null = null;

  beforeAll(async () => {
    await prisma.$connect();
    const post = await prisma.communityPost.findFirst();
    postId = post ? post.id : null;
    if (!postId) {
      // create a post for testing
      const alice = await prisma.user.findFirst({ where: { email: 'alice+seed@local.dev' } });
      const authorId = alice ? alice.id : (await prisma.user.create({ data: { email: `test+${Date.now()}@local`, name: 'Test User' } })).id;
      const created = await prisma.communityPost.create({ data: { authorId, title: 'Test Post', content: 'Content for tests' } });
      postId = created.id;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('POST /api/community/posts/:id/view records view and returns 200', async () => {
    const res = await request(app)
      .post(`/api/community/posts/${postId}/view`)
      .set('x-dev-role', 'freelancer')
      .send({ sessionHash: 'test-session-1' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  test('POST /api/community/posts/:id/like requires auth', async () => {
    const res = await request(app)
      .post(`/api/community/posts/${postId}/like`)
      .set('x-dev-role', 'freelancer')
      .send({});
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  test('POST /api/community/posts/:id/share records share', async () => {
    const res = await request(app)
      .post(`/api/community/posts/${postId}/share`)
      .set('x-dev-role', 'freelancer')
      .send({ platform: 'twitter', sessionHash: 'test-session-1' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });
});
