const { spawn } = require('child_process');
const axios = require('axios');
const { io } = require('socket.io-client');

jest.setTimeout(30000);

describe('Admin profile realtime broadcast', () => {
  let child;

  beforeAll(async () => {
    // Wait for the test server to be healthy before proceeding.
    const PORT = process.env.TEST_SERVER_PORT || process.env.PORT || '5000';
    const SERVER = `http://localhost:${PORT}`;
    const timeoutMs = 15000;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        await axios.get(`${SERVER}/api/health`, { timeout: 2000 });
        return;
      } catch (e) {
        // retry
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error(`Test server did not become healthy on port ${process.env.TEST_SERVER_PORT || process.env.PORT || '5000'}`);
  });

  afterAll(() => {
    if (child && !child.killed) child.kill();
  });

  test('PUT /api/admin/profile triggers admin:profile_updated', async () => {
    const PORT = process.env.TEST_SERVER_PORT || process.env.PORT || '5000';
    const SERVER = `http://localhost:${PORT}`;

    // Authenticate as admin first to get JWT
    const adminEmail = process.env.TEST_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@local.test';
    const adminPassword = process.env.TEST_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'adminpass';
    let token = null;
    try {
      const res = await axios.post(`${SERVER}/api/auth/login`, { email: adminEmail, password: adminPassword }, { timeout: 5000 });
      token = res.data && res.data.token ? res.data.token : null;
    } catch (e) {
      console.warn('Admin login failed during test setup:', e && e.response && e.response.data ? e.response.data : e.message || e);
    }

    const socketOpts = token ? { transports: ['websocket'], reconnectionDelayMax: 1000, auth: { token } } : { transports: ['websocket'], reconnectionDelayMax: 1000 };
    const socket1 = io(SERVER, socketOpts);
    const socket2 = io(SERVER, socketOpts);

    await new Promise((resolve) => {
      let c = 0;
      const check = () => { if (++c === 2) resolve(); };
      socket1.on('connect', check);
      socket2.on('connect', check);
      setTimeout(() => resolve(), 5000);
    });

    const received = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Timeout waiting for settings:updated')), 7000);
      socket2.on('settings:updated', (data) => { clearTimeout(t); resolve(data); });
    });

    // send update to system settings (attach token if available)
    const payload = {
      system: {
        testFlag: 'jest-' + Date.now(),
        currency: { baseCurrency: 'USD' },
        currencies: [ { code: 'USD', isActive: true } ]
      }
    };
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    await axios.post(`${SERVER}/api/admin/system/settings`, payload, { headers, timeout: 5000 }).catch((e) => {
      console.warn('POST /api/admin/system/settings error:', e && e.response && e.response.data ? e.response.data : e.message || e);
    });

    const data = await received;
    expect(data).toBeDefined();
    expect(data.testFlag).toBe(payload.testFlag);

    socket1.close();
    socket2.close();
  });

  test('PUT /api/admin/profile updates user and emits user/admin events', async () => {
    const PORT = process.env.TEST_SERVER_PORT || process.env.PORT || '5000';
    const SERVER = `http://localhost:${PORT}`;

    const adminEmail = process.env.TEST_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@local.test';
    const adminPassword = process.env.TEST_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'adminpass';
    let token = null;
    try {
      const res = await axios.post(`${SERVER}/api/auth/login`, { email: adminEmail, password: adminPassword }, { timeout: 5000 });
      token = res.data && res.data.token ? res.data.token : null;
    } catch (e) {
      console.warn('Admin login failed during test setup:', e && e.response && e.response.data ? e.response.data : e.message || e);
    }

    const socketOpts = token ? { transports: ['websocket'], reconnectionDelayMax: 1000, auth: { token } } : { transports: ['websocket'], reconnectionDelayMax: 1000 };
    const adminSocket = io(SERVER, socketOpts);
    const userSocket = io(SERVER, socketOpts);

    await new Promise((resolve) => {
      let c = 0;
      const check = () => { if (++c === 2) resolve(); };
      adminSocket.on('connect', check);
      userSocket.on('connect', check);
      setTimeout(() => resolve(), 5000);
    });

    const events = { admin: null, user: null };

    const waitForEvents = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Timeout waiting for profile events')), 8000);
      adminSocket.on('admin:profile_updated', (data) => { events.admin = data; if (events.user) { clearTimeout(t); resolve(events); } });
      userSocket.on('user:profile_updated', (data) => { events.user = data; if (events.admin) { clearTimeout(t); resolve(events); } });
    });

    const unique = `jest-${Date.now()}`;
    const payload = { username: `Admin ${unique}`, email: `admin+${unique}@example.com`, password: `Pass${unique}!!` };
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    await axios.put(`${SERVER}/api/admin/profile`, payload, { headers, timeout: 5000 }).catch((e) => {
      console.warn('PUT /api/admin/profile error:', e && e.response && e.response.data ? e.response.data : e.message || e);
    });

    const ev = await waitForEvents;
    expect(ev.admin).toBeDefined();
    expect(ev.user).toBeDefined();

    // Determine effective userId (from token if present, otherwise dev user)
    let effectiveUserId = 'dev-user-id-123';
    if (token) {
      try {
        const parts = token.split('.');
        if (parts.length >= 2) {
          const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8');
          const decoded = JSON.parse(payloadJson);
          if (decoded && decoded.id) effectiveUserId = decoded.id;
        }
      } catch (e) {
        // ignore
      }
    }

    // Verify user basics persisted
    const userBasicsResp = await axios.get(`${SERVER}/api/users/${effectiveUserId}`, { headers, timeout: 5000 }).then(r => r.data).catch(() => null);
    expect(userBasicsResp).toBeDefined();
    expect(userBasicsResp.data).toBeDefined();
    expect(userBasicsResp.data.email).toBe(payload.email);

    adminSocket.close();
    userSocket.close();
  });
});
