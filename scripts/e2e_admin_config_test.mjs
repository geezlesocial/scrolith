import axios from 'axios';
import { io } from 'socket.io-client';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:5000';
const ADMIN = { email: 'admin@local.test', password: 'adminpass' };

async function login() {
  const resp = await axios.post(`${BACKEND}/api/auth/login`, ADMIN).then(r => r.data);
  if (!resp?.token) throw new Error('Login failed');
  return resp.token;
}

async function run() {
  const token = await login();
  console.log('Got token');

  // start listener as second client
  const socket = io(`${BACKEND}/community`, { auth: { token }, transports: ['websocket'] });

  const got = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for admin_config_updated')), 8000);
    socket.on('connect', () => console.log('Socket connected'));
    socket.on('community:admin_config_updated', (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

  // Perform admin update
  const newCfg = {
    community_enabled: true,
    stories_enabled: true,
    ads_enabled: false,
    gcoin_enabled: false,
    max_images_per_post: 3,
    max_video_size_mb: 30,
    story_expiry_hours: 12
  };

  console.log('Sending admin config update...');
  await axios.put(`${BACKEND}/api/community/admin/config`, newCfg, { headers: { Authorization: `Bearer ${token}` } });

  const payload = await got;
  console.log('Received socket payload:', payload);
  socket.disconnect();
  console.log('E2E admin config test passed');
}

run().catch((e) => { console.error('E2E failed:', e); process.exit(1); });
