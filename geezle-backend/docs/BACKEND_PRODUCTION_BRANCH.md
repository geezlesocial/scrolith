# Scrolith Backend Production Tracking Branch

## Branch

`release/backend-production`

## Why `main` is not the backend source of truth

`origin/main` is the monorepo frontend tip and only retains a 4-file PHP stub under
`geezle-backend/`. The production Node Express backend lives on the Phase 19/20
backend release lineage and is **not** an ancestor of `main`.

## Production runtime mapping

| Field | Value |
|-------|-------|
| Cloud Run service | `scrolith-backend` |
| Region | `asia-southeast1` |
| Revision (at branch creation) | `scrolith-backend-00078-zkp` |
| Traffic | 100% |
| Tag | `p202-kyc` |
| Image digest | `sha256:3f905fe2ac50ce1d7a8cf8db9326b6ee0dcba781d60c73bfe8bc0569210d6405` |
| Runtime source commit | `f28c315439330267d80a1d8c95c86d023c2b2e18` |
| Branch base (docs + runtime) | `b1094ae8` / tip advances with reviewed backend PRs |

## Lineage

```
d847ceae (Phase 19.2 feedback fabric)
  → 334bf6f3 (Phase 20.2 KYC foundation)
  → f28c3154 (rate-limit fix — production runtime)
  → b1094ae8 (Phase 20.2S source manifest)
  → release/backend-production (long-term tracking)
```

## Deployment workflow

1. Open backend PRs **against** `release/backend-production` (not `main`).
2. Run focused backend tests + production TypeScript build.
3. Build Cloud Run image from the backend Docker context (typically `geezle-backend/`).
4. Deploy as **tagged candidate with 0% traffic**.
5. Validate candidate; promote with traffic shift.
6. Tag release: `backend-prod-YYYYMMDD-<shortsha>`.

## CI implications

- Backend CI should target `release/backend-production` and paths under `geezle-backend/`.
- Do not require backend CI to pass only on `main` until the monorepo is structurally reunified.

## Rollback source

- Cloud Run previous revision (e.g. prior 100% revision).
- Git: last known-good tag on `release/backend-production`.

## Branch protection recommendation

- Require PR reviews for `release/backend-production`.
- Disallow force-push.
- Require status checks for backend unit tests / build when available.

## Rules for future backend changes

1. All production backend changes land on `release/backend-production` first.
2. Never force public KYC storage or weaken KYC RBAC without security review.
3. Migrations must be additive and backward compatible.
4. Frontend-only work stays on `main` / frontend feature branches.
5. Future monorepo reunification: a separate architecture PR may reintroduce the Node tree into `main`; until then, this branch is authoritative for production backend.

## Relationship to PR #55

PR #55 targeted `main` and conflicts structurally. It is **superseded** by this branch
for production tracking. Runtime source remains `f28c3154` (+ subsequent reviewed commits on this lineage).

## Synchronization with broader monorepo

Backend production deploys **do not** require merging into `main`. Frontend deploys continue from `main`. Shared contracts should be documented; full monorepo unification is out of scope for Phase 20.2T.
