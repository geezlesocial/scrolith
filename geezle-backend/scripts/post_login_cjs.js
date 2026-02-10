const http = require('http');

const payload = JSON.stringify({ email: 'admin@local', password: 'admin12345' });

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = http.request(options, (res) => {
  console.log('statusCode:', res.statusCode);
  console.log('headers:', res.headers);
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      console.log('body:', JSON.parse(data));
    } catch (e) {
      console.log('body (raw):', data);
    }
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error('request error', e && e.stack ? e.stack : e);
  process.exit(1);
});

req.write(payload);
req.end();
