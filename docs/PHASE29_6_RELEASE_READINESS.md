# Phase 29.6 — Release Readiness Checklist

| Field | Value |
|-------|--------|
| **Phase** | 29.6 |
| **Date** | 2026-07-21 |
| **releaseReadiness** | **PASS** |
| **deploymentPerformed** | **false** |
| **Blocked until** | Explicit Phase **29.7** authorization |

This checklist is the formal ops plan for Enterprise Messaging Groups production rollout. **Do not execute deploy steps until Phase 29.7 is authorized.**

---

## 1. Pre-flight (certification complete)

| # | Item | Status |
|---|------|--------|
| 1.1 | Phase 29.0–29.5 completion gates PASS | Done |
| 1.2 | Phase 29.6 certification report PASS | Done |
| 1.3 | Security certification PASS | Done |
| 1.4 | Performance / load / stress / soak PASS (local+design) | Done |
| 1.5 | Known issues documented | Done |
| 1.6 | No critical open defects | Done |
| 1.7 | Branch `release/backend-production` clean of uncertified feature work | Verify at 29.7 start |

---

## 2. Database

| # | Item | Action at 29.7 | Rollback |
|---|------|----------------|----------|
| 2.1 | Backup Cloud SQL (snapshot / export) | Required before migrate | Restore snapshot |
| 2.2 | Apply `20260721140000_phase291_enterprise_messaging_groups` | `prisma migrate deploy` (or approved pipeline) | Columns/indexes unused if app rolled back; enum values remain |
| 2.3 | Apply `20260721160000_phase295_messaging_groups_search_indexes` | After 29.1 succeeds | `DROP INDEX IF EXISTS` for new indexes |
| 2.4 | Verify `ConversationVisibility` includes `SECRET` | SQL check | N/A (enum additive) |
| 2.5 | Verify new tables/columns present | Schema check | Do not DROP columns used by live code |
| 2.6 | `EXPLAIN ANALYZE` sample catch-up / discovery queries | Ops | Tune indexes if needed |
| 2.7 | No destructive migrations | Confirm SQL | — |

**Order:** 29.1 migration → 29.5 migration → backend deploy → frontend deploy.

---

## 3. Backend (Cloud Run)

| # | Item | Action at 29.7 |
|---|------|----------------|
| 3.1 | Build & push image from certified commit | Cloud Build |
| 3.2 | Env: JWT, DB, Redis, FCM unchanged | Diff only if required |
| 3.3 | Feature flags (if any) for enterprise groups | Enable after smoke |
| 3.4 | Socket namespace remains `/community` only | Smoke |
| 3.5 | Health / readiness endpoints green | Smoke |
| 3.6 | Scale / CPU / memory | **Do not change** unless explicitly authorized |
| 3.7 | Secret Manager values | **Do not rotate** unless authorized |

---

## 4. Frontend

| # | Item | Action at 29.7 |
|---|------|----------------|
| 4.1 | Build Vite production bundle from certified monorepo/geezle commit | Cloud Build |
| 4.2 | GroupCreateWizard / GroupManagePanel / Messages integration | Smoke |
| 4.3 | Admin Messaging Groups page | Admin smoke |
| 4.4 | CDN/cache purge if applicable | Ops |
| 4.5 | Bundle size check (no unexpected jump) | Compare to prior |

---

## 5. Android

| # | Item | Action at 29.7 |
|---|------|----------------|
| 5.1 | Confirm push sound + channels (scrolith / v2) | Smoke on device |
| 5.2 | Notification routing to group conversation | Device |
| 5.3 | Deep link → Messages group | Device |
| 5.4 | Attachments / permissions / reconnect | Device |
| 5.5 | Background + foreground notifications | Device |
| 5.6 | AAB version if Play release needed | Separate authorization |

---

## 6. Redis & socket infrastructure

| # | Item | Action at 29.7 |
|---|------|----------------|
| 6.1 | Redis adapter connectivity | Health |
| 6.2 | Sticky sessions / multi-instance socket behavior | Smoke reconnect |
| 6.3 | Typing / presence storm resilience | Soft load |
| 6.4 | Monitor connection count / drop rate | Dashboard |

