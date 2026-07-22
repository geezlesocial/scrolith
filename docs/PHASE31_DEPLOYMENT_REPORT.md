# Phase 31 — Enterprise Production Deployment Report

| Field | Value |
|-------|--------|
| **Phase** | 31 |
| **Date** | 2026-07-22 |
| **Scope** | Production deploy of Phase 29 (Enterprise Messaging Groups) + Phase 30 (Scrolith Human Verification) |
| **New product features** | **None** (deploy-only) |
| **Result** | **PASS** |
| **productionHealthy** | **true** |

---

## 1. Pre-deployment

| Check | Result |
|-------|--------|
| Cloud SQL instance `scrolith-postgres-prod` | RUNNABLE |
| On-demand SQL backup | **SUCCESS** — id `1784679551715`, description `phase31-pre-deploy-20260722-081908` |
| Cloud SQL Auth Proxy | Connected `127.0.0.1:5433` |
| Secret Manager `DATABASE_URL` | Present (used only for migrations via proxy) |
| Cloud Run env/secrets on BE | Unchanged (no IAM/DNS/SSL/scaling edits) |
| Rollback revisions captured | BE `scrolith-backend-00207-tew`, FE `scrolith-frontend-00279-xug` |

---

## 2. Migrations (additive only)

| Migration | Status | Validation |
|-----------|--------|------------|
| `20260721140000_phase291_enterprise_messaging_groups` | **ALREADY_APPLIED** | `SECRET` enum + join/messaging/memberCount columns |
| `20260721160000_phase295_messaging_groups_search_indexes` | **ALREADY_APPLIED** | 5 search/moderation indexes present |
| `20260722120000_phase30_human_verification` | **APPLIED** | 6 HV tables created |

Method: `geezle-backend/scripts/phase31-apply-migrations.mjs` via Cloud SQL Auth Proxy.

**Human Verification Master Enable remains OFF** (default). No production challenge enforcement until admin enable after verification.

---

## 3. Backend deployment

| Item | Value |
|------|--------|
| Image | `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-backend:p31` |
| Build IDs | `787b48fb-…` (first), `e1e3d16a-…` (schema UTF-8 fix rebuild) |
| Revision | **`scrolith-backend-00210-sih`** |
| Tag | `p31` |
| Traffic | **100%** (staged 5% → 25% → 100%) |
| Prior (rollback) | `scrolith-backend-00207-tew` |

### Build note

First deploy of image failed Prisma schema UTF-8 validation at container start (`migrate:apply`). Schema comment encoding was normalized; rebuild succeeded; second deploy healthy.

### Smoke (API)

| Check | Result |
|-------|--------|
| `/api/health` | 200 |
| `/api/auth/health` | 200 |
| `/api/human-verification/config` | 200, `required=false`, `masterEnabled=false` |
| `/api/human-verification/create` | 200, not required (`master_disabled`) |
| `/api/auth/login` empty body | 400 validation |
| `/api/support/categories` | 200 |
| `/api/messages/settings/privacy` unauth | 401 |
| `/api/admin/security/human-verification/settings` unauth | 401 |

---

## 4. Frontend deployment

| Item | Value |
|------|--------|
| Image | `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-frontend:p31` |
| Build ID | `80685cd7-6f91-406f-b0f7-7ad9db989e10` |
| Revision | **`scrolith-frontend-00281-qik`** |
| Tag | `p31` |
| Traffic | **100%** (staged 5% → 25% → 100%) |
| Prior (rollback) | `scrolith-frontend-00279-xug` |

| Check | Result |
|-------|--------|
| https://scrolith.com/ | 200 |
| /support | 200 |
| /auth/login | 200 |
| /auth/signup | 200 |
| Tag FE login | 200 |

Includes Phase 29 messaging groups UI + Phase 30 `<ScrolithHumanVerification />` (inactive while master disabled).

---

## 5. Android

| Item | Status |
|------|--------|
| Version | **1.1.33** (versionCode **43**) |
| AAB path | `mobile/release-artifacts/android-1.1.33/` (build during Phase 31) |
| API hosts | Production `api.scrolith.com` / `scrolith.com` (unchanged) |
| Play readiness | AAB produced for upload; store submission is operator-driven |

---

## 6. Feature flags / safety

| Flag | Post-deploy state |
|------|-------------------|
| Scrolith Human Verification master | **Disabled** (mandatory for this phase) |
| Endpoint toggles | Defaults ready; not enforced while master off |
| Messaging groups | Live from Phase 29 schema + BE/FE (already partially live; confirmed on p31) |

---

## 7. Rollback assets

See `docs/PHASE31_ROLLBACK.md`.

```bash
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00207-tew=100

gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00279-xug=100
```

Phase 30 tables are additive; rollback of app traffic does not require dropping tables.

---

## 8. Evidence

| Artifact | Path |
|----------|------|
| Rollback revisions | `docs/evidence/phase31_rollback_revisions.json` |
| Smoke results | `docs/evidence/phase31_smoke_results.tsv` |
| Migration script | `geezle-backend/scripts/phase31-apply-migrations.mjs` |
