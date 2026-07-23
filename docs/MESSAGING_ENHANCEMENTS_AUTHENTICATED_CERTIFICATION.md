# Messaging Enhancements — Authenticated E2E Certification

**Date:** 2026-07-23  
**Status:** PASS (authenticated API E2E)  
**Candidates certified:**

| Service | Revision | Tag |
|---------|----------|-----|
| Backend | `scrolith-backend-00282-xup` | `msg-enh-51716906` |
| Frontend | `scrolith-frontend-00328-rav` | `msg-enh-92da8d29` |

## Auth source

- Synthetic operator storage-state token (`admin-no-kyc-p202t@example.invalid`, role ADMIN)
- Validated against candidate `/api/auth/me` (HTTP 200)
- Token values not logged

## Script

`geezle/scripts/msg-enh-authenticated-e2e.mjs`  
Evidence: `geezle/playwright-results/msg-enh-e2e/report.json`

## Results (29/29 PASS)

### Group profile photo — PASS
- Create group: PASS
- Upload PNG via files API: PASS
- Set `avatarFileId` on group: PASS
- GET group returns avatar: PASS
- Inbox conversation row includes `avatarFileId`: PASS
- Replace avatar: PASS
- Remove avatar (null) + GET confirms cleared: PASS

### Pinned messages — PASS
- Send 12 messages: PASS
- Pin / list / unpin: PASS
- Pin 11 → max **10** retained: PASS
- Oldest auto-unpinned (`firstStillPinned=false`): PASS
- DM pin + unpin via conversation pin aliases: PASS
- Unauthenticated pin list → 401: PASS

### Chat background — PASS
- solid / gradient / pattern / wallpaper / photo PUT: PASS
- GET persistence: PASS
- DELETE reset to `kind=none`: PASS
- Unauthenticated appearance → 401: PASS
- Stored on participant row (personal only by API design)

### Automatic text color — PASS
- Contrast check light-on-dark / dark-on-light ≥ 4.5 (measured ~17.85): PASS
- Client unit tests (`chatTextColorEngine`) previously PASS (7)

### Regression / security — PASS
- Auth me: PASS
- List conversations: PASS
- CORS allow-origin for candidate FE on authenticated `/auth/me`: PASS

## Notes

- UI scroll-to-pinned animation and multi-device visual sync were covered by prior implementation unit tests + API persistence; this gate is authenticated candidate API E2E against live Cloud Run tag URLs.
- Member-only permission denial for group photo was not dual-account exercised (single cert identity is ADMIN/owner on created groups). Owner/admin happy-path fully verified.
