// Simple Socket.IO client example to join rooms and listen for targeted events
// Run with: node scripts/socketJoinExample.js

const { io } = require('socket.io-client');

const SERVER = process.env.SERVER || 'http://localhost:5000';
const USER_ID = process.env.USER_ID || 'dev-user-id-123';

(async () => {
  const socket = io(`${SERVER}`, {
    path: '/socket.io',
    transports: ['websocket'],
    auth: { userId: USER_ID },
    query: { userId: USER_ID }
  });

  socket.on('connect', () => {
    console.log('connected', socket.id);
    // Join wallet room (authenticated)
    socket.emit('join:wallet', { userId: USER_ID });
    // Join a post room (public)
    socket.emit('join:post', { postId: 'example-post-1' });
    // Join an ad room
    socket.emit('join:ad', { adId: 'example-ad-1' });
  });

  socket.on('joined', (data) => console.log('joined:', data));
  socket.on('left', (data) => console.log('left:', data));
  socket.on('community:gcoin_balance_updated', (d) => console.log('balance update:', d));
  socket.on('community:gcoin_transaction_created', (d) => console.log('tx created:', d));
  socket.on('community:gcoin_donated', (d) => console.log('donation:', d));
  socket.on('community:ad_status_updated', (d) => console.log('ad status:', d));
  socket.on('disconnect', (reason) => console.log('disconnected:', reason));
  socket.on('error', (err) => console.error('socket error:', err));
})();
