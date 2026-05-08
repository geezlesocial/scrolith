#!/usr/bin/env node

const FRONTEND_URL = stripTrailingSlash(process.env.FRONTEND_URL || 'https://scrolith.com');
const API_URL = stripTrailingSlash(process.env.API_URL || 'https://api.scrolith.com/api');
const REQUIRED_HOME_TEXT = process.env.SMOKE_EXPECT_HOME_TEXT || '';
const BAD_HOME_TEXTS = [
  'No content sections configured',
  'Find the Perfect Freelancer for Your Project'
];
const LOGIN_EMAIL = process.env.SMOKE_LOGIN_EMAIL || '';
const LOGIN_PASSWORD = process.env.SMOKE_LOGIN_PASSWORD || '';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 20000);

let failures = 0;
let skipped = 0;

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function pass(name, detail) {
  console.log(`PASS ${name}${detail ? ` - ${detail}` : ''}`);
}

function skip(name, detail) {
  skipped += 1;
  console.log(`SKIP ${name}${detail ? ` - ${detail}` : ''}`);
}

function fail(name, detail) {
  failures += 1;
  console.error(`FAIL ${name}${detail ? ` - ${detail}` : ''}`);
}

function assert(name, condition, detail) {
  if (!condition) throw new Error(detail || `${name} assertion failed`);
}

async function request(name, url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'user-agent': 'ScrolithProductionSmoke/1.0',
        ...(options.headers || {})
      }
    });
  } catch (error) {
    throw new Error(`${name} request failed: ${error.message || error}`);
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON but received: ${text.slice(0, 160)}`);
  }
}

function unwrapData(payload) {
  return payload?.data?.data ?? payload?.data ?? payload;
}

function unwrapFooter(payload) {
  return payload?.data?.footer ?? payload?.footer ?? unwrapData(payload);
}

function extractToken(payload) {
  return (
    payload?.token ||
    payload?.accessToken ||
    payload?.data?.token ||
    payload?.data?.accessToken ||
    payload?.data?.data?.token ||
    payload?.data?.data?.accessToken ||
    ''
  );
}

function extractUser(payload) {
  return payload?.user || payload?.data?.user || payload?.data?.data?.user || null;
}

async function runStep(name, fn) {
  try {
    await fn();
  } catch (error) {
    fail(name, error.message || String(error));
  }
}

async function main() {
  let authToken = '';

  await runStep('homepage', async () => {
    const response = await request('homepage', FRONTEND_URL);
    const contentType = response.headers.get('content-type') || '';
    const html = await response.text();

    assert('homepage status', response.ok, `expected 2xx, got ${response.status}`);
    assert('homepage content type', contentType.includes('text/html'), `expected text/html, got ${contentType}`);
    assert('homepage app shell', html.includes('id="root"'), 'homepage HTML did not include the app root');
    assert('homepage title', html.includes('Scrolith'), 'homepage HTML did not include Scrolith branding');
    for (const badText of BAD_HOME_TEXTS) {
      assert('homepage bad text', !html.includes(badText), `homepage HTML included known bad text: ${badText}`);
    }
    if (REQUIRED_HOME_TEXT) {
      assert(
        'homepage text',
        html.includes(REQUIRED_HOME_TEXT),
        `missing expected homepage text: ${REQUIRED_HOME_TEXT}`
      );
    }
    pass('homepage', `${response.status} ${FRONTEND_URL}`);
  });

  await runStep('footer', async () => {
    const response = await request('footer', `${API_URL}/cms/footer`);
    const payload = await readJson(response);
    const footer = unwrapFooter(payload) || {};
    const columns = Array.isArray(footer.columns) ? footer.columns : [];
    const links = Array.isArray(footer.links) ? footer.links : [];
    const hasContent = Boolean(footer.description || footer.copyright || columns.length || links.length);

    assert('footer status', response.ok, `expected 2xx, got ${response.status}`);
    assert('footer content', hasContent, 'footer response did not include description, copyright, columns, or links');
    pass('footer', `columns=${columns.length} links=${links.length}`);
  });

  await runStep('login missing fields', async () => {
    const response = await request('login missing fields', `${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    assert('login missing fields status', response.status === 400, `expected 400, got ${response.status}`);
    pass('login missing fields', '400');
  });

  await runStep('login invalid credentials', async () => {
    const response = await request('login invalid credentials', `${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `smoke-${Date.now()}@example.invalid`,
        password: 'not-a-real-password'
      })
    });
    assert('login invalid credentials status', response.status === 401, `expected 401, got ${response.status}`);
    pass('login invalid credentials', '401');
  });

  if (LOGIN_EMAIL && LOGIN_PASSWORD) {
    await runStep('login valid credentials', async () => {
      const response = await request('login valid credentials', `${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD })
      });
      const payload = await readJson(response);
      authToken = extractToken(payload);
      const user = extractUser(payload);

      assert('login valid status', response.status === 200, `expected 200, got ${response.status}`);
      assert('login token', Boolean(authToken), 'login response did not include token/accessToken');
      assert('login user', Boolean(user?.id || user?.email), 'login response did not include user identity');
      pass('login valid credentials', `user=${user.email || user.id}`);
    });
  } else {
    skip('login valid credentials', 'set SMOKE_LOGIN_EMAIL and SMOKE_LOGIN_PASSWORD to enable');
  }

  await runStep('auth/me', async () => {
    const response = await request('auth/me', `${API_URL}/auth/me`, {
      headers: authToken ? { authorization: `Bearer ${authToken}` } : {}
    });
    if (authToken) {
      const payload = await readJson(response);
      const user = extractUser(payload) || payload?.user;
      assert('auth/me status', response.status === 200, `expected 200, got ${response.status}`);
      assert('auth/me user', Boolean(user?.id || user?.email), 'auth/me response did not include user');
      pass('auth/me', `user=${user.email || user.id}`);
    } else {
      assert('auth/me unauthenticated status', response.status === 401, `expected 401, got ${response.status}`);
      pass('auth/me unauthenticated guard', '401');
    }
  });

  await runStep('favorites', async () => {
    const response = await request('favorites', `${API_URL}/favorites`, {
      headers: authToken ? { authorization: `Bearer ${authToken}` } : {}
    });
    if (authToken) {
      const payload = await readJson(response);
      const data = unwrapData(payload);
      assert('favorites status', response.status === 200, `expected 200, got ${response.status}`);
      assert('favorites data', Array.isArray(data), 'favorites response data was not an array');
      pass('favorites authenticated', `items=${data.length}`);
    } else {
      assert('favorites unauthenticated status', response.status === 401, `expected 401, got ${response.status}`);
      pass('favorites unauthenticated guard', '401');
    }
  });

  if (failures > 0) {
    console.error(`Production smoke failed: ${failures} failed, ${skipped} skipped.`);
    process.exit(1);
  }

  console.log(`Production smoke passed: ${skipped} skipped.`);
}

main().catch((error) => {
  fail('smoke runner', error.message || String(error));
  process.exit(1);
});
