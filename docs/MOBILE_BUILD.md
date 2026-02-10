# Scrolith Mobile Build Guide (Capacitor)

## Hard Rules
- Keep existing backend business rules intact (messaging, gigs/jobs, escrow).
- Keep dashboard route patterns and role permissions intact.
- Do not modify admin settings modules, finance core, payment core, or KYC admin approval core.

## Architecture
Hybrid: existing React + Vite app wrapped by Capacitor in `/mobile`.

## Setup
1. Install dependencies in the web app:
   `cd scrolith`
   `npm install`
2. Install dependencies for Capacitor shell:
   `cd ../mobile`
   `npm install`
3. Build web + sync native:
   `cd ../scrolith && npm run build`
   `cd ../mobile && npx cap sync`

## Dev Modes
- Fast dev: set `server.url` in `mobile/capacitor.config.ts` to `http://10.0.2.2:3000` (Android emulator).
- Bundled dev: run build + sync, then open native project.

## Environment (Mobile-safe)
Set one of:
- `VITE_MOBILE_API_BASE_URL` (preferred for mobile)
- `VITE_API_BASE_URL` or `VITE_BACKEND_URL`

Recommended:
- Android emulator: `http://10.0.2.2:5000/api`
- iOS simulator: `http://localhost:5000/api`
- Production: `https://api.scrolith.com/api`

## Deep Links
Handled in `scrolith/src/mobile/deeplinks.ts`.
Supported:
- `Scrolith://gigs/:id` -> `/gigs/:id`
- `Scrolith://jobs/:id` -> `/jobs/:id`
- `Scrolith://orders/:id` -> `/freelancer/dashboard?tab=orders&orderId=:id`
- `Scrolith://messages/:threadId` -> `/messages?thread=:threadId`
- `Scrolith://community/post/:id` -> `/community/post/:id`
- `Scrolith://auth/login` -> `/auth/login`

## Push Notifications
Client setup in `scrolith/src/mobile/push.ts`.
Backend device token endpoints:
- `POST /api/notifications/device/register`
- `POST /api/notifications/device/unregister`

Payloads must include `data.deepLink` for navigation.

## Uploaded Files SSOT
Use `scrolith/src/mobile/uploads.ts` for camera capture -> `/api/files/upload`.
All modules must choose assets from Uploaded Files.

## QA Checklist (Mobile)
- Auth persistence + role routing
- Gig/Job browse + detail
- Uploaded Files integration (camera + gallery)
- Messages realtime
- Push notification deep link routing
- Wallet + transactions
- KYC upload via Uploaded Files
- Community posts with media
- Ads payment methods from backend


