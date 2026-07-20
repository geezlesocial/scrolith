# Phase 22.3A — Presence & Rich Delivery/Read Receipts Deployment & Certification

**Date:** 2026-07-20  
**Result:** **PASS** · `phase223Certified: true` · `promoteRecommended: true` · **PROMOTED 100%**

---

## Pre-deployment

| Check | Result |
|-------|--------|
| FE commit `26ccaadb` on origin/main | PASS (pushed) |
| BE monorepo `e7443284` on origin/release/backend-production | PASS (pushed) |
| Migration additive only | PASS |
| BE units 22.1/22.2/22.3 | PASS |
| FE units 22.1B/22.2/22.3 | 14/14 PASS |
| Phase 21 cert unit | **54/54 PASS** |

---

## Migration

| Field | Value |
|-------|--------|
| Name | `20260720160000_phase223_presence_receipts` |
| Status | **APPLIED** |
| DB | `scrolith-postgres-prod` / `scrolith` |

**Verified columns:**

- `User.presenceVisibility` TEXT DEFAULT `'EVERYONE'` (nullable-compatible)
- `ConversationParticipant.lastDeliveredAt` TIMESTAMP NULL
- Indexes: `..._lastReadAt_idx`, `..._lastDeliveredAt_idx`

Legacy rows remain valid (defaults / nulls).

---

## Deployment

| Service | Image | Revision | Staged | Promoted |
|---------|-------|----------|--------|----------|
| Backend | `scrolith-backend:p223` | `scrolith-backend-00156-jor` | 0% | **100%** |
| Frontend | `scrolith-frontend:p223` | `scrolith-frontend-00211-kev` | 0% | **100%** |

| Tag URLs |
|----------|
| BE: https://p223---scrolith-backend-25ysnpjdda-as.a.run.app |
| FE: https://p223---scrolith-frontend-25ysnpjdda-as.a.run.app |

**Rollback targets (prior p221b):**

- BE: `scrolith-backend-00154-cit`
- FE: `scrolith-frontend-00209-yet`

---

## Certification matrix

| Area | Result | Evidence |
|------|--------|----------|
| Presence heartbeat | **PASS** | POST `/messages/presence/heartbeat` 200 |
| Presence batch | **PASS** | GET `/messages/presence?ids=` 200 |
| Privacy EVERYONE/CONTACTS/NOBODY | **PASS** | PATCH privacy cycle |
| Receipt delivered watermark | **PASS** | POST receipts 200 |
| Receipt read watermark | **PASS** | POST read + lastReadAt |
| Delivery status field | **PASS** | Thread messages include delivery fields |
| DM send + 22.1 idempotent | **PASS** | dual POST same clientMessageId |
| Group create/members 22.2 | **PASS** | GROUP create + list members |
| Typing / recording (contract) | **PASS** | Unit + UI smoke (indicators wired) |
| Cross-platform e2e | **4/4 PASS** | desktop, 390, Pixel 7, iPhone 15 |
| Phase 21 regression | **PASS** | 54/54 + e2e shell |
| Phase 22.1 regression | **PASS** | idempotent send + mute units |
| Phase 22.1B Scroll | **PASS** | e2e scroll no `/home` |
| Phase 22.2 groups | **PASS** | API group create/members |
| Post-promote production API | **PASS** | full cert on `api.scrolith.com` |

Gate: `geezle/playwright-results/phase223/release-gate-summary.json`

```json
{
  "overall": "PASS",
  "phase223Certified": true,
  "promoteRecommended": true
}
```

---

## Promotion (executed)

```bash
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00156-jor=100

gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00211-kev=100
```

### Rollback

```bash
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00154-cit=100

gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00209-yet=100
```

Do **not** drop `presenceVisibility` / `lastDeliveredAt` on rollback.

---

## Production recommendation

**PROMOTE COMPLETE.** Phase 22.3 presence, receipt watermarks, and rich ticks are live at 100%.

Monitor heartbeats, receipt latency, and reconnect watermark sync for a short post-deploy window before starting later phases.
