# Messaging Full Regression Report

Date: 2026-07-23

## Status

Messaging release finalization remains blocked at the backend full-suite gate. Production deployment, staged rollout, production monitoring, and Android AAB rebuild were not performed.

## Completed

- Backend production build: PASS.
- Isolated database configuration: added.
- Test database safety guard: PASS with `127.0.0.1:55432/scrolith_test`; FAIL as designed without test runtime env.
- `npm run test:db:guard`: PASS.
- Background workers disabled in test runtime.
- Server auto-listen disabled in test runtime.
- Node built-in test lane: PASS, 78 tests.
- Focused Jest auth and group member resolver lane: PASS, 16 tests.
- Vitest-style Scrolitha AI specs now resolve through a Jest compatibility shim.

## Blocked

- Docker is not available, so `postgres-test` cannot be started locally.
- Full backend Jest suite cannot complete because database-dependent tests target the safe isolated test URL and receive connection failures at `127.0.0.1:55432`.
- Socket integration import now skips server auto-start under test runtime; its remaining failures are isolated PostgreSQL connection failures during fixture setup.
- Scrolitha AI database-backed Jest specs time out in hooks while waiting on unavailable isolated PostgreSQL.

## No Production Access

No Jest, Node-test, Prisma, or release-certification command was run against production. The only test database URL used in this phase was:

`postgresql://scrolith_test:local_test_password@127.0.0.1:55432/scrolith_test`

## Deployment Gate

Per directive, deployment is blocked until all required backend gates pass against an isolated non-production database.
