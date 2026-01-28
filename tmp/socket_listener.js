import { io } from 'socket.io-client';

const SERVER = process.env.SERVER_URL || 'http://localhost:5000';
const socket = io(SERVER, { reconnectionAttempts: 5 });

const events = [
  'cms:header_updated',
  'cms:hero_search_updated',
  'cms:hero_updated',
  'cms:sections_updated',
  'cms:slides_updated',
  'cms:trending_updated',
  'cms:footer_updated',
  'cms:activity_updated'
];

console.log('Connecting to', SERVER);

socket.on('connect', () => {
  console.log('Socket connected', socket.id);
});

socket.on('connect_error', (err) => {
  console.error('Connect error:', err && err.message ? err.message : err);
});

socket.on('disconnect', (reason) => {
  console.log('Socket disconnected:', reason);
});

for (const ev of events) {
  socket.on(ev, (payload) => {
    console.log(new Date().toISOString(), 'EVENT', ev, JSON.stringify(payload).slice(0, 1000));
  });
}

// Keep process alive
setInterval(() => {}, 1000);
