# Favicon propagation & cache-bust verification

Purpose
- Quick steps to verify that a favicon saved in the Admin UI (`Homepage Settings → Header & Hero → Navigation Bar`) is applied across clients and that cache-busting works.

Prerequisites
- Dev server running from project root:

```bash
npm run dev
```

- Admin UI reachable at `http://localhost:3000/admin/dashboard` and you are signed in as an admin.

Manual verification (admin client)
1. Open the Admin UI: `http://localhost:3000/admin/dashboard` → **Homepage Settings** → **Header & Hero** → **Navigation Bar**.
2. Upload or change the favicon image and click **Save** (or wait for auto-save).
3. Observe the current browser tab icon — the admin client should update immediately (the admin UI applies a cache-busted href). If it does not, do a hard reload (`Ctrl+F5` or `Shift+F5`).

Quick checks (browser console)
- Print current favicon href(s):

```js
[...document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')].map(el => el.href)
```

- Show ContentContext `settings` (if available on the global window). In the dev client the context stores settings; you may also log `window.__APP_SETTINGS__` if you added that during debugging.

```js
// If your app exposes settings on window for debug:
console.log(window.__APP_SETTINGS__);

// Or inspect network: GET /api/platform/settings or GET /api/cms/header (varies by backend)
```

Verify propagation to other clients
1. Open a different browser or an Incognito window (so there is a separate cache/session).
2. Load the public site root (`http://localhost:3000/`) and check the favicon in that tab. It should show the new favicon once the client fetched settings or header config.

If the favicon is visible in the admin client but not in other clients
- Possible causes:
  - Client did not re-fetch updated settings (socket reconnection or background fetch failed).
  - Backend persisted the header only in CMS and not in canonical platform settings the client reads.
  - Aggressive browser caching.

Quick server check (curl)
- Check the header config endpoint (adjust path if your backend exposes a different route):

```bash
curl -i http://localhost:3000/api/cms/header
```

- Check platform settings endpoint:

```bash
curl -i http://localhost:3000/api/admin/platform-settings
```

What to try if propagation fails
- Hard-refresh other clients (Ctrl+F5) to bypass cache.
- Open the browser devtools Network tab and verify the browser requested the favicon URL — inspect the response status and content-type.
- In the Admin UI, after Save, verify in Network that `POST/PUT` to the header save endpoint returned 200 and inspect the response body for the persisted `favicon_url`.
- If the client is not re-fetching settings automatically, either:
  - Ensure `Socket` events are delivered (look for `cms:header_updated` or `settings:updated`), or
  - Force a re-fetch by calling the endpoint (see curl above) or by clicking Save in Admin UI again.

Developer quick-fix options
- The admin UI now applies the favicon immediately (cache-busted) for the current client and calls `mergeHeaderConfig` so `ContentContext` has the asset available.
- To force all clients to update automatically, implement one of:
  - Server: emit a `cms:header_updated` or `settings:updated` socket event after saving header config.
  - Client: set a short polling / re-fetch after a header save or on a socket reconnect.

Console snippet to force-apply favicon (dev only)
- Run this in any client to force the favicon to update immediately (cache-busted):

```js
(function applyFavicon(url){
  if(!url) return;
  const busted = url + (url.includes('?') ? '&v=' : '?v=') + Date.now();
  ['icon','shortcut icon'].forEach(rel => {
    let el = document.querySelector('link[rel="'+rel+'"]');
    if(!el){ el = document.createElement('link'); el.rel = rel; document.head.appendChild(el); }
    el.href = busted;
  });
})('https://example.com/path/to/favicon.png');
```

Notes
- Browsers may prefer `favicon.ico` or `png/svg` depending on platform; ensure the saved image is a supported format and the response `Content-Type` matches (e.g., `image/png`, `image/x-icon`).
- This doc is intended for rapid manual verification. I can add an automated Playwright check that uploads a favicon and asserts the admin client link href and a second client sees the updated favicon — ask if you want that.
