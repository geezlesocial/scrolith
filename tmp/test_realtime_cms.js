import { io } from 'socket.io-client';

const BASE = process.env.BASE || 'http://localhost:5000/api';
const SERVER = (process.env.SERVER || 'http://localhost:5000');
const email = process.env.ADMIN_EMAIL || 'admin@scrolith.com';
const password = process.env.ADMIN_PASSWORD || 'admin12345';

(async function main(){
  try {
    console.log('Logging in...');
    const loginRes = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!loginRes.ok) throw new Error('Login failed: ' + loginRes.status);
    const login = await loginRes.json();
    const token = login.token || login.accessToken || login.data?.token || login.data?.accessToken || login?.data?.access_token;
    if (!token) throw new Error('No token from login: ' + JSON.stringify(login).slice(0,200));
    console.log('Obtained token. Connecting socket with auth...');

    const socket = io(SERVER, { auth: { token: token }, transports: ['websocket'] });

    const events = ['cms:header_updated','cms:hero_search_updated','cms:hero_updated','cms:sections_updated','cms:slides_updated','cms:trending_updated','cms:footer_updated','cms:activity_updated'];
    const received = {};

    socket.on('connect', () => {
      console.log('Socket connected', socket.id);
    });
    socket.on('connect_error', (err) => console.error('connect_error', err && err.message ? err.message : err));
    socket.on('disconnect', (r) => console.log('socket disconnected', r));

    for (const ev of events) {
      socket.on(ev, (p) => {
        console.log(new Date().toISOString(), 'EVENT', ev, JSON.stringify(p).slice(0,1000));
        received[ev] = received[ev] || 0;
        received[ev]++;
      });
    }

    // Wait for connection
    await new Promise((resolve, reject) => {
      const t = setTimeout(()=>reject(new Error('Socket connect timeout')), 5000);
      socket.on('connect', ()=>{ clearTimeout(t); resolve(); });
    });

    console.log('Fetching public homepage...');
    const r = await fetch(`${BASE}/cms/homepage`);
    const home = await r.json();

    const headerPayload = {
      logoUrl: home.logoUrl || home.logo_url || (home.sections && (home.sections.find(s=>s.type==='hero')?.content?.image)) || '',
      faviconUrl: home.faviconUrl || home.favicon_url || '' ,
      navigation: home.navigation || []
    };

    console.log('Saving header payload...');
    let res = await fetch(`${BASE}/cms/header`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(headerPayload)
    });
    console.log('/cms/header ->', res.status);

    const heroPayload = home.heroSearch || home.hero || (home.sections && (home.sections.find(s=>s.type==='hero')?.content)) || {};
    console.log('Saving hero-search payload...');
    res = await fetch(`${BASE}/cms/hero-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(heroPayload)
    });
    console.log('/cms/hero-search ->', res.status);

    console.log('Waiting up to 5s for events...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log('Received events summary:', received);

    const sawHeader = received['cms:header_updated'] || 0;
    const sawHero = (received['cms:hero_search_updated'] || 0) + (received['cms:hero_updated'] || 0);

    if (sawHeader > 0 && sawHero > 0) {
      console.log('Success: header and hero events received.');
      process.exit(0);
    } else {
      console.error('Missing expected events.');
      process.exit(2);
    }
  } catch (e) {
    console.error('Test script error:', e && (e.stack||e.message) ? (e.stack||e.message) : e);
    process.exit(10);
  }
})();
