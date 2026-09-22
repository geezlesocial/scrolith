# Scrolith Post-G2 Release-Gate Authorization

Status: **PENDING EXECUTION AUTHORIZATION**

This record contains only repository-verifiable facts and read-only Azure metadata. Proposed limits are not authorization. No G1, G3, G4, or G5 execution is authorized by this document.

## G1 — Authenticated DAST

- Staging API URL: `https://ca-scrolith-staging-api.yellowmushroom-b8714740.southeastasia.azurecontainerapps.io`
- Azure resource: `ca-scrolith-staging-api`
- Resource group: `rg-scrolith-staging`
- Container Apps environment: `cae-scrolith-staging`
- Proposed scope, pending owner approval: the staging API mount points below. This is an inventory, not approval:
  - `/api/cms`
  - `/api/homepage`
  - `/api/i18n`
  - `/api/admin`
  - `/api/admin/fx`
  - `/api/apps`
  - `/api/auth`
  - `/api/security`
  - `/api/dev`
  - `/api/oauth`
  - `/api/users`
  - `/api/profile`
  - `/api/location`
  - `/api/settings`
  - `/api/marketing`
  - `/api/commerce`
  - `/api/feed`
  - `/api/topics`
  - `/api/pipeline`
  - `/api/search`
  - `/api/search/v2`
  - `/api/discovery`
  - `/api/instant-graph`
  - `/api/discovery-engine`
  - `/api/professional-discovery`
  - `/api/ai`
  - `/api/gigs`
  - `/api/jobs`
  - `/api/freelancer`
  - `/api/employer`
  - `/api/freelancer/resumes`
  - `/api/client/resume-reviews`
  - `/api/resume`
  - `/api/categories`
  - `/api/admin/gigs-jobs`
  - `/api/wallet`
  - `/api/escrow`
  - `/api/withdrawal`
  - `/api/community`
  - `/api/scroll`
  - `/api/live`
  - `/api/posts`
  - `/api/marketplace`
  - `/api/contracts`
  - `/api/messages`
  - `/api/collaboration`
  - `/api/trust`
  - `/api/moderation/chat`
  - `/api/moderation/accounts`
  - `/api/reactions`
  - `/api/files`
  - `/api/favorites`
  - `/api/cart`
  - `/api/orders`
  - `/api/proposals`
  - `/api/plans`
  - `/api/kyc`
  - `/api/support`
  - `/api/human-verification`
  - `/api/gcoin`
  - `/api/reviews`
  - `/api/payments`
  - `/api/founding-partners`
  - `/api/admin/founding-partners`
  - `/api/currencies`
  - `/api/briefs`
  - `/api/notifications`
  - `/api/forms`
  - `/api/monetization`
  - `/api/payouts/stripe`
  - `/api/public/preloader`
  - `/api/public/v1`
  - `/api/public/developer`
  - `/api/reco`
  - `/api/recommendations/hiring`
  - `/api/match`
  - `/api/intelligence/feedback`
  - `/api/scrolitha`
  - `/api/phase3`
  - `/api/procurement`
  - `/api/ecosystem`
  - `/api/integrations`
  - `/api/insights`
  - `/api/admin/preloaders`
- Proposed safety limits, **NOT AUTHORIZED**: 1 request/second/account; 0.5 request/second/IP on sensitive routes; 1 upload/second/account; 1 AI request/10 seconds/account; 2 WebSocket connections/account; maximum 5 DAST workers.
- Test-account identifiers and roles: **PENDING OWNER INPUT**.
- DAST start/end UTC: **PENDING OWNER INPUT**.
- Maximum duration: **PENDING OWNER INPUT**.
- Emergency contact name and email/phone: **PENDING OWNER INPUT**.
- G1 approver, approval reference, and signature/electronic authorization: **PENDING EXPLICIT AUTHORIZATION**.

Evidence: route inventory `geezle-backend/src/server.ts:4545-4672`; proposed scope/limits `geezle-backend/docs/scrolith-external-evidence-gate-register.md` (G1 preparation section); staging URL/resource facts from read-only `az containerapp show` and `az containerapp env show` queries.

## G3 — Resilience and performance testing

- Proposed isolated environment only: `cae-scrolith-staging`, resource group `rg-scrolith-staging`.
- Environment owner: **PENDING OWNER INPUT**.
- Virtual users, request rate, load/spike/soak durations and profiles: **PENDING OWNER INPUT**.
- p95, p99, error-rate, CPU, memory, PostgreSQL, Redis, and recovery thresholds: **PENDING OWNER INPUT**.
- Budget approval: **PENDING EXPLICIT AUTHORIZATION**.
- Proposed rollback process, **NOT AUTHORIZED**: stop the test; preserve redacted logs/metrics; restore the previously approved staging revision/image; verify health, database, Redis, queues, logs, and metrics; record evidence.
- Exact rollback revision/image: **PENDING OWNER INPUT**.
- Rollback owner: **PENDING OWNER INPUT**.
- G3 approver, approval reference, and signature/electronic authorization: **PENDING EXPLICIT AUTHORIZATION**.

Evidence: `geezle-backend/docs/scrolith-external-evidence-gate-register.md` (G3 section); environment facts from read-only Azure metadata. No load or resilience test was run.

## G4 — Backup and restore rehearsal

- CI-only database evidence: `scrolith_test` is created by `geezle-backend/.github/workflows/ci.yml`; it is not an approved Azure restore target.
- Isolated database identifier, owner, backup target, RPO, RTO, validation owner: **PENDING OWNER INPUT**.
- Proposed restore checks, **NOT AUTHORIZED**: connectivity; schema; migration status; tables/indexes; relationships/constraints; representative reads/writes; authentication/authorization; data integrity; no production connectivity; no unexpected data loss.
- Proposed cleanup, **NOT AUTHORIZED**: destroy the isolated restored database and temporary storage, revoke temporary identities/credentials, and verify no temporary credentials remain.
- Evidence location: **PENDING OWNER INPUT**.
- G4 approver, approval reference, and signature/electronic authorization: **PENDING EXPLICIT AUTHORIZATION**.

Evidence: `geezle-backend/.github/workflows/ci.yml`; `geezle-backend/docs/scrolith-external-evidence-gate-register.md` (G4 section). No backup or restore action was run.

## G5 — Independent penetration test

- Tester/company: **PENDING OWNER INPUT**.
- Verified contact and independence confirmation: **PENDING OWNER INPUT**.
- Approved scope and rules-of-engagement document: **PENDING OWNER INPUT**.
- Test dates, emergency contact, and retest deadline: **PENDING OWNER INPUT**.
- G5 approval reference and signature/electronic authorization: **PENDING EXPLICIT AUTHORIZATION**.

Evidence: `geezle-backend/docs/scrolith-external-evidence-gate-register.md` (G5 section). No independent testing was run.

## Final authorization

- Authorized owner: **PENDING OWNER INPUT**.
- Authorized role: **PENDING OWNER INPUT**.
- Signature/electronic authorization: **PENDING EXPLICIT AUTHORIZATION**.
- Approval date: **PENDING OWNER INPUT**.
- Final approval reference: **PENDING OWNER INPUT**.

Overall status remains **PENDING EXECUTION AUTHORIZATION**. G1, G3, G4, and G5 remain **BLOCKED/PENDING**. No infrastructure, traffic, database, secret, or deployment action was performed.
