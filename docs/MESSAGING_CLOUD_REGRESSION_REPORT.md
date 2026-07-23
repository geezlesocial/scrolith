# Messaging Cloud Regression Report

Date: 2026-07-23

## Scope

Validate the pending messaging backend release without local Docker and without connecting tests to the production Cloud SQL database.

## Test Database

- Kind: Cloud Build ephemeral PostgreSQL
- Network: Cloud Build `cloudbuild`
- Database name: `scrolith_test`
- Production Cloud SQL: not used
- Production database URL: not printed or embedded in the test YAML

## Cloud Build Runs

- `05a11361-b84d-4722-bb2f-bff26e6fb858`: failed at production build; logs were not available because the initial config used Cloud Logging without log-writer access.
- `54f1c4cf-1598-47db-b474-d178a8c8589d`: failed at production build because `.gcloudignore` excluded `src/data/**`.
- `1d6e8b6d-ed1c-4b68-b108-a7ff567b4bbd`: reached full Jest; failed 28 suites / 58 tests.
- `efeecb82-a40c-447a-bad9-ab2ba8aff834`: reached full Jest after restoring existing test auth bypass flags; failed 22 suites / 36 tests.

## Passing Gates In Latest Run

- Ephemeral PostgreSQL startup: PASS
- `npm ci`: PASS
- Test DB wait: PASS
- Test DB guard: PASS
- Prisma migrate deploy: PASS
- Prisma generate: PASS
- Production TypeScript build: PASS
- Node/messaging contract tests: PASS

## Failing Gate

Full Jest suite: FAIL

Failed suites in latest run:

- `src/controllers/__tests__/aiController.scrolitha.policy.spec.ts`
- `src/__tests__/phase296.certification.unit.test.ts`
- `src/__tests__/community.ads.boost.prefill.test.ts`
- `src/__tests__/integration/socket.integration.test.ts`
- `src/__tests__/marketplace.boost.prefill.test.ts`
- `src/__tests__/intelligenceFeedback.unit.test.ts`
- `src/__tests__/messages.search.controller.test.ts`
- `src/__tests__/gcoin.edgecases.test.ts`
- `src/__tests__/gcoin.transfer.fees.test.ts`
- `src/__tests__/ad.payment.reconcile.test.ts`
- `src/__tests__/gcoin.transfer.donate.convert.test.ts`
- `src/__tests__/integration/payment.gateway.test.ts`
- `src/__tests__/maintenance.feedback.unit.test.ts`
- `src/__tests__/gcoin.endpoints.test.ts`
- `src/__tests__/gcoinService.unit.test.ts`
- `tests/unit/gcoinService.test.ts`
- `src/__tests__/community.ads.api.test.ts`
- `src/controllers/__tests__/notifications.create.authz.spec.ts`
- `src/controllers/__tests__/community.ads.controller.refund.spec.ts`
- `src/__tests__/gcoinEarningEngine.unit.test.ts`
- `tests/unit/gcoinEarningEngine.test.ts`
- `tests/unit/adService.test.ts`

## Release Decision

Blocked. No production backup, build, deploy, traffic shift, Android rebuild, or production validation was performed because the mandatory DB-backed regression matrix did not pass.
