# Enterprise Messaging Enhancements — Candidate Deployment

**Date:** 2026-07-23  
**Status:** CANDIDATE READY (0% production traffic)  
**Operator action required before production rollout**

---

## Summary

Release candidate for:

1. Group profile photo (owner/admin upload)
2. Pinned messages (DM + group, max 10, realtime)
3. Per-user chat background / appearance
4. Adaptive WCAG-oriented text colors

Production traffic was **not** modified.

---

## Repository

| Item | Value |
|------|--------|
| Backend branch | `candidate/messaging-enhancements-be` |
| Backend commit | `5171690630a94e126b6cf63d700634e8ee0b581e` |
| Frontend branch | `candidate/messaging-enhancements` |
| Frontend commit | `92da8d290a7265065677d6cdab442b2ec3078838` |
| Remote | `git@github.com:geezlesocial/scrolith.git` |
| Merged to production branch | **No** |

Unrelated local changes (mobile AAB scripts, certification baselines, temp files) were **excluded** from commits.

---

## Validation (pre-deploy)

| Gate | Result |
|------|--------|
| Backend `build:prod` | PASS |
| Backend `tsc --noEmit` | PASS |
| Frontend `npm run build` | PASS |
| Messaging unit tests (BE appearance/pins) | PASS (10) |
| Frontend text-color engine tests | PASS (7) |
| Auth + messaging + CORS regression Jest | PASS (15 suites / 86 tests) |

---

## Candidate Cloud Run revisions

| Service | Revision | Tag | Traffic | URL |
|---------|----------|-----|---------|-----|
| Backend | `scrolith-backend-00282-xup` | `msg-enh-51716906` | **0%** | https://msg-enh-51716906---scrolith-backend-25ysnpjdda-as.a.run.app |
| Frontend | `scrolith-frontend-00328-rav` | `msg-enh-92da8d29` | **0%** | https://msg-enh-92da8d29---scrolith-frontend-25ysnpjdda-as.a.run.app |

Images:

- `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-backend:msg-enh-51716906`
- `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-frontend:msg-enh-92da8d29`

Frontend candidate is built with `VITE_API_URL` / `VITE_BACKEND_URL` pointing at the backend candidate tag URL.

### Production (unchanged)

| Service | 100% revision | Tag |
|---------|---------------|-----|
| Backend | `scrolith-backend-prisma-pool2` | `prisma-pool-cors` |
| Frontend | `scrolith-frontend-00313-dep` | `messaging-322ab66d` |

---

## Migration

Migration: `20260723150000_messaging_appearance_pins`

```sql
ALTER TABLE "ConversationParticipant"
  ADD COLUMN IF NOT EXISTS "chatAppearanceJson" JSONB;

ALTER TABLE "ConversationSettings"
  ADD COLUMN IF NOT EXISTS "pinPolicy" TEXT NOT NULL DEFAULT 'OWNER_ADMIN';
```

| Item | Value |
|------|--------|
| Status | **APPLIED** |
| Environment | Shared Cloud SQL (`scrolith-postgres-prod`) used by candidate + production |
| Destructiveness | None (additive only) |
| Production code impact | None (prod revisions do not read/write new columns) |
| Integrity check | participants=86, conversations=47 (pre-existing rows intact) |
| Columns verified | `chatAppearanceJson` (jsonb), `pinPolicy` (text default OWNER_ADMIN) |

> Note: There is no separate candidate database on this platform. Additive columns on the shared instance are required for candidate feature paths and are backward-compatible with current production revisions.

---

## Candidate smoke validation

| Check | Result |
|-------|--------|
| Backend `/api/health` | PASS (200) |
| Backend `/api/auth/health` | PASS (200) |
| Frontend root | PASS (200) |
| CORS preflight (candidate FE origin) | PASS |
| CORS preflight (https://scrolith.com) | PASS |
| Login invalid creds (candidate CORS header) | PASS (400 + Allow-Origin candidate) |
| Pins API without auth | PASS (401) |
| Appearance API without auth | PASS (401) |
| Production BE traffic still prisma-pool2 @ 100% | PASS |
| Production FE traffic still 00313-dep @ 100% | PASS |

Full authenticated E2E (upload group photo, pin, appearance save across devices) requires operator credentials / browser session and is the next gate before promotion.

---

## Rollback

Candidate traffic is already 0%. No production rollback required.

If a tagged candidate must be removed:

```bash
# Do NOT shift production traffic. Optional tag cleanup only.
gcloud run services update-traffic scrolith-backend --region=asia-southeast1 \
  --to-revisions=scrolith-backend-prisma-pool2=100
gcloud run services update-traffic scrolith-frontend --region=asia-southeast1 \
  --to-revisions=scrolith-frontend-00313-dep=100
```

Production remains on the revisions above until an explicit promote command is approved.

---

## Promote checklist (operator approval required)

1. Authenticated candidate browser certification (photo/pin/appearance/realtime)
2. Confirm migration remains applied (already done)
3. Stage traffic 5% → 25% → 100% with monitoring
4. Keep prisma-pool2 / 00313-dep as rollback targets

**Do not promote without operator approval.**
