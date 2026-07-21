# Phase 29.7 — Production Deployment & Certification Report

| Field | Value |
|-------|--------|
| **Phase** | 29.7 |
| **Date** | 2026-07-21 |
| **Result** | **PASS** |
| **Staged rollout** | Internal tag → 5% → 25% → **100%** |
| **productionCertified** | **true** |

---

## 1. Pre-deployment validation

| Check | Result |
|-------|--------|
| Secrets present (`DATABASE_URL`, `JWT_SECRET`, FCM, OAuth callbacks) | PASS (Cloud Run secret refs intact) |
| Cloud SQL `scrolith-postgres-prod` | RUNNABLE; Cloud SQL Auth Proxy connected |
| On-demand SQL backup | **Created** (description `phase29.7-pre-promote-*`) |
| Redis / socket stack | Unchanged platform config; `/community` namespace retained |
| Storage (GCS buckets) | Unchanged env on service |
| Rollback assets | Prior revisions retained: BE `scrolith-backend-00130-4zb`, FE `scrolith-frontend-00167-7gk` |
| Phase 29.6 certification | PASS (`a3ad1ff7`) |

---

## 2. Message Privacy fix (web mobile + mobile app)

### Root cause

Mobile conversation shell uses `fixed … z-[80]`. Messaging privacy opened via `MobileDialog` at default **`z-50`**, so the privacy sheet rendered **behind** the conversation on:

- Mobile web browsers  
- Capacitor Android WebView (same Messages UI)

Secondary gaps:

- Privacy only reachable from conversation menu (easy to miss / clip on mobile)  
- Last-seen intentionally suppressed on mobile (`!isMobileViewport && otherLastSeen`)

### Fix (geezle `4402ba14`)

| Change | Detail |
|--------|--------|
| Privacy dialog | `zIndexClassName="z-[200]"` |
| Inbox entry | Shield button `messages-inbox-privacy-btn` opens global privacy without active chat |
| Conversation menu (mobile) | Fixed bottom sheet `z-[160]` with backdrop |
| `manage_settings` | No longer blocked by `actionBusy` / missing convo |
| Last seen | Shown on mobile when privacy allows |
| Touch targets | Larger switches/radios + `touch-manipulation` |
| Group overlays | Manage `z-[180]`, Create `z-[190]` |

### Verification

Live production Messages chunk after promote:

- `Messaging privacy` **present**  
- `messages-inbox-privacy` **present**  
- `messaging-privacy-panel` **present**  
- `z-[200]` **present**  

Unit: `tests/unit/phase297MessagingPrivacyMobile.test.ts` PASS.

---

## 3. Migration execution

| Migration | Status |
|-----------|--------|
| `20260721140000_phase291_enterprise_messaging_groups` | **APPLIED** |
| `20260721160000_phase295_messaging_groups_search_indexes` | **APPLIED** |

Method: Cloud SQL Auth Proxy `127.0.0.1:5433` + `scripts/phase297-apply-migrations.mjs` (additive SQL + `_prisma_migrations` insert).

### Schema integrity (post-apply)

| Check | Result |
|-------|--------|
| `ConversationVisibility.SECRET` | Present |
| Columns `joinPolicy`, `messagingMode`, `slowModeSeconds`, `memberCount` | Present |
| Search/analytics indexes (29.5) | Present |
| Prior privacy columns (22.3B) | Present (unchanged) |
| Destructive ops | None |

---

## 4. Backend deployment

| Item | Value |
|------|--------|
| Image | `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-backend:p297` |
| Revision | **`scrolith-backend-00199-hef`** |
| Tag URL | https://p297---scrolith-backend-25ysnpjdda-as.a.run.app |
| Traffic | **100%** |
| Prior (rollback) | `scrolith-backend-00130-4zb` |

### Smoke

| Check | Result |
|-------|--------|
| `/api/health` (prod + tag) | 200 OK |
| `/api/messages/settings/privacy` unauth | 401 (auth required) |
| Container healthy | Ready after deploy (~2m) |
| Cloud SQL attachment | Unchanged annotation |

---

## 5. Frontend deployment

