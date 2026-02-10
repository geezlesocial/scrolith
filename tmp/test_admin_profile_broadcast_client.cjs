C:\Projects\scrolith>npm run dev

> atmyworks@0.0.0 dev
> vite


  VITE v6.4.1  ready in 752 ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.1.168:3000/
  ➜  Network: http://172.19.144.1:3000/
  ➜  press h + enter to show help


const axios = require('axios');
const { io } = require('socket.io-client');

(async () => {
  const SERVER_URL = 'http://localhost:5100';
  const SOCKET_URL = 'http://localhost:5100';

  const socket1 = io(SOCKET_URL, { transports: ['websocket'], reconnectionDelayMax: 1000 });
  const socket2 = io(SOCKET_URL, { transports: ['websocket'], reconnectionDelayMax: 1000 });

  await new Promise((resolve) => {
    let connected = 0;
    const check = () => { if (++connected === 2) resolve(); };
    socket1.on('connect', check);
    socket2.on('connect', check);
    setTimeout(() => resolve(), 5000);
  });

  console.log('Both sockets connected.');

  const received = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for admin:profile_updated')), 5000);
    socket2.on('admin:profile_updated', (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

  // Send PUT /api/admin/profile
  const payload = { siteTitle: 'Integration Test Title ' + Date.now() };
  try {
    const resp = await axios.put(`${SERVER_URL}/api/admin/profile`, payload, { timeout: 5000 });
    console.log('PUT response status:', resp.status);
  } catch (err) {
    console.error('PUT failed', err && err.message);
  }

  try {
    const data = await received;
    console.log('Received event data:', data);
    console.log('Test passed');
    process.exitCode = 0;
  } catch (err) {
    console.error('Test failed:', err && err.message);
    process.exitCode = 2;
  } finally {
    socket1.close();
    socket2.close();
  }
})();
