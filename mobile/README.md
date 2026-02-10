# Scrolith Mobile Wrapper (Capacitor)

This folder hosts the native shell project. It wraps the existing Vite web app in `Scrolith/`.

## One-time setup
1. Install dependencies:
   `npm install`
2. Build the web app:
   `cd ../Scrolith`
   `npm run build`
3. Sync Capacitor:
   `cd ../mobile`
   `npx cap sync`

## Dev workflows
Fast dev (runs Vite server in webview):
1. In `mobile/capacitor.config.ts`, set:
   `server.url = 'http://10.0.2.2:3000'` and `cleartext = true`
2. Start Vite:
   `cd ../Scrolith && npm run dev`
3. Open native project:
   `cd ../mobile && npx cap open android`

Production-like dev (bundled web assets):
1. `cd ../Scrolith && npm run build`
2. `cd ../mobile && npx cap sync`
3. `npx cap open android`

## Environment
Set these in `Scrolith/.env` (or your CI):
- `VITE_API_BASE_URL` (prod)
- `VITE_MOBILE_API_BASE_URL` (optional mobile override)