| Item | Value |
|------|--------|
| Image | `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-frontend:p297` |
| Revision | **`scrolith-frontend-00267-qob`** |
| Tag URL | https://p297---scrolith-frontend-25ysnpjdda-as.a.run.app |
| Traffic | **100%** |
| Entry asset | `index-Ck3ZPIc8.js` |
| Messages chunk | `Messages-Cqm3zhip.js` (privacy fix verified) |
| Prior (rollback) | `scrolith-frontend-00167-7gk` |

---

## 6. Staged rollout

| Stage | BE | FE | Notes |
|-------|----|----|-------|
| Internal (tag) | p297 0% | p297 0% | Health + privacy UI strings OK |
| 5% | 00199-hef 5% / 00130 95% | 00267 5% / 00167 95% | API health OK |
| 25% | 25% / 75% | 25% / 75% | API health OK |
| 100% | **100%** | **100%** | Live privacy chunk confirmed |

---

## 7. Android readiness

| Item | Status |
|------|--------|
| Production API host | `https://api.scrolith.com` (unchanged) |
| Privacy / groups UX | Served via Capacitor WebView from production FE — **fixed with FE promote** |
| Push / deep links / reconnect | Prior Phase 27/29 contracts retained; no native shell change required for privacy |
| Production AAB | **Not built** — no native code change; rebuild only if Play store binary refresh requested |

---

## 8. Post-deployment feature validation

| Area | Status |
|------|--------|
| DM | Unchanged path; group gates only for `GROUP` |
| Group create / invites / permissions | Schema + BE APIs live (29.1–29.5) |
| Realtime `/community` | Single namespace retained |
| Search / discovery / analytics | Indexes applied |
| Admin messaging-groups | Deployed with BE |
| SECRET isolation | Enum + discovery filters live |
| Message Privacy mobile | Fixed and live |
| Migrations non-destructive | PASS |

---

## 9. Monitoring (first-hour checklist)

Watch for:

- Elevated 5xx on `/api/messages/*`  
- Socket disconnect storms on `/community`  
- Cloud SQL CPU / connection saturation  
- Cloud Run memory / instance restarts on `00199-hef` / `00267-qob`  
- Privacy PATCH error rate  
- Group create / invite failures  

No sensitive fields (invite codes, message bodies) should appear in structured logs (`redactForLogs`).

---

## 10. Rollback

### Triggers

| Trigger | Action |
|---------|--------|
| Error rate spike / realtime instability | Traffic rollback to prior revisions |
| Data integrity concern | Stop traffic; investigate; restore from SQL backup only if required |
| Frontend privacy/UI regression | FE traffic → `scrolith-frontend-00167-7gk` |

### Application rollback (preferred)

```bash
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 \
  --to-revisions=scrolith-backend-00130-4zb=100

gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 \
  --to-revisions=scrolith-frontend-00167-7gk=100
```

### Migration rollback

Do **not** drop columns or enum values in production. Additive schema is forward-compatible with prior app revisions for unused columns. Indexes may be dropped with `DROP INDEX IF EXISTS` only if proven harmful.

---

## 11. Commits & artifacts

| Repo | Commit | Notes |
|------|--------|-------|
| geezle | `4402ba14` | Message Privacy mobile fix |
| monorepo | `9da91728` | Migration tooling + submodule |
| monorepo | `a3ad1ff7` | Phase 29.6 certification (prior) |

Scripts: `geezle-backend/scripts/phase297-apply-migrations.mjs`, `phase297-inspect-migrations.mjs`.

---

## 12. Rollout outcome

**SUCCESS.** Enterprise Messaging Groups (Phases 29.0–29.6) are live in production with additive migrations applied, backend and frontend fully promoted, and Message Privacy restored on mobile web and Android WebView.

---

## 13. Residual / follow-ups

| Item | Severity | Notes |
|------|----------|-------|
| Multi-instance abuse buckets | Medium | Known from 29.6; monitor |
| Optional Android AAB refresh | Low | Only if Play binary update desired |
| Formal 24h soak metrics | Info | Continue monitoring |
| Dual tag `p202-kyc` on BE 00199 | Info | Harmless tag alias from Cloud Run tag slot reuse |
