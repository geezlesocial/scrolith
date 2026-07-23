# Performance Validation

## Scope

This document records the Prisma pool timeout remediation validation for the Scrolith backend messaging release.

The validation target is a new backend candidate deployed at `0%` production traffic. No production rollout is authorized by this document.

## Required Gates

- Production backend build.
- Repository regression.
- Messaging regression.
- Authentication regression.
- Sustained candidate load validation.
- Candidate log validation with zero active Prisma pool timeout or `P2024` matches.
- Cloud SQL health validation.

## Load Profile

The sustained validation uses direct candidate revision traffic, not production traffic. It exercises read-only public endpoints and health checks to create repeated database-backed request pressure without automated production writes.

Observed metrics must include:

- Request count.
- Concurrency.
- Status code distribution.
- Latency distribution.
- Active Prisma timeout matches.
- Active `P2024` matches.
- HTTP 5xx count.
- HTTP 429 count.
- Cloud Run instance health.
- Cloud SQL CPU, memory, and backend sessions.

## Current Status

Pre-deployment validation is in progress.

Production traffic remains unchanged:

- Backend: `scrolith-backend-00152-9tk` at `100%`
- Frontend: `scrolith-frontend-00181-hdk` at `100%`

Failed rollout candidates remain at `0%`:

- Backend: `scrolith-backend-00269-xer`
- Frontend: `scrolith-frontend-00313-dep`

Final performance evidence will be recorded in `docs/evidence/prisma_pool_timeout_analysis.json`.
