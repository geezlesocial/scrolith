# Backend Test Runtime Isolation

Date: 2026-07-23

## Runtime Policy

`geezle-backend/src/config/runtimePolicy.ts` centralizes test/runtime behavior:

- test runtime is detected from `NODE_ENV=test`, `APP_RUNTIME=test`, or `JEST_WORKER_ID`
- background workers are disabled in test runtime
- `DISABLE_BACKGROUND_WORKERS=true` disables background workers explicitly

## Startup Isolation

`server.ts` now uses the runtime policy before starting:

- HTTP listener
- registered scheduled jobs
- voice-call ringing sweep interval
- startup-only background tasks

The Scrolitha cache cleanup interval is also disabled when background workers are disabled.

## Test Runner Isolation

`jest.setup.cjs` sets safe local defaults for test runs, including:

- `NODE_ENV=test`
- `APP_RUNTIME=test`
- `DISABLE_BACKGROUND_WORKERS=true`
- local-only JWT defaults
- local frontend origins
- disabled notification digest/retention cron flags

Node built-in `node:test` specs are executed by `npm run test:node` through `scripts/run-node-test-files.mjs`, and Jest excludes those files so they are not misreported as empty suites.

## Current Status

- Server auto-listen side effect: removed for test runtime.
- Scrolitha cache cleanup side effect: removed for test runtime.
- Socket integration import: confirms server auto-start is skipped in test runtime.
- Node-test lane: PASS, 78 tests.
- Jest database-dependent suites: blocked until isolated PostgreSQL is available at `127.0.0.1:55432/scrolith_test`.
