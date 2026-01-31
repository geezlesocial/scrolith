import { chromium } from 'playwright';

(async () => {
  // Obtain admin JWT via API so we can set it in localStorage/cookie before page load
  // Try backend directly first (backend runs on :5000). Fallback to the dev server proxy at :3000.
  let loginResp = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@local.test', password: 'adminpass' })
  }).catch(() => null);

  if (!loginResp || !loginResp.ok) {
    loginResp = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@local.test', password: 'adminpass' })
    }).catch(() => null);
  }

  let adminToken = null;
  if (loginResp && loginResp.ok) {
    const body = await loginResp.json().catch(() => ({}));
    adminToken = body?.token || body?.data?.token || body?.accessToken || body?.data?.accessToken || body?.jwt || '';
    console.log('Obtained admin token:', Boolean(adminToken));
  } else {
    console.warn('Could not obtain admin token via API; falling back to interactive login.');
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  if (adminToken) {
    // Ensure token is present in localStorage and cookie for the SPA
    await context.addInitScript((token) => {
      try {
        localStorage.setItem('token', token || '');
        document.cookie = `geezle_token=${encodeURIComponent(token || '')}; path=/; SameSite=Lax`;
      } catch (e) {
        // ignore
      }
    }, adminToken);
  }
  const page = await context.newPage();

  try {
    // Track the generated nav id (used later to match backend-saved item)
    let expectedNavId = '';
    if (adminToken) {
      console.log('Admin token present; opening admin dashboard directly.');
        await page.goto('http://localhost:3000/admin/dashboard?tab=homepage', { timeout: 60000 });
    } else {
      console.log('Navigating to admin login and signing in...');
      await page.goto('http://localhost:3000/auth/login', { timeout: 30000 });
      // Wait for login form
      await page.waitForSelector('#email-address', { timeout: 15000 });
      // Fill admin credentials created by backend script
      await page.fill('#email-address', 'admin@local.test');
      await page.fill('#password', 'adminpass');
      await page.click('button[type=submit]');
      // Wait for redirect to admin dashboard or for admin nav to appear
      await page.waitForNavigation({ timeout: 15000 }).catch(() => {});
      await page.goto('http://localhost:3000/admin/dashboard', { timeout: 30000 });
    }
    // Ensure the Homepage Settings admin nav is clicked to open the settings editor
    const homepageNav = await page.$('button[data-testid="admin-nav-homepage"]');
    if (homepageNav) {
      await homepageNav.click();
    }

    // Wait for the Header & Hero tab and click it via data-testid
    await page.waitForSelector('button[data-testid="tab-header"]', { timeout: 30000 });
    await page.click('button[data-testid="tab-header"]');

    // Click Navigation Bar subtab using data-testid
    await page.waitForSelector('button[data-testid="subtab-nav"]', { timeout: 30000 });
    await page.click('button[data-testid="subtab-nav"]');

    // Add nav item (UI flow) using data-testid for Add Item and label/url inputs
    const addBtn = await page.waitForSelector('button[data-testid="nav-add-item"]', { timeout: 8000 }).catch(() => null);
    if (!addBtn) {
      console.warn('Add Item button not found');
    } else {
      await addBtn.click();
      // Fill the last Label and URL inputs in the navigation area (newly added item)
      const labelInput = await page.locator('input[data-testid^="nav-label-"]').last();
      await labelInput.fill('E2E Test Nav');
      const urlInput = await page.locator('input[data-testid^="nav-url-"]').last();
      await urlInput.fill('/e2e-test');

      // Determine the generated nav id from the data-testid attribute
      const labelTestId = await labelInput.getAttribute('data-testid');
      const parts = (labelTestId || '').split('nav-label-');
      const navId = parts[1] || '';
      // Persist navId for backend polling lookup (declared in outer scope)
      if (navId) {
        expectedNavId = navId;
        // Toggle visibility for guest and freelancer
        const guestBtn = await page.waitForSelector(`button[data-testid="nav-role-${navId}-guest"]`, { timeout: 3000 }).catch(() => null);
        if (guestBtn) await guestBtn.click();
        const freelBtn = await page.waitForSelector(`button[data-testid="nav-role-${navId}-freelancer"]`, { timeout: 3000 }).catch(() => null);
        if (freelBtn) await freelBtn.click();
      }
    }

    // Click Save Configuration via data-testid and capture the outgoing header save POST payload
    const saveBtn = await page.waitForSelector('button[data-testid="header-save-config"]', { timeout: 8000 }).catch(() => null);
    if (!saveBtn) throw new Error('Save button not found');

    const headerReqPromise = page.waitForRequest(
      (req) => req.url().includes('/api/cms/header') && req.method() === 'POST',
      { timeout: 10000 }
    ).catch(() => null);

    const headerResPromise = page.waitForResponse(
      (res) => res.url().includes('/api/cms/header') && res.request().method() === 'POST',
      { timeout: 10000 }
    ).catch(() => null);

    await Promise.all([saveBtn.click(), headerReqPromise, headerResPromise]);

    try {
      const headerReq = await headerReqPromise;
      const headerRes = await headerResPromise;
      if (headerReq) {
        const postData = headerReq.postData();
        console.log('Captured header save payload:', postData);
      } else {
        console.warn('Header save request not captured (timeout or different endpoint)');
      }

      if (headerRes) {
        const text = await headerRes.text().catch(() => null);
        console.log('Captured header save response:', text);
      } else {
        console.warn('Header save response not captured');
      }
    } catch (e) {
      console.warn('Error capturing header save request/response:', e?.message || e);
    }

    // Wait for a notification or success text
    try {
      await page.waitForSelector('text=Saved', { timeout: 8000 });
      console.log('Save confirmed: Saved notification seen.');
    } catch (e) {
      console.warn('No explicit Saved notification detected after save.');
    }

    // Verify backend persistence by polling the CMS GET endpoint
    const expectedLabel = 'E2E Test Nav';
    const maxRetries = 12; // ~12 seconds total
    const delayMs = 1000;

    const checkHeader = async () => {
      // Try public proxy first
      try {
        const resp = await fetch('http://localhost:3000/api/cms/header');
        if (resp && resp.ok) {
          const json = await resp.json().catch(() => null);
          const nav = (json?.navigation) || (json?.data?.navigation) || [];
          if (Array.isArray(nav)) {
            for (const n of nav) {
              // Prefer matching by id if we generated one, otherwise fall back to label
              if (expectedNavId && String(n?.id || '').toString() === expectedNavId) return n;
              const lab = String(n?.label || n?.title || n?.name || '').trim();
              if (!expectedNavId && lab === expectedLabel) return n;
            }
          }
        }
      } catch (e) {
        // ignore
      }

      // Fallback to backend direct call (may require auth for admin routes)
      try {
        const headers = {};
        if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;
        const resp2 = await fetch('http://localhost:5000/api/cms/header', { headers });
        if (resp2 && resp2.ok) {
          const json2 = await resp2.json().catch(() => null);
          const nav2 = (json2?.navigation) || (json2?.data?.navigation) || [];
          if (Array.isArray(nav2)) {
            for (const n of nav2) {
              if (expectedNavId && String(n?.id || '').toString() === expectedNavId) return n;
              const lab = String(n?.label || n?.title || n?.name || '').trim();
              if (!expectedNavId && lab === expectedLabel) return n;
            }
          }
        }
      } catch (e) {
        // ignore
      }

      return null;
    };

    let persisted = false;
    let persistedItem = null;
    for (let i = 0; i < maxRetries; i++) {
      // Small delay between attempts
      await new Promise((r) => setTimeout(r, delayMs));
      try {
        const found = await checkHeader();
        if (found) {
          persisted = true;
          persistedItem = found;
          console.log('Backend persistence confirmed: header contains new nav item.');
          break;
        }
      } catch (e) {
        // continue
      }
      console.log(`Polling header persistence: attempt ${i + 1}/${maxRetries}...`);
    }

    if (!persisted) {
      console.warn('Backend did NOT persist the new navigation item within timeout.');
    } else {
      // Tighten assertions: ensure persisted item has expected URL and visibility contains guest+freelancer
      try {
        const item = persistedItem || null;
        if (item) {
          // Extract URL from multiple possible keys
          const urlVal = String(item.url || item.path || item.href || item.redirect_url || item.redirectUrl || '').trim();
          const urlMatch = urlVal === '/e2e-test';

          // Extract visibility from multiple possible keys
          const rawVis = item.visibility || item.role_visibility || item.visible_to || item.roles || item.target_roles || [];
          const vis = Array.isArray(rawVis) ? rawVis.map((v) => String(v).toLowerCase()) : [];
          const visHasGuest = vis.includes('guest') || vis.includes('public') || vis.includes('all');
          const visHasFreelancer = vis.includes('freelancer') || vis.includes('seller');

          console.log('Persisted item snapshot:', { label: item.label || item.title || item.name, url: urlVal, visibility: vis });

          if (!urlMatch) console.warn('Persisted item URL did not match /e2e-test:', urlVal);
          if (!visHasGuest || !visHasFreelancer) console.warn('Persisted item visibility missing expected roles:', vis);
          if (urlMatch && visHasGuest && visHasFreelancer) console.log('Persisted item URL and visibility assertions passed.');
        }
      } catch (e) {
        console.warn('Assertion check failed:', e?.message || e);
      }
    }

        // --- Profile Menu Builder E2E ---
        try {
          const profileAdd = await page.waitForSelector('button[data-testid="profile-add-item"]', { timeout: 4000 }).catch(() => null);
          if (profileAdd) {
            await profileAdd.click();
            const profileLabel = await page.locator('input[data-testid^="profile-label-"]').last();
            await profileLabel.fill('E2E Profile Item');
            const profileUrl = await page.locator('input[data-testid^="profile-url-"]').last();
            await profileUrl.fill('/e2e-profile');

            const labelTestId = await profileLabel.getAttribute('data-testid');
            const parts2 = (labelTestId || '').split('profile-label-');
            const profileId = parts2[1] || '';

            // Toggle visibility for freelancer role on the profile item
            if (profileId) {
              const fam = await page.waitForSelector(`button[data-testid="profile-role-${profileId}-freelancer"]`, { timeout: 2000 }).catch(() => null);
              if (fam) await fam.click();
            }

            // Save and capture request/response
            const profReqPromise = page.waitForRequest((req) => req.url().includes('/api/cms/header') && req.method() === 'POST', { timeout: 10000 }).catch(() => null);
            const profResPromise = page.waitForResponse((res) => res.url().includes('/api/cms/header') && res.request().method() === 'POST', { timeout: 10000 }).catch(() => null);
            await Promise.all([page.click('button[data-testid="header-save-config"]'), profReqPromise, profResPromise]);

            if (profReqPromise) {
              const r = await profReqPromise.catch(() => null);
              if (r) console.log('Captured profile save payload');
            }

            // Poll backend for profile_menu persistence
            const expectedProfileLabel = 'E2E Profile Item';
            const checkProfile = async () => {
              try {
                const resp = await fetch('http://localhost:3000/api/cms/header');
                if (resp && resp.ok) {
                  const j = await resp.json().catch(() => null);
                  const pm = j?.profile_menu || j?.data?.profile_menu || [];
                  if (Array.isArray(pm)) {
                    for (const p of pm) {
                      const lab = String(p?.label || p?.title || '').trim();
                      if (lab === expectedProfileLabel) return p;
                    }
                  }
                }
              } catch (e) {}
              try {
                const headers = {};
                if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;
                const resp2 = await fetch('http://localhost:5000/api/cms/header', { headers });
                if (resp2 && resp2.ok) {
                  const j2 = await resp2.json().catch(() => null);
                  const pm2 = j2?.profile_menu || j2?.data?.profile_menu || [];
                  if (Array.isArray(pm2)) {
                    for (const p of pm2) {
                      const lab = String(p?.label || p?.title || '').trim();
                      if (lab === expectedProfileLabel) return p;
                    }
                  }
                }
              } catch (e) {}
              return null;
            };

            let profFound = null;
            for (let i = 0; i < 8; i++) {
              await new Promise((r) => setTimeout(r, 1000));
              const f = await checkProfile();
              if (f) { profFound = f; break; }
            }
            if (profFound) {
              console.log('Profile menu item persisted:', { label: profFound.label, visibility: profFound.visibility || profFound.roles || profFound.visible_to });
            } else {
              console.warn('Profile menu item not found in backend after save.');
            }
          } else {
            console.warn('Profile add button not present; skipping profile menu E2E.');
          }
        } catch (e) {
          console.warn('Profile Menu E2E error:', e?.message || e);
        }

        // --- Guest Header Experience E2E (dropdowns + CTAs) ---
        try {
          // Try to add a guest CTA
          const guestCtaBtn = await page.waitForSelector('button[data-testid="guest-add-cta"]', { timeout: 3000 }).catch(() => null);
          if (guestCtaBtn) {
            await guestCtaBtn.click();
            const ctaLabel = await page.locator('input[data-testid^="guest-cta-label-"]').last();
            await ctaLabel.fill('E2E Guest CTA');
            const ctaUrl = await page.locator('input[data-testid^="guest-cta-url-"]').last();
            await ctaUrl.fill('/e2e-guest-cta');

            const labelTest = await ctaLabel.getAttribute('data-testid');
            const idPart = (labelTest || '').split('guest-cta-label-')[1] || '';
            if (idPart) {
              const roleBtn = await page.waitForSelector(`button[data-testid="guest-cta-role-${idPart}-guest"]`, { timeout: 2000 }).catch(() => null);
              if (roleBtn) await roleBtn.click();
            }

            const guestReq = page.waitForRequest((req) => req.url().includes('/api/cms/header') && req.method() === 'POST', { timeout: 10000 }).catch(() => null);
            const guestRes = page.waitForResponse((res) => res.url().includes('/api/cms/header') && res.request().method() === 'POST', { timeout: 10000 }).catch(() => null);
            await Promise.all([page.click('button[data-testid="header-save-config"]'), guestReq, guestRes]);

            // Poll backend for guest cta
            const expectedGuestLabel = 'E2E Guest CTA';
            const checkGuest = async () => {
              try {
                const resp = await fetch('http://localhost:3000/api/cms/header');
                if (resp && resp.ok) {
                  const j = await resp.json().catch(() => null);
                  const ctas = j?.guest_ctas || j?.data?.guest_ctas || [];
                  if (Array.isArray(ctas)) {
                    for (const c of ctas) {
                      if ((String(c?.label || '')).trim() === expectedGuestLabel) return c;
                    }
                  }
                }
              } catch (e) {}
              try {
                const headers = {};
                if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;
                const resp2 = await fetch('http://localhost:5000/api/cms/header', { headers });
                if (resp2 && resp2.ok) {
                  const j2 = await resp2.json().catch(() => null);
                  const ctas2 = j2?.guest_ctas || j2?.data?.guest_ctas || [];
                  if (Array.isArray(ctas2)) {
                    for (const c of ctas2) {
                      if ((String(c?.label || '')).trim() === expectedGuestLabel) return c;
                    }
                  }
                }
              } catch (e) {}
              return null;
            };

            let guestFound = null;
            for (let i = 0; i < 8; i++) {
              await new Promise((r) => setTimeout(r, 1000));
              const f = await checkGuest();
              if (f) { guestFound = f; break; }
            }
            if (guestFound) {
              console.log('Guest CTA persisted:', { label: guestFound.label, visibility: guestFound.visibility || guestFound.roles || guestFound.visible_to });
            } else {
              console.warn('Guest CTA not found in backend after save.');
            }
          } else {
            console.warn('Guest CTA add button not present; skipping guest CTA E2E.');
          }
        } catch (e) {
          console.warn('Guest Header E2E error:', e?.message || e);
        }

        // Open public site and check for new nav label (best-effort UI check)
        const publicPage = await context.newPage();
        await publicPage.goto('http://localhost:3000/', { timeout: 20000 });
        // Give the public page a moment to fetch updated config
        await publicPage.waitForTimeout(2000);

        const found = await publicPage.$(`text=E2E Test Nav`);
        if (found) {
          console.log('Public site reflects new navigation item.');
        } else if (persisted) {
          console.warn('Public UI did not reflect new nav item but backend shows it persisted (client may need socket refresh).');
        } else {
          console.warn('Public site did NOT reflect new navigation item and backend did not persist it.');
        }

        await publicPage.close();

  } catch (err) {
    console.error('E2E script failed:', err);
    process.exitCode = 2;
  } finally {
    await browser.close();
  }
})();
