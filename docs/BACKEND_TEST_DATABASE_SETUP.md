# Backend Test Database Setup

Date: 2026-07-23

## Purpose

Backend automated tests must never use the production PostgreSQL database. The repository now has a disposable local PostgreSQL definition for integration and full-suite work.

## Local Test Database

Preferred command flow:

1. `cd C:\Projects\geezle-backend`
2. `npm run test:db:up`
3. `npm run test:db:wait`
4. Copy `.env.test.example` to ignored `.env.test` only if local overrides are needed.
5. `npm run test:db:prepare`
6. `npm run test:full`

Default isolated URL:

`postgresql://scrolith_test:local_test_password@127.0.0.1:55432/scrolith_test`

## Safety Guard

`scripts/run-test-db-command.mjs` loads safe test defaults, then `scripts/test-db-guard.mjs` refuses database prepare/reset operations unless:

- `NODE_ENV=test` or `APP_RUNTIME=test`
- `DATABASE_URL` contains `scrolith_test`
- `DATABASE_URL` contains `127.0.0.1:55432`

This guard passed locally with the disposable URL and correctly failed without explicit test runtime environment.

## Current Environment Result

Docker is not installed in this workstation shell:

- `docker --version`: command not found
- `docker compose version`: command not found

Because the isolated PostgreSQL service cannot be started here, database integration and full backend Jest certification remain blocked. No production database was used.
