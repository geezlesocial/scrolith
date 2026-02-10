Admin E2E Quick Run

Prerequisites
- Frontend dev server (SPA) running on http://localhost:3000
- Backend dev server running on http://localhost:5000
- Node 16+ installed

Admin test account (dev):
- Email: admin@local.test
- Password: adminpass

Run steps
1. Start backend (in a separate terminal):

```powershell
cd Scrolith-backend
npm run dev
```

2. Start frontend (in a separate terminal):

```powershell
cd C:\Projects\Scrolith
npm run dev
```

3. Run the E2E script (headless):

```powershell
node scripts/run_admin_e2e.mjs
```

What the script does (brief)
- Seeds admin token into the browser context (falls back to UI login if token not obtainable)
- Opens `Homepage Settings → Header & Hero → Navigation Bar`
- Adds a navigation item, toggles role visibility, clicks Save
- Adds a profile menu item and a guest CTA, toggles visibility, clicks Save
- Captures outgoing POST to `/api/cms/header` and the response
- Polls `GET /api/cms/header` on both proxy (3000) and backend (5000) to verify persistence
- Performs a best-effort public UI check on http://localhost:3000/

Interpreting results
- Console outputs include captured request payload and response JSON.
- Look for lines like:
  - "Captured header save payload:" and "Captured header save response:" (server returned saved config)
  - "Persisted item snapshot:" showing `label`, `url`, and `visibility` array
  - "Profile menu item persisted:" and "Guest CTA persisted:" for those checks

Notes
- The script expects the dev backend to accept authenticated saves. A temporary dev-only permissive POST route may exist to support unauthenticated local runs.
- If public UI doesn't reflect changes, ensure the frontend has received the socket event (check the browser console) or reload the page.

Troubleshooting
- If `node` exits with errors about Playwright, run:

```powershell
npm install
npx playwright install
```

- If the admin token cannot be obtained, the script will perform an interactive login; ensure the backend has the admin test user created.

Contact
- For follow-up, see `scripts/run_admin_e2e.mjs` and `src/dashboard/admin/HomepageSettings.tsx` for the selectors used.

