# Scrolith Mobile Wrapper (Capacitor)

This folder hosts the native shell project. It wraps the existing Vite web app in `geezle/`.

Repository layout note:
- `geezle/` is the Vite React web app.
- `mobile/` is the Capacitor native shell that bundles `geezle/dist`.

## One-time setup
1. Install dependencies:
   `npm install`
2. Build the web app:
   `cd ../geezle`
   `npm run build`
3. Sync Capacitor:
   `cd ../mobile`
   `npx cap sync`

## Dev workflows
Fast dev (runs Vite server in webview):
1. Start Vite:
   `cd ../geezle && npm run dev`
2. Point the native shell to your dev server (emulator example):
   `set CAP_SERVER_URL=http://10.0.2.2:3000`
3. Open native project:
   `cd ../mobile && npx cap open android`

Production-like dev (bundled web assets):
1. `cd ../geezle && npm run build`
2. `cd ../mobile && npx cap sync`
3. `npx cap open android`

## Environment
Set these in `geezle/.env` (or your CI) before building:
- `VITE_API_URL` (recommended) OR `VITE_BACKEND_URL` (both supported)
- Optional mobile-only override: `VITE_MOBILE_API_URL`

## Icons / Splash
Once you have final branding assets, place them under `mobile/assets/` and run:
`npx @capacitor/assets generate --android`


