const io = require('socket.io-client');

const url = process.env.SOCKET_URL || 'http://localhost:5000';
console.log('Connecting to', url);
const socket = io(url, { transports: ['websocket'], reconnectionDelayMax: 5000 });

socket.on('connect', () => {
  console.log('connected:', socket.id);
  socket.emit('client:hello', { msg: 'hello from smoke client' });
});

socket.on('disconnect', (reason) => {
  console.log('disconnected', reason);
});

socket.onAny((event, ...args) => {
  console.log('event', event, args);
});

setTimeout(() => {
  console.log('closing socket client');
  socket.close();
  process.exit(0);
}, 8000);
