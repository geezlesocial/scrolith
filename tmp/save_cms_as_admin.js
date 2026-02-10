(async ()=>{
  const base = 'http://localhost:5000/api';
  const email = 'admin@scrolith.com';
  const password = 'admin12345';
  try {
    console.log('Logging in...');
    let r = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!r.ok) {
      console.error('LOGIN FAILED', r.status, await r.text());
      process.exit(2);
    }

    const login = await r.json();
    const token = login.token || login.accessToken || login.data?.token || login.data?.accessToken || login?.data?.access_token;
    if (!token) {
      console.error('No token returned from login:', JSON.stringify(login).slice(0,1000));
      process.exit(3);
    }
    console.log('Obtained token.');

    console.log('Fetching public homepage...');
    r = await fetch(`${base}/cms/homepage`);
    if (!r.ok) {
      console.error('Failed to fetch homepage', r.status, await r.text());
      process.exit(4);
    }
    const home = await r.json();

    const headerPayload = {
      logoUrl: home.logoUrl || home.logo_url || (home.sections && (home.sections.find(s=>s.type==='hero')?.content?.image)) || '',
      faviconUrl: home.faviconUrl || home.favicon_url || '' ,
      navigation: home.navigation || []
    };

    console.log('Saving header payload...');
    r = await fetch(`${base}/cms/header`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(headerPayload)
    });
    const headerText = await r.text();
    console.log('/cms/header ->', r.status, headerText.slice(0,1000));

    const heroPayload = home.heroSearch || home.hero || (home.sections && (home.sections.find(s=>s.type==='hero')?.content)) || {};

    console.log('Saving hero-search payload...');
    r = await fetch(`${base}/cms/hero-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(heroPayload)
    });
    const heroText = await r.text();
    console.log('/cms/hero-search ->', r.status, heroText.slice(0,1000));

    console.log('Done.');
  } catch (e) {
    console.error('Script error', e && (e.stack||e.message) ? (e.stack||e.message) : e);
    process.exit(10);
  }
})();
