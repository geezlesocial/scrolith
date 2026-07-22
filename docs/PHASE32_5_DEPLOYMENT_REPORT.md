# Phase 32.5 — Enterprise Notification Center Production Deployment Report

| Field | Value |
|-------|--------|
| **Phase** | 32.5 |
| **Date** | 2026-07-22 |
| **Scope** | Production deploy of Phases 32.0–32.4 (Notification Center) |
| **New product features** | **None** (deploy + migration + controlled activation only) |
| **Result** | **PASS** (with intentional DEFERRED items below) |
| **phase33Started** | **false** |

---

## 1. Repository audit

| Check | Result |
|-------|--------|
| Monorepo branch | `release/backend-production` |
| Monorepo HEAD | `f8114c68` (Phase 32.4) |
| Geezle branch | `main` |
| Geezle HEAD | `0091706a` (Phase 32.4 UI) |
| Phase 32.0–32.4 commits | All ancestors of HEAD (**PASS**) |
| Working tree | Unrelated dirty files present (not deployed); deploy used committed Phase 32 code + image builds |
| Project | `scrolith-500821` |
| Region | `asia-southeast1` |
| Migrations verified | `20260722140000` … `20260722180000` (exact dirs in repo) |

**PREDEPLOY_REPOSITORY_AUDIT=PASS**

### Prior production revisions (rollback)

| Service | Prior revision |
|---------|----------------|
| Backend | `scrolith-backend-00214-rid` (tag `p31sb`) |
| Frontend | `scrolith-frontend-00285-wep` |

### Release candidates

| Layer | Commit / tag |
|-------|----------------|
| Backend RC | monorepo `f8114c68` · image tag `p32` |
| Frontend RC | geezle `0091706a` · image tag `p32` |
| Android RC | versionName `1.1.34` · versionCode `44` |

---

## 2. Build & test gate

| Suite | Result |
|-------|--------|
| Backend Phase 32.0–32.4 unit | **44/44 PASS** (exit 0) |
| Frontend Phase 32 smoke/unit | **21/21 PASS** (exit 0) |
| Destructive migration scan | No `DROP TABLE` / `TRUNCATE` / `DELETE FROM` |

---

## 3. Configuration audit (presence only — no secret values)

| Item | Status |
|------|--------|
| DATABASE_URL (Secret Manager) | Present |
| JWT_SECRET | Present |
| FCM_SERVICE_ACCOUNT_JSON | Present |
| FIREBASE_PROJECT_ID | Present (`scrolith-platform`) |
| FRONTEND_URL / PUBLIC_APP_URL | Present |
| BACKEND_URL / API_BASE_URL | Present |
| CORS_ALLOWED_ORIGINS | Present |
| GCS buckets | Present |
| NOTIFICATION_DIGEST_CRON_ENABLED | **Set false** on p32 deploy (controlled) |

---

## 4. Backup & restore readiness

| Item | Value |
|------|--------|
| Instance | `scrolith-postgres-prod` (RUNNABLE, POSTGRES_16, asia-southeast1) |
| Backup ID | **`1784691767121`** |
| Description | `phase325-pre-deploy-20260722-114243` |
| Status | **SUCCESSFUL** |
| Method | `gcloud sql backups create --async` |

**PRODUCTION_BACKUP=PASS**  
**RESTORE_READINESS=PASS** (Cloud SQL on-demand restore procedure documented in Phase 31 rollback pattern)

---

## 5. Migration preflight & application

| Migration | Status | Validation |
|-----------|--------|------------|
| `20260722140000_phase320_notification_center_foundation` | **APPLIED** | 5 foundation tables |
| `20260722150000_phase321_notification_inbox` | **APPLIED** | inbox columns incl. pinnedAt |
| `20260722160000_phase322_preferences_digests` | **APPLIED** | 7 pref/digest tables + deliveryMode columns |
| `20260722170000_phase323_android_cross_device` | **APPLIED** | lifecycle/sync tables + DeviceToken metadata |
| `20260722180000_phase324_notification_operations` | **APPLIED** | 5 ops tables |

| Metric | Value |
|--------|--------|
| Notification row count before | 185 |
| Notification row count after | **185** (no loss) |
| Method | `scripts/phase325-apply-migrations.mjs` via Cloud SQL Auth Proxy `127.0.0.1:5433` |
| Evidence | `docs/evidence/phase325_migration_report.json` |
| Window | 2026-07-22T03:47:31Z → 03:47:34Z |

**PHASE32_MIGRATIONS_APPLIED=PASS**

---

## 6. Backend deployment

