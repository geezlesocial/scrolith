# Cloud Run Backend Readiness

## Current Decision

`scrolith-backend-00269-xer` is not ready for production rollout.

## Reason

The corrected candidate fixed the CORS allowlist and preserved the startup remediation, but validation found Prisma connection pool timeout messages on the candidate revision.

This matches the release stop condition for `P2024`/Prisma pool exhaustion risk.

## Production State

- Backend production: `scrolith-backend-00152-9tk` at 100%
- Frontend production: `scrolith-frontend-00181-hdk` at 100%
- Corrected backend candidate: `scrolith-backend-00269-xer` at 0%
- Corrected frontend candidate: `scrolith-frontend-00313-dep` at 0%

Production health after stop:

- `https://api.scrolith.com/api/health`: 200
- `https://scrolith.com/`: 200
- `https://scrolith.com/messages`: 200

## Passed Gates

- Context verified: `scrolith-500821`, `asia-southeast1`
- Backend build: PASS
- Regression Cloud Build: PASS, `4ee1f902-1ab3-4310-b316-7c8d447726e6`
- Candidate deployed at 0%: PASS
- CORS allowlist corrected: PASS
- Wildcard CORS disabled: PASS
- No production traffic changed: PASS
- No runtime Prisma migrate/generate startup command observed: PASS
- No Cloud Run `no available instance` observed: PASS

## Failed Gate

- Prisma pool timeout stop condition: FAIL

## Required Before Rollout

Investigate and remediate candidate Prisma pool timeout behavior without changing production traffic, then create a new 0% backend candidate and rerun validation.

