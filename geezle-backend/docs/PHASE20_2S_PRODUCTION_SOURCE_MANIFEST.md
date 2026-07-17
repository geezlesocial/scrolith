# Phase 20.2S — Production Backend Source Manifest

## Production runtime (authoritative)

| Field | Value |
|-------|-------|
| Service | scrolith-backend |
| Region | asia-southeast1 |
| Revision | scrolith-backend-00078-zkp |
| Traffic | 100% |
| Tag | p202-kyc |
| Image digest | sha256:3f905fe2ac50ce1d7a8cf8db9326b6ee0dcba781d60c73bfe8bc0569210d6405 |
| Image tag | p202-kyc-fix |
| Cloud Build ID (fix) | 2340362a-4116-4cd5-8981-01259bce8ebf |
| Build source | Cloud Build storageSource tarball (not labeled with git SHA in build metadata) |

## Git mapping

| Field | Value |
|-------|-------|
| Production source commit | f28c315439330267d80a1d8c95c86d023c2b2e18 |
| Parent feature commit | 334bf6f351ddb00daa0361dbf212538169120728 |
| Pre-KYC production base | d847ceae (Phase 19.2 feedback fabric merge) |
| Branch containing tree | feat/phase20-secure-kyc-foundation-release |
| Clean reconcile branch | reconcile/phase20-secure-kyc-production (points at f28c3154) |

## Diff vs pre-KYC base (d847ceae..f28c3154)

Exactly 20 geezle-backend paths (Phase 20.2 scope only):

- docs/PHASE20_KYC_SECURITY_FOUNDATION.md
- prisma/migrations/20260717120000_phase20_secure_kyc_foundation/migration.sql
- prisma/schema.prisma
- src/controllers/kyc.controller.ts
- src/middleware/rbac.middleware.ts
- src/routes/admin/kyc.routes.ts
- src/routes/admin/users.routes.ts
- src/routes/kyc.routes.ts
- src/services/kyc/** (services + unit tests)
- src/services/rbac.service.ts

## Why origin/main is not the long-term backend branch

- origin/main tracks a **frontend-heavy monorepo tip** and only retains a **4-file PHP stub** under geezle-backend/ (not the Node Express production backend).
- f28c3154 / d847ceae are **not ancestors** of origin/main.
- Cherry-picking Phase 20.2 onto main yields modify/delete conflicts and cannot restore full production backend parity.
- Cloud Run production is built from the **Node geezle-backend tree** present on the Phase 19/20 backend lineage, not from main's PHP stubs.

## Long-term branch recommendation

LONG_TERM_BACKEND_BRANCH=**proposed** `release/backend-production` @ `f28c3154`

Owner approval required before creating permanent `release/backend-production` (AGENTS convention: do not invent long-term release branches without approval).

Until then, production-tracking Git truth:

`feat/phase20-secure-kyc-foundation-release` @ `f28c3154`

## PR #55 disposition

- Base: main · Head: feat/phase20-secure-kyc-foundation-release
- Status: OPEN, mergeable=CONFLICTING (DIRTY)
- Root cause: structural monorepo divergence (main lacks full geezle-backend)
- Action: do not force-merge; close or retarget after owner selects long-term backend branch strategy

## Environment-only production configuration (not in Git)

- KYC_GCS_BUCKET=scrolith-prod-kyc-private
- CLAMAV_HOST=127.0.0.1 · CLAMAV_PORT=3310 · CLAMAV_MODE=tcp
- ClamAV sidecar via Cloud Run multi-container (container-dependencies app→clamav)

## Parity statement

Application source for production KYC foundation matches f28c3154 content for the 20 scoped files. Runtime image may include Dockerfile/build-context packaging of the full geezle-backend tree from that commit lineage. No unexplained functional KYC differences identified between Git tip f28c3154 and live revision 00078-zkp behavior exercised in Phase 20.2S matrix.
