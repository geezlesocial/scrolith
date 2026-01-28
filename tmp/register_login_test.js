(async ()=>{
  const base = 'http://localhost:5000/api';
  const rnd = Math.random().toString(36).slice(2,9);
  const email = `test+${rnd}@example.com`;
  const password = 'TestPass123!';
  const name = 'Test User';
  try {
    console.log('Registering user', email);
    let r = await fetch(`${base}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password, role: 'freelancer' })
    });
    console.log('/auth/register', r.status);
    const regText = await r.text();
    console.log('reg response:', regText.slice(0,1000));

    console.log('Logging in...');
    r = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    console.log('/auth/login', r.status);
    const loginText = await r.text();
    console.log('login response:', loginText.slice(0,1000));

    if (r.ok) console.log('Register+Login test passed'); else process.exit(2);
  } catch (e) {
    console.error('Test error', e && (e.stack||e.message) ? (e.stack||e.message) : e);
    process.exit(10);
  }
})();
