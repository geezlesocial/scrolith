# Cloud Run Production Readiness

## Decision

Backend remediation candidate `scrolith-backend-00268-ruz` is ready for operator-approved staged rollout from a Cloud Run startup-readiness perspective.

Traffic promotion was not started.

## Candidate

- Backend candidate revision: `scrolith-backend-00268-ruz`
- Backend candidate tag: `readiness-192117d4`
- Backend candidate URL: `https://readiness-192117d4---scrolith-backend-25ysnpjdda-as.a.run.app`
- Backend image: `asia-southeast1-docker.pkg.dev/scrolith-500821/scrolith/scrolith-backend@sha256:6155490fbb6b467179f651ea8c13d6697937fcfa8f301e59453b938987705896`
- Frontend candidate revision preserved at 0%: `scrolith-frontend-00313-dep`

## Validation Summary

- Backend production TypeScript build: PASS
- Cloud Build backend image build: PASS
- Cloud Build full regression with frontend subproject included: PASS
- Candidate deploy at 0%: PASS
- Candidate read-only health/API smoke: PASS
- Candidate controlled read-only load: PASS
- Candidate logs: PASS

## Load Result

Read-only candidate load issued `287` endpoint checks across concurrency levels `1`, `5`, `10`, and `25`.

Result:

- HTTP 200: `287`
- HTTP 429: `0`
- HTTP 5xx: `0`
- Failed requests: `0`
- Candidate request logs after validation: `294` request entries, all HTTP 200

## Startup Result

Cloud Run reported:

- Revision ready: PASS
- App startup probe: PASS
- Container healthy: `53.31s`
- Runtime migration/generate mentions: `0`
- P2024 mentions: `0`
- `no available instance` mentions: `0`
- Error severity entries: `0`

## Rollout Condition

Do not promote traffic without explicit operator approval.

Recommended rollout after approval:

- Promote backend and corrected frontend candidates in a coordinated release.
- Use rollback targets `scrolith-backend-00152-9tk` and `scrolith-frontend-00181-hdk`.
- Monitor each stage before continuing.
- Stop immediately on 5xx, 429, P2024, auth/CORS regression, payment regression, data integrity issue, or Scrolitha routing regression.

## Not Performed

- No production traffic promotion.
- No Android build.
- No Phase 33.4 work.
- No Scrolitha provider configuration changes.

