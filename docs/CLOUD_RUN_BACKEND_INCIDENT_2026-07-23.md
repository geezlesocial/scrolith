# Cloud Run Backend Incident - 2026-07-23

## Scope

Production traffic rollout for messaging release candidate backend revision `scrolith-backend-00262-dif` reached 100% and was rolled back after Cloud Run returned platform errors.

Initial rollback targets were preserved:

- Backend: `scrolith-backend-00152-9tk`
- Frontend: `scrolith-frontend-00181-hdk`

Current production traffic remains unchanged after this investigation:

- Backend: `scrolith-backend-00152-9tk` at 100%
- Frontend: `scrolith-frontend-00181-hdk` at 100%

## Failure Window

UTC window: `2026-07-23T06:38:00Z` to `2026-07-23T06:48:00Z`.

Observed failures:

- Three HTTP 500 responses at `2026-07-23T06:43:31Z`.
- One HTTP 429 response at `2026-07-23T06:43:31Z`.
- Cloud Run platform message: `The request was aborted because there was no available instance.`
- Affected requests were API preflight/read traffic, including community ads and recommendation endpoints.

## Root Cause

Root cause is confirmed as Cloud Run cold-start and scale-out saturation caused by backend runtime startup blocking on Prisma CLI work.

The failed backend image used `geezle-backend/Dockerfile.storyfix.runtime` with:

```sh
npm run migrate:apply && node -r ts-node/register/transpile-only src/server.ts
```

`npm run migrate:apply` runs:

```sh
npx prisma migrate deploy && npx prisma generate
```

That work executed on every Cloud Run instance startup before the Node server could listen on port `8080`. During rollout, the revision had one active instance, then scaled out to the service `maxScale` of `5`. New instances were not yet available while they were running startup work, and Cloud Run returned `no available instance`.

## Contributing Factors

- Service `maxScale` was `5`.
- `minScale` was unset, so cold starts were possible.
- The backend has a Prisma connection limit of `5` per instance with `pool_timeout=15`.
- Prisma pool timeout logs appeared after scale-out, but after the first Cloud Run platform failures.
- Browser/API fan-out included preflight and read requests during the rollout window.

## Ruled Out

- Cloud Run CPU, memory, concurrency, timeout, service account, Cloud SQL attachment, startup probe, and sidecar shape differed only by image digest.
- No container crash or OOM evidence was found.
- Cloud SQL was not saturated in the failure window.
- The first failures were Cloud Run platform `no available instance` responses, not application-level CORS or auth failures.

## Remediation

The backend runtime image was changed so Cloud Run instances start the compiled server directly:

```sh
node dist/server.js
```

Production migration/generate work is no longer performed inside the Cloud Run request-serving container startup path.

## Evidence

See:

- `docs/evidence/cloud_run_failed_revision_logs.json`
- `docs/evidence/cloud_run_revision_config_diff.json`
- `docs/evidence/cloud_run_metrics_analysis.json`
- `docs/evidence/cloud_sql_capacity_analysis.json`

