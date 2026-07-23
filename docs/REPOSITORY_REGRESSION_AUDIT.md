# Repository Regression Audit

Date: 2026-07-23

Initial Cloud Build inspected: `efeecb82-a40c-447a-bad9-ab2ba8aff834`

Final backend regression Cloud Build: `d081ed72-817b-4404-b030-d408bd2f1d86`

Final frontend production build Cloud Build: `bedfb5ea-0359-4e52-80b2-b4d1055ca4a2`

## Summary

The failed regression run had a mix of harness problems, stale test contracts, missing test fixtures, a small direct-controller robustness defect, and legitimate product regressions in authorization, GCoin fallback rewards, and asynchronous engagement processing. The repaired repository is release-green in Cloud Build. No production deployment, production traffic change, production database write, or new production revision occurred during this recovery phase.

## Root Cause Groups

### Cloud Build Environment

- `phase296.certification`: backend-only Cloud Build source omitted monorepo frontend/docs artifacts required by the certification harness.
- Repair: run the regression source from the repository root while executing backend steps with `dir: geezle-backend`; preserve required frontend/docs artifacts in the submitted regression source.
- Follow-up repair: harden Cloud Build dependency installation to use a workspace-local npm cache after a shared npm cache extraction error.

### Authorization Harness

- `community.ads.boost.prefill`, `marketplace.boost.prefill`, `intelligenceFeedback`, `maintenance.feedback`: unauthenticated contract assertions were distorted by a global dev auth bypass.
- Repair: dev auth bypass now requires an explicit dev identity hint such as `x-dev-role`; unauthenticated requests remain unauthenticated.
- Product repair: community ad prefill now returns 403 for valid but unauthorized non-owner prefill requests instead of collapsing authorization failures into 400 validation errors.

### Test Fixtures

- `gcoin.endpoints`: missing `alice+seed@local.dev` and `bob+seed@local.dev` fixtures in the ephemeral migrated DB.
- Repair: add an idempotent test fixture seeder for Cloud Build ephemeral PostgreSQL, including deterministic seed users, wallets, a post, and complete GCoin settings.

### Stale Unit Mocks

- `adService`, `gcoinService`, `gcoinEarningEngine`: tests mocked `@prisma/client` constructor paths while services now use the shared `utils/prismaClient` singleton.
- Repair: update mocks to target the shared Prisma client and preserve behavioral assertions.

### Stale Controller Contracts

- `messages.search.controller`: test expected pre-membership-query mocks and legacy top-level array data, while the controller now returns `{ data: { results } }` and scopes via `conversationParticipant`.
- Repair: update the mock and assertions to validate membership scoping and current response shape.

- `notifications.create.authz`: test expected legacy direct notification creation response, while Phase 32 notification creation emits through `NotificationService.emit` and suppresses self-actor notifications.
- Repair: update assertions to preserve authorization checks and validate created/suppressed emit statuses.

- `community.ads.api`, `ad.payment.reconcile`, `payment.gateway`, `community.ads.controller.refund`: tests asserted legacy ad/payment flows after the current checkout, review, refund, and activation contracts changed.
- Repair: update fixtures and mocks to exercise the current payment gateway, hosted checkout, review status, and refund service contracts without weakening payment integrity assertions.

### Direct Controller Robustness

- `notifications.create.authz`: direct controller unit calls without `headers` crashed in request-id extraction.
- Repair: request-id extraction now tolerates missing `req.headers`.

### Scrolitha AI Routing

- `aiController.scrolitha.policy`: the policy test did not fixture the rollout access guard, so the controller returned 403 before exercising prompt-policy handling.
- Repair: mock the rollout guard in that unit test and keep the assertion that policy-blocked post enhancement returns 400 and writes a failed audit log.

### GCoin Eligibility Rules

- `gcoinEarningEngine`: the fixture did not model a monetization-eligible post after video integrity gating required explicit `clear` status.
- Repair: set the unit fixture video integrity status to `clear` and monetization profile to enabled.

### GCoin Accounting and Reward Fallbacks

- `gcoin.edgecases`, `gcoin.transfer.fees`, `gcoin.transfer.donate.convert`, `gcoin.endpoints`: test settings were incomplete after transfer, donation, and conversion gates became explicit.
- Repair: seed complete enabled settings in guarded test databases and assert the current fee/conversion behavior.
- Product repair: the reward fallback post now supplies a non-null title so legitimate rewards do not fail when a user has no existing eligible post.

### Socket Lifecycle

- `socket.integration`: the mocked ad draft used an invalid current payload, causing a validation failure before socket assertions could complete.
- Repair: update the integration payload to the current ad draft contract and retain socket lifecycle checks.

### Async Test Stability

- Late engagement threshold processing continued after Jest teardown and converted an otherwise passing Cloud Build into a failed build.
- Repair: await threshold processing only in test/runtime mode; production still uses the existing asynchronous behavior.

## Final Cloud Build Verification

- Backend production build: PASS
- Node tests: PASS
- Full Jest regression: PASS (`137` suites, `979` tests)
- Messaging regression: PASS
- Payment regression: PASS
- GCoin regression: PASS
- Ads regression: PASS
- Socket regression: PASS
- Scrolitha regression: PASS
- Frontend production build: PASS

The repository is release-green. Production deployment remains intentionally not started in this phase.
