# Phase 31 — Monitoring

## Services

| Service | Region | Ready | Serving revision (100%) |
|---------|--------|-------|-------------------------|
| `scrolith-backend` | asia-southeast1 | True | `scrolith-backend-00210-sih` |
| `scrolith-frontend` | asia-southeast1 | True | `scrolith-frontend-00281-qik` |
| Cloud SQL `scrolith-postgres-prod` | asia-southeast1 | RUNNABLE | tier `db-custom-1-3840`, ZONAL |

## Pre-deploy backup

| Field | Value |
|-------|--------|
| Backup ID | `1784679551715` |
| Window start | 2026-07-22T00:19:11Z |
| Status | SUCCESSFUL |
| Description | `phase31-pre-deploy-20260722-081908` |

## What to watch (first 24–48h)

### Cloud Run

- Request latency p50/p95 on `scrolith-backend`
- 5xx rate (target: no sustained spike vs pre-deploy)
- 429 rate (rate limit noise)
- Cold start / instance count anomalies
- Memory / CPU saturation

### Cloud SQL

- CPU / memory
- Connection count
- Slow queries (messaging + HV tables if master later enabled)

### Application signals

| Signal | Notes |
|--------|-------|
| Auth success/failure | Login/register should match baseline (HV off) |
| Support ticket create | Should match baseline |
| Group create / join | Messaging groups APIs |
| Socket `/community` | Disconnect/reconnect rates |
| Search latency | Group discovery indexes already present |
| HV generate/solve | Should be ~0 while master disabled |

### Human Verification (when enabled later)

- Challenges generated / solved / failed / expired
- Average solve time
- Top IPs / endpoints
- Admin analytics: `/api/admin/security/human-verification/analytics`

## Log queries (examples)

```text
resource.type="cloud_run_revision"
resource.labels.service_name="scrolith-backend"
severity>=ERROR
```

```text
resource.type="cloud_run_revision"
resource.labels.revision_name="scrolith-backend-00210-sih"
textPayload:"human-verification" OR textPayload:"HumanVerification"
```

## Alert thresholds (recommended)

| Metric | Soft | Hard |
|--------|------|------|
| 5xx rate | >1% for 5m | >3% for 5m → rollback review |
| Auth error spike | 2× baseline | 5× baseline |
| SQL CPU | >80% 10m | >90% 10m |
| Socket disconnect rate | 2× baseline | Investigate |

## Post-deploy snapshot (Phase 31 execution)

- BE/FE revisions Ready = True  
- SQL backups list includes phase31 pre-deploy SUCCESSFUL  
- Smoke suite: 13/13 PASS including HV master disabled  
