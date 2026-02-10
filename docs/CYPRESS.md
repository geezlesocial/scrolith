Cypress CI / Local usage

Purpose
- Explain how to run Cypress tests locally (against the dev proxy) and in CI (against a backend URL).

Defaults
- By default the test config uses `apiUrl: /api` which routes requests through the app's `baseUrl` (good for running the frontend dev server with Vite proxy).

Local (dev server + proxy)
1. Start frontend dev server (Vite):

```powershell
cd c:\Projects\Scrolith
npm run dev
```

2. Run Cypress (open):

```powershell
npx cypress open
```

CI (run tests against a backend URL)
- If your CI runs the frontend separately or you want tests to target a running backend directly, set `BACKEND_URL` or `CYPRESS_apiUrl`.

Example (target backend at http://backend-host:5000):

```bash
# Expose absolute API base to Cypress
export BACKEND_URL=http://backend-host:5000
npx cypress run
```

Or explicitly set the Cypress env variable:

```bash
CYPRESS_apiUrl=http://backend-host:5000/api npx cypress run
```

Notes
- If `CYPRESS_apiUrl` is provided it takes precedence. If `BACKEND_URL` is provided it will be converted to `${BACKEND_URL}/api`.
- When using the default `/api` proxy path, make sure your `Vite` dev server is running and proxying `/api` to your backend.