| Item | Value |
|------|--------|
| Image | `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-backend:p32` |
| Build ID | `96f28320-63b3-467a-9593-d81a6b0325ff` (**SUCCESS**) |
| Revision | **`scrolith-backend-00216-lig`** |
| Tag | `p32` |
| Traffic | **100%** (staged 5% → 25% → 50% → 100%) |
| Digest cron | `NOTIFICATION_DIGEST_CRON_ENABLED=false` |

### Revision smoke (tagged `p32`)

| Check | Result |
|-------|--------|
| `/api/health` | 200 |
| `/api/auth/health` | 200 |
| Notification user endpoints unauth | **401** |
| Admin ops unauth | **401** |
| HV create still not forcing challenges | required=false (endpoint_disabled path) |

---

## 7. Frontend deployment

| Item | Value |
|------|--------|
| Image | `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-frontend:p32` |
| Build ID | `543b50b7-c2b4-473c-a83d-9a1627fcea4c` (**SUCCESS**) |
| Revision | **`scrolith-frontend-00287-nul`** |
| Tag | `p32` |
| Traffic | **100%** (staged 5% → 25% → 50% → 100%) |

| Check | Result |
|-------|--------|
| https://scrolith.com/ | 200 |
| /auth/login | 200 |
| /support | 200 |
| p32 tagged FE | 200 |

Routes shipped: `/notifications`, `/settings/notifications`, Admin **Notification Ops**.

---

## 8. Controlled feature activation

| Capability | Production state |
|------------|------------------|
| Notification Center APIs + UI | **Live** (auth-gated; tables present) |
| Preferences / Quiet Hours / Focus | **Live** (user-controlled; no mass enable required) |
| Digests worker | **DISABLED** via `NOTIFICATION_DIGEST_CRON_ENABLED=false` |
| Campaigns / emergency fan-out | **Not executed**; no unrestricted campaign; no emergency broadcast |
| Retention purge worker | **Not enabled** |
| Cross-device sync APIs | **Live** (auth-gated) |
| Admin ops APIs | **Live** (admin RBAC) |

Recommended operator follow-up (not auto-run):

1. Enable digests only for allowlisted test users after dry-run.  
2. Turn on cron with monitoring: set `NOTIFICATION_DIGEST_CRON_ENABLED=true`.  
3. Campaigns remain manual admin action with batch limit.

---

## 9. Production smoke (summary)

| Area | Result |
|------|--------|
| API health | PASS |
| Auth enforcement on notification surface | PASS (401 unauth) |
| Admin ops enforcement | PASS (401 unauth) |
| Public site | PASS |
| Phase 31 HV still non-enforcing on challenge create path | PASS (required=false) |
| Unrestricted campaign | **Not sent** |
| Emergency broadcast | **Not sent** |

Authenticated end-to-end UI journeys (login as real user for inbox/settings) require operator session credentials — marked **DEFERRED** for interactive cert where automated tokens unavailable.

---

## 10. Android

| Item | Status |
|------|--------|
| versionName | **1.1.34** |
| versionCode | **44** |
| AAB | `mobile/release-artifacts/android-1.1.34/scrolith-1.1.34.aab` |
| SHA-256 | `42207058837E5B2BAE3E0B24996BE00237119D57D705AECFE0FE1DC5595EB617` |
| Play publish | **Not performed** (artifact retained; store upload operator-driven) |
| Device lab FCM physical cert | **DEFERRED** (physical device lab) |

---

## 11. Security

| Check | Result |
|-------|--------|
| Ownership on notification routes | Auth required |
| Full device tokens not in list API design | PASS (prefix only) |
| Secrets not logged | PASS |
| Campaign batch limit remains | PASS (code default 100) |
| Emergency requires reason/confirm | PASS (code path) |

---

## 12. Rollback

```bash
# Backend to prior System Backup revision
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00214-rid=100

# Frontend to prior
gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00285-wep=100
```

DB: restore from backup `1784691767121` only if schema rollback required (prefer traffic rollback first). Migrations are additive — leaving tables in place is safe if code rolled back.

See `docs/PHASE32_5_ROLLBACK.md`.

---

## 13. Known issues / deferred

1. **Digest worker** intentionally off in production env until controlled cohort enable.  
2. **GET /api/notifications/receipts** returns 404 (POST-only by design).  
3. **Interactive authenticated UI certification** DEFERRED without operator session.  
4. **Physical Android device cert** DEFERRED.  
5. Working tree had unrelated local dirt; production images built from Cloud Build source of respective roots.

---

## 14. Commits / artifacts added in 32.5

- `geezle-backend/scripts/phase325-apply-migrations.mjs`
- `geezle-backend/cloudbuild.p32-be.submit.yaml`
- `geezle/cloudbuild.p32-fe.submit.yaml`
- `docs/PHASE32_5_*` + evidence JSON
