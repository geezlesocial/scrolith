(async ()=>{
  const base = 'http://localhost:5000/api';
  const email = 'admin@geezle.com';
  const password = 'admin12345';
  try {
    console.log('Logging in...');
    let r = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch(e) { json = text; }
    console.log('/auth/login ->', r.status, JSON.stringify(json, null, 2).slice(0,2000));

    if (!r.ok) {
      process.exit(2);
    }

    const token = json.token || json.accessToken || json.data?.token || json.data?.accessToken || json?.data?.access_token;
    console.log('Extracted token:', token ? (token.slice(0,40) + '...') : 'NONE');

    console.log('Calling /auth/me with token...');
    r = await fetch(`${base}/auth/me`, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token }
    });
    const meText = await r.text();
    let meJson;
    try { meJson = JSON.parse(meText); } catch(e) { meJson = meText; }
    console.log('/auth/me ->', r.status, JSON.stringify(meJson, null, 2).slice(0,2000));

  } catch (e) {
    console.error('Script error', e.stack||e.message||e);
    process.exit(10);
  }
})();
