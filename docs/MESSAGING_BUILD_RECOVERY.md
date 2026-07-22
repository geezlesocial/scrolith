# Messaging Build Recovery

Date: 2026-07-23

## Scope

This recovery unblocked the backend production TypeScript build after the messaging URL and group-member resolver implementation.

No Scrolitha provider configuration was changed. Phase 33.4 was not started.

## Root Cause

The production build failed under `tsconfig.production.json` because existing source files had strict production type failures:

- Express handlers had mixed `Response` returns and bare `return` paths under `noImplicitReturns`.
- Boolean discriminated unions were checked with `!result.ok`; with this repository's `strictNullChecks: false`, TypeScript did not narrow those unions reliably.
- `Array.from(new Set(...))` and `Map` construction inferred `unknown[]` / `{}` in a few controller paths.
- A settings serializer omitted the camelCase `twoFactorEnabled` field that was assigned later.
- Notification preference merge attempted to spread an unguarded stored row.
- Scrolitha metadata and confirmation-token branches needed explicit primitive/discriminant narrowing.
- Recommendation section IDs were valid, but chained array/filter inference widened the ID literals to `string`.

Generated Prisma client drift was not the cause. `npx prisma generate` succeeded with Prisma Client `6.19.1`; `npx prisma validate` could not run locally because `DATABASE_URL` is not set in this shell.

## Build Evidence

- Before: `docs/evidence/messaging_release_backend_build_before.txt`
- After Prisma generate: `docs/evidence/messaging_release_backend_build_after_prisma_generate.txt`
- After repair: `docs/evidence/messaging_release_backend_build_after.txt`
- Final verify: `docs/evidence/messaging_release_backend_build_after_verify.txt`

Final backend production build result: PASS.

## Tests

Passing:

- `npx jest src/__tests__/groupMessaging.memberResolver.controller.test.ts src/__tests__/oauth.exchange.service.spec.ts src/__tests__/auth.login.controller.test.ts --runInBand`
- `npm run build:prod`
- Frontend `npm run build`
- Frontend focused URL/mention tests

Not completed locally:

- Full backend Jest suite. The suite imports `server.ts` in some tests, starts background Prisma sweeps, requires `DATABASE_URL`, and eventually hit Node heap limit in this environment. No production database was used for local tests.

## Deployment Status

Deployment was not performed in this pass because full backend test completion, production backup, authenticated candidate certification, staged rollout, and Android rebuild remain outstanding.
