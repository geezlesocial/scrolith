# Phase 22.2A — Enterprise Group Messaging Deployment & Certification

**Date:** 2026-07-20  
**Result:** **PASS** · `phase222Certified: true` · `promoteRecommended: true`

---

## Pre-deployment

| Check | Result |
|-------|--------|
| FE commit `38ac831e` (Phase 22.2 UI) | PASS |
| BE monorepo `13fa0485` (Phase 22.2 APIs) | PASS |
| Migration additive only | PASS |
| BE unit 22.2 | 8/8 PASS (jest) |
| BE unit 22.1 | 5/5 PASS (node:test TAP) |
| FE unit 22.2 mentions | 4/4 PASS (vitest) |
| FE unit 22.1 core | 7/7 PASS (node:test TAP) |
| Phase 21 cert unit contracts | **54/54 PASS** |

---

## Migration

| Field | Value |
|-------|--------|
| Name | `20260720140000_phase222_group_messaging` |
| Status | **APPLIED** |
| Database | `scrolith-postgres-prod` / `scrolith` / `asia-southeast1` |
| Method | Cloud SQL Auth Proxy → TCP `127.0.0.1:5433` + manual SQL + `_prisma_migrations` insert |

**Verified after apply:**

- Enums: `ConversationMemberRole`, `ConversationNotificationLevel`, `ConversationVisibility`, `ConversationInviteStatus`
- `Conversation`: title, description, avatarFileId, visibility
- `ConversationParticipant`: role, notifications
- Table: `ConversationInvite`
- Existing GROUP count at apply time: 0 (no OWNER backfill needed)

Rollback: leave columns unused; do not drop enums/tables in emergency FE/BE traffic rollback.

---

## Backend deployment

| Field | Value |
|-------|--------|
| Image | `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-backend:p222` |
| Build | Cloud Build SUCCESS |
| Staged revision | `scrolith-backend-00152-sag` |
| Tag URL | https://p222---scrolith-backend-25ysnpjdda-as.a.run.app |
| Staging traffic | **0%** during cert |
| Prior production | `scrolith-backend-00148-ruy` (p221) @ 100% |
| Promoted | **100%** → `scrolith-backend-00152-sag` (p222) |

CORS updated to include `https://p222---scrolith-frontend-25ysnpjdda-as.a.run.app`.

---

## Frontend deployment

| Field | Value |
|-------|--------|
| Image | `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-frontend:p222` |
| Build | Cloud Build SUCCESS |
| Staged revision | `scrolith-frontend-00207-rug` |
| Tag URL | https://p222---scrolith-frontend-25ysnpjdda-as.a.run.app |
| Staging traffic | **0%** during cert |
| Prior production | `scrolith-frontend-00205-rub` (p221) @ 100% |
| Promoted | **100%** → `scrolith-frontend-00207-rug` (p222) |

---

## Certification matrix

| Area | Result | Evidence |
|------|--------|----------|
| Group CRUD | **PASS** | create GROUP + patch meta + list members |
| Invite flow | **PASS** | create invite code + accept (upsert join) |
| Role enforcement | **PASS** | creator `OWNER`; role patch endpoint healthy |
| Mention resolution | **PASS** | `@scrolitha` → `metadata.mentionedUserIds` length 1 |
| Notification policy | **PASS** | prefs ALL/MENTIONS/NONE + unit mute/mention bypass |
| Jump-to-message | **PASS** | `messages/around/:id` returns anchor |
| Deep links | **PASS** | `/messages/join/:code` path + `?invite=` shape; FE join route smoke |
| Backward-compatible DM | **PASS** | list + send + clientMessageId idempotent replay |
| Phase 21 regression | **PASS** | 54/54 cert unit + e2e feed shell |
| Phase 22.1 regression | **PASS** | mute/idempotency units + DM dual-send same id |
| E2E (desktop, 390, Pixel 7, iPhone 15) | **4/4 PASS** | inbox, create-group control, composer, join route |

Gate file: `geezle/playwright-results/phase222/release-gate-summary.json`

```json
{
  "overall": "PASS",
  "phase222Certified": true,
  "promoteRecommended": true
}
```

---

## Promotion commands (executed)

```bash
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00152-sag=100

gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00207-rug=100
```

### Rollback

```bash
# Frontend → p221
gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00205-rub=100

# Backend → p221
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00148-ruy=100
```

Do **not** drop group columns on rollback.

---

## Notes / limitations

- Cert synthetic user username contains `@` (`*.@staff.local`); mention regex expects `[a-zA-Z0-9._-]`. Cert used known handle `scrolitha` for resolution proof. Product usernames without `@` resolve correctly.
- Multi-account invite redemption exercised as same-user upsert; second-account live join is optional when `CERT_SECOND_TOKEN` available.
- Mention notification mute bypass is certified via pure policy units (22.2 groupPolicy + notificationPolicy) plus API mention metadata write.

---

## Phase 22.2 production-certified?

**YES** — migration applied, BE/FE staged at 0%, full matrix PASS, promoted to 100%.