---

## 7. Monitoring, logging, alerts

| # | Item | Action at 29.7 |
|---|------|----------------|
| 7.1 | Structured logs free of invite codes / message bodies | Spot-check |
| 7.2 | Error rate alert baseline | Confirm |
| 7.3 | Latency p95 on `/api/messages/*` | Baseline after deploy |
| 7.4 | DB connection pool saturation | Watch during migrate + deploy |
| 7.5 | Socket disconnect spikes | Watch 1h post-deploy |

---

## 8. Rollback plan

| Scenario | Steps |
|----------|-------|
| Backend regression | Redeploy previous Cloud Run revision; keep migrations if non-breaking |
| Frontend regression | Redeploy previous frontend revision |
| Migration issue (pre-traffic) | Stop deploy; restore DB snapshot if needed |
| Migration applied, unused columns | Safe to leave; app code rollback ignores new columns |
| Indexes only problem | `DROP INDEX IF EXISTS` listed 29.5 indexes |
| Critical security issue | Immediate traffic rollback + incident process |

**Never:** rewrite production message history; force-push; delete `DirectMessage` rows as “rollback”.

---

## 9. Migration order (canonical)

```
1. Announce maintenance window if required (usually not for additive)
2. Cloud SQL backup
3. prisma migrate deploy  →  20260721140000_phase291_...
4. Verify SECRET enum + columns
5. prisma migrate deploy  →  20260721160000_phase295_...
6. Verify indexes
7. Deploy backend revision
8. Smoke API + socket
9. Deploy frontend revision
10. Smoke web + admin
11. Android smoke (push + open group)
12. Post-deploy validation (section 11)
13. Declare 29.7 complete only after smoke PASS
```

---

## 10. Feature verification (smoke tests)

| # | Smoke | Pass criteria |
|---|-------|---------------|
| S1 | Login | JWT session valid |
| S2 | Open DM | Send/receive |
| S3 | Create PUBLIC group | Wizard completes |
| S4 | Create SECRET group | Not in discovery |
| S5 | Invite join | Member appears |
| S6 | Join request flow | Approve/reject |
| S7 | Role change | Permissions apply |
| S8 | Announcement mode | Members cannot send |
| S9 | Slow mode | Gate ack / error |
| S10 | Lockdown | No non-owner send |
| S11 | Pin message | Visible to members |
| S12 | Search | Member results only |
| S13 | Discover | No SECRET |
| S14 | Typing multi-user | Multi-typer label |
| S15 | Catch-up after reconnect | Missed messages load |
| S16 | Admin overview | Metrics load |
| S17 | Admin action + audit | Row written |
| S18 | Export | Authorized admin only |
| S19 | Attachment | Upload + view |
| S20 | Push (Android) | Notification routes to group |

---

## 11. Post-deployment validation (first 24h)

| Window | Check |
|--------|-------|
| 0–15 min | Error rate, 5xx, socket connect failures |
| 15–60 min | p95 API latency, DB CPU, Redis memory |
| 1–6 h | Join/invite success rates, abuse signal volume |
| 6–24 h | Soak: no memory leak trend on Cloud Run instances |
| Day 2 | Review known issues; open follow-ups if needed |

---

## 12. Documentation readiness

| Doc | Status |
|-----|--------|
| Architecture (29.0) | Current |
| API / socket (29.0–29.2) | Current |
| Permissions (29.0–29.1) | Current |
| Admin (29.4) | Current |
| Search / analytics / security (29.5) | Current |
| Certification pack (29.6) | **This pack** |
| Deployment runbook | This checklist (29.7 executes) |

---

## 13. Sign-off template (for 29.7)

```
Date:
Backend revision:
Frontend revision:
Migrations applied: [ ] 29.1  [ ] 29.5
Smoke S1–S20: PASS / FAIL
Rollback plan reviewed: YES
Authorized by:
```

---

## 14. Certification statement

**releaseReadiness: PASS** — checklist complete, artifacts committed, deploy **not** performed. Await Phase 29.7 authorization.
