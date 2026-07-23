# Backend Cloud Test Database Setup

Date: 2026-07-23

## Strategy

Local Docker is not required. The Docker-free validation path uses Google Cloud Build to start an ephemeral PostgreSQL 16 container inside the Cloud Build build network.

## Cloud Build Config

`geezle-backend/cloudbuild.messaging-regression-test.yaml`

The job:

- starts an ephemeral `postgres:16` container named `postgres-test`
- uses database `scrolith_test`
- constructs the test-only database URL inside `scripts/run-cloudbuild-test-command.mjs`
- applies Prisma migrations
- runs the test database guard
- runs production TypeScript build
- runs Node built-in tests
- runs the full Jest suite with open-handle diagnostics

## Safety Markers

Required environment markers:

- `NODE_ENV=test`
- `APP_RUNTIME=test`
- `DISABLE_BACKGROUND_WORKERS=true`
- `TEST_DB_KIND=cloudbuild-postgres`
- `TEST_DB_PROJECT=cloudbuild-ephemeral`
- `TEST_DB_INSTANCE=cloudbuild-ephemeral-postgres-test`
- `TEST_DB_NAME=scrolith_test`

The guard refuses execution if the URL or markers reference `scrolith-postgres-prod`, the production connection name, the production database name, or the production project as the test database project.

## Production Isolation

The Cloud Build test job does not connect to Cloud SQL and does not use Secret Manager production `DATABASE_URL`.
The Cloud Build YAML intentionally does not embed a full database URL.
