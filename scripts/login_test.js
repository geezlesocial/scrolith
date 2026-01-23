import getBackendTarget from './getBackendTarget.js'

;(async () => {
  try {
    const backend = getBackendTarget();

    // In CI/production getBackendTarget will have thrown if not provided.
    const backendBase = backend;
    const res = await fetch(`${backendBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@local.test', password: 'adminpass' })
    });
    console.log('status', res.status);
    const text = await res.text();
    console.log(text);
  } catch (e) {
    console.error('ERR', e && e.message ? e.message : e);
  }
})();
