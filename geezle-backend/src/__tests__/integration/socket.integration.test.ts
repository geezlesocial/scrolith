import request from 'supertest';
import { AddressInfo } from 'net';
import { io as Client } from 'socket.io-client';
import app, { server } from '../../server';
import prisma from '../../utils/prismaClient';
import jwt from 'jsonwebtoken';

jest.setTimeout(20000);

describe('Socket integration - targeted emits', () => {
  let port: number;

  beforeAll(async () => {
    // start the server on ephemeral port
    // enable test-only socket join behavior
    (process.env as any).SOCKET_ALLOW_TEST_JOIN = 'true';
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const addr = server.address() as AddressInfo;
    port = addr.port;

    // ensure a recipient user and wallets exist for transfer/donate tests
    await prisma.user.upsert({ where: { id: 'recipient-1' }, update: {}, create: { id: 'recipient-1', email: 'recipient-1@local.dev', role: 'USER' } as any });
    await prisma.gcoinWallet.upsert({ where: { userId: 'recipient-1' }, update: {}, create: { userId: 'recipient-1', recipientId: 'GC-RECIP', balance: 10, lifetimeEarned: 10, status: 'active' } as any });
    await prisma.gcoinWallet.upsert({ where: { userId: 'dev-user-id-123' }, update: {}, create: { userId: 'dev-user-id-123', recipientId: 'GC-DEV', balance: 100, lifetimeEarned: 100, status: 'active' } as any });
    // create JWTs for test users
    const secret = process.env.JWT_SECRET || 'dev_jwt_secret';
    (process.env as any).TEST_JWT_DEV = jwt.sign({ id: 'dev-user-id-123' }, secret);
    (process.env as any).TEST_JWT_RECIP = jwt.sign({ id: 'recipient-1' }, secret);
  });

  beforeEach(async () => {
    // reset dev user wallet to known state before each test
    await prisma.gcoinWallet.upsert({ where: { userId: 'dev-user-id-123' }, update: { balance: 100, lifetimeEarned: 100, status: 'active' }, create: { userId: 'dev-user-id-123', recipientId: 'GC-DEV', balance: 100, lifetimeEarned: 100, status: 'active' } as any });
  });

  afterAll(async () => {
    try {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    } catch (e) {}
  });

  const connectClient = (token: string) => new Promise<any>((resolve, reject) => {
    // create a single socket connected to the /community namespace for both control and listening
    const sock = Client(`http://127.0.0.1:${port}/community`, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token: `Bearer ${token}` },
      query: {}
    });
    const onConnect = () => resolve(sock);
    const handleErr = (err: any) => { try { sock.disconnect(); } catch {} reject(err); };
    sock.on('connect', onConnect);
    sock.on('connect_error', handleErr);
  });

  const waitForEvent = (c: any, ev: string, timeout = 5000) => new Promise<any>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for event ' + ev)), timeout);
    const handler = (payload: any) => { clearTimeout(t); resolve(payload); };
    c.once(ev, handler);
  });

  test('admin credit emits targeted wallet balance update', async () => {
    const USER_ID = 'dev-user-id-123';
      const client = await connectClient(process.env.TEST_JWT_DEV as string);
    try {
      client.emit('join:wallet', { userId: USER_ID });
      await waitForEvent(client, 'joined', 2000);
      const waiter = waitForEvent(client, 'community:gcoin_balance_updated', 5000);
      await request(app)
        .post('/api/gcoin/admin/credit')
        .set('x-dev-role', 'admin')
        .send({ userId: USER_ID, amount: 1 });
      const payload = await waiter;
      expect(payload).toBeDefined();
      expect(payload.userId).toBe(USER_ID);
    } finally {
      try { client.disconnect(); } catch (e) {}
    }
  });

  test('create ad draft emits to ad room', async () => {
    const USER_ID = 'dev-user-id-123';
      const adClient = await connectClient(process.env.TEST_JWT_DEV as string);
    try {
      const waiter = waitForEvent(adClient, 'community:ad_created', 5000);
      const res = await request(app)
        .post('/api/community/ads/draft')
        .set('x-dev-role', 'freelancer')
        .send({ title: 'Test Ad', body: 'Hello', budget: 10 });
      const ad = res.body?.data;
      const adId = ad?.adId || ad?.id;
      // don't join after creation — the controller emits immediately
      const payload = await waiter;
      expect(payload).toBeDefined();
      expect(payload.ad).toBeDefined();
      expect(payload.ad.creatorId).toBe(USER_ID);
    } finally {
      try { adClient.disconnect(); } catch (e) {}
    }
  });

  test('transfer emits targeted transaction and balance updates', async () => {
    const SENDER = 'dev-user-id-123';
    const RECIP = 'recipient-1';
      const senderClient = await connectClient(process.env.TEST_JWT_DEV as string);
      const recipClient = await connectClient(process.env.TEST_JWT_RECIP as string);
    try {
      senderClient.emit('join:wallet', { userId: SENDER });
      recipClient.emit('join:wallet', { userId: RECIP });
      // wait for join acknowledgements
      await waitForEvent(senderClient, 'joined', 2000);
      await waitForEvent(recipClient, 'joined', 2000);
      const waiter = waitForEvent(recipClient, 'community:gcoin_transaction_created', 5000);
      const senderW = await prisma.gcoinWallet.findUnique({ where: { userId: SENDER } });
      const recipW = await prisma.gcoinWallet.findUnique({ where: { userId: RECIP } });
      const res = await request(app)
        .post('/api/gcoin/transfer')
        .set('x-dev-role', 'freelancer')
        .send({ toRecipientId: String(recipW?.recipientId), amount: 1, note: 'socket transfer' });
      expect(res.status).toBe(200);
      const payload = await waiter;
      expect(payload).toBeDefined();
      expect(payload.to).toBeDefined();
    } finally {
      try { senderClient.disconnect(); } catch (e) {}
      try { recipClient.disconnect(); } catch (e) {}
    }
  });

  test('donate emits to post room and recipient', async () => {
    const DONOR = 'dev-user-id-123';
    const RECIP = 'recipient-1';
    // create a post by recipient
    const post = await prisma.communityPost.create({ data: { authorId: RECIP, content: 'Donate target', title: 'Donate me' } });
      const postClient = await connectClient(process.env.TEST_JWT_DEV as string);
    try {
      postClient.emit('join:post', { postId: post.id });
      await waitForEvent(postClient, 'joined', 2000);
      const waiter = waitForEvent(postClient, 'community:gcoin_donated', 5000);
      const res = await request(app).post('/api/gcoin/donate').set('x-dev-role', 'freelancer').send({ postId: post.id, amount: 1 });
      expect(res.status).toBe(200);
      const payload = await waiter;
      expect(payload.postId).toBe(post.id);
    } finally {
      try { postClient.disconnect(); } catch (e) {}
    }
  });

  test('conversion request emits to user', async () => {
    const USER = 'dev-user-id-123';
      const uClient = await connectClient(process.env.TEST_JWT_DEV as string);
    try {
      uClient.emit('join:wallet', { userId: USER });
      await waitForEvent(uClient, 'joined', 2000);
      const waiter = waitForEvent(uClient, 'community:gcoin_conversion_requested', 5000);
      const res = await request(app).post('/api/gcoin/conversions').set('x-dev-role', 'freelancer').send({ amount: 1 });
      expect(res.status).toBe(200);
      const payload = await waiter;
      expect(payload.userId).toBe(USER);
    } finally {
      try { uClient.disconnect(); } catch (e) {}
    }
  });
});
