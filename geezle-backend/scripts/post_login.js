const fetch = require('node-fetch');

(async () => {
  try {
    const res = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@local', password: 'admin12345' })
    });
    const text = await res.text();
    console.log('status', res.status);
    console.log('headers', Object.fromEntries(res.headers.entries()));
    console.log('body', text);
  } catch (e) {
    console.error('post_login error', e && e.stack ? e.stack : e);
    process.exit(1);
  }
})();
