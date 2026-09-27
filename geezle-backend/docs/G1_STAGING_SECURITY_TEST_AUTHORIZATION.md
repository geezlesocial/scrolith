# Scrolith G1 Staging Security Test Authorization

> **Status: BLOCKED — written approval, corrected provenance, independent account-to-credential mapping, and contact confirmations are recorded. An earlier candidate check passed; the final pre-window check is pending. Do not start DAST until the final check passes and all scope prerequisites remain satisfied.**

This document is a **draft scope and control record**. It does not itself authorize scanning. Do not run DAST until the candidate identity is verified, all approval fields are completed by the authorized approver, and the approval is recorded.

## Purpose and boundaries

This authorization is limited to a non-destructive, read-only authenticated discovery check against the verified zero-traffic staging candidate. It excludes production and any traffic change, deployment, data mutation, or active testing outside the allowlist below.

## Candidate and provenance

- Source commit supplied for the prior build: `4fa003df704a3a369a1923dd1d752fc937ddd971`
- Dockerfile: `geezle-backend/Dockerfile.acr.temp`
- Historical provenance workflow run: [36144883827](https://github.com/geezlesocial/scrolith/actions/runs/36144883827)
- Historical image tag: `g1-provenance-4fa003df704a-20260925-04`
- Historical image digest: `sha256:3ff3d08f8151d3b351f6fe980b0cbe83fd989380bde61a059b68567da6268246`
- Historical SBOM checksum: `caab12dc03693de1101923ea3c928ccd060ec19b02459d406c664b311e0f5106`
- Historical provenance status: signature verification succeeded, but the predicate builder identity was malformed. These historical values are retained for traceability and **must not be treated as accepted G1 provenance or as the scan target**.
- Corrected provenance workflow ref: `main` only, `.github/workflows/g1-staging-provenance.yml`
- Corrected workflow run from trusted `main`: [#36229461393](https://github.com/geezlesocial/scrolith/actions/runs/36229461393) — succeeded. Its artifact binds the approved image digest to the source and includes the SBOM and verified attestation. Candidate-specific identifiers and the digest remain in the restricted private record.
- Accepted SBOM checksum and attestation evidence: recorded in the immutable artifact for run #36229461393.
- Independent review and final candidate pre-window verification remain separate readiness checks.

The corrected workflow must bind the attestation subject to the exact image digest and identify the trusted workflow as `https://github.com/geezlesocial/scrolith/.github/workflows/g1-staging-provenance.yml@refs/heads/main`.

## Staging target — verify read-only before approval

- Candidate revision, direct URL, image digest, traffic weight, and health details are retained in the restricted private approval record.
- Earlier independent read-only check: [Issue #128 evidence comment](https://github.com/geezlesocial/scrolith/issues/128#issuecomment-5852043865), recorded at `2026-09-27T01:51:40Z` (health response at `2026-09-27T01:51:46Z`). This is earlier evidence, not the final pre-window check.
- Fresh read-only candidate check immediately before the approved window: **PENDING**.
- Frontend URL: not required for the current direct-API-only scope; adding frontend testing requires revised scope and approval.

Previously listed service URLs are not proof that the zero-traffic candidate is the target. Do not use a stable service alias unless read-only evidence proves it resolves to the exact authorized candidate. If the candidate image is not already deployed, stop; deployment requires separate approval.

## Proposed test scope

**Mode:** Read-only discovery only. No form submissions, state changes, fuzzing, destructive tests, or authenticated route traversal beyond the explicitly approved paths.

**Proposed route allowlist:**

- `GET /api/health`
- `HEAD /api/health`
- `GET /api/readyz`
- `HEAD /api/readyz`
- `GET /api/health/ready`
- `HEAD /api/health/ready`
- `GET /api/auth/health`

Any additional route, method, payload, or test class requires a revised written approval before use.

**Excluded routes and actions:**

- All `POST`, `PUT`, `PATCH`, and `DELETE` requests
- Payments, payouts, escrow, withdrawals, KYC, uploads, and file operations
- OAuth or MFA enrollment/reset flows
- Admin routes, metrics, and route-discovery routes
- AI and external integrations
- WebSocket and Socket.IO testing
- Database or Redis mutations
- Production connectivity and non-test data

## Test identities and credential controls

Account identifiers and credential references must be recorded in a **private access-controlled approval attachment**, not in this public repository.

- Non-privileged synthetic staging account and role mapping: independently checked by Webskill Design in the restricted private record; see [Issue #128 confirmation](https://github.com/geezlesocial/scrolith/issues/128#issuecomment-5851243832).
- Credential-to-account mapping: independently checked by Webskill Design in the restricted private record at `2026-09-27T00:39:24Z`; see [Issue #128 confirmation](https://github.com/geezlesocial/scrolith/issues/128#issuecomment-5851352333). No credential values are included here.
- Privileged account use: none is authorized for the current allowlist. Any need for a privileged account requires explicit approval before use.
- MFA evidence for a privileged account: not applicable unless the scope is revised to include one.
- Tokens, passwords, MFA seeds, and backup codes: **must never be written to this document, source control, or public workflow artifacts**

Do not infer that a secret belongs to an account based only on its name.

## Approved execution limits — conditional on prerequisites

These owner-approved limits apply only to the read-only scope and approved UTC window below, after every prerequisite in the formal approval section has been verified:

- Owner-approved UTC window, subject to all prerequisites below: `2026-09-27T14:00:00Z` to `2026-09-27T14:30:00Z` (September 27, 2026, 10:00–10:30 PM PHT/SGT, UTC+8)
- Maximum duration: 30 minutes
- Maximum total requests: 300
- Workers: 1
- Maximum rate: 1 request per second per account
- Request timeout: 10 seconds
- Retry limit: 1 retry per request

The monitoring owner and emergency-stop contact must be named in the private approval record before execution. Names and roles confirmed for this window: Jamila Jibrin — Supervisor, monitoring owner; Iqra Jibrin — Project Manager, emergency-stop contact (see [Issue #128 confirmation](https://github.com/geezlesocial/scrolith/issues/128#issuecomment-5851243832)). Private contact methods remain only in the restricted record.

Stop immediately on any production connectivity, unexpected mutation, account-isolation failure, non-test-data access, sustained 5xx rate above 5% for two minutes, CPU or memory above 85% for five minutes, PostgreSQL connections above 80% capacity, Redis memory above 80%, or unexpected upload/payment/KYC/escrow/withdrawal activity.

## Evidence and cleanup

Store scan reports, account mapping, approval evidence, and operational logs in an access-controlled private evidence location. Do not put sensitive values in this public repository or in publicly accessible workflow artifacts. Redact sensitive values from any report prepared for broader sharing.

After evidence is verified, revoke temporary sessions and remove scanner artifacts as permitted by the signed approval.

## Formal approval — recorded; execution prerequisites remain

- Formal approval reference: [GitHub issue #128](https://github.com/geezlesocial/scrolith/issues/128)
- Authorized approver: Ibrahim Muhammed Jibrin — Owner
- Electronic approval evidence: [owner approval comment](https://github.com/geezlesocial/scrolith/issues/128#issuecomment-5842344269)
- UTC approval timestamp: `2026-09-26T02:23:25Z` (GitHub comment creation timestamp)
- Approved window: `2026-09-27T14:00:00Z` to `2026-09-27T14:30:00Z` (September 27, 2026, 10:00–10:30 PM PHT/SGT, UTC+8)
- Private account-to-credential mapping independently verified by Webskill Design at `2026-09-27T00:39:24Z`; private details remain in the restricted record (see [Issue #128 confirmation](https://github.com/geezlesocial/scrolith/issues/128#issuecomment-5851352333)).
- Exact candidate revision, direct API URL, image digest, 0% traffic, and health details are retained in the restricted private record. The earlier check is recorded at `2026-09-27T01:51:40Z`; final pre-window verification is **PENDING**.
- Corrected provenance: trusted-main workflow [#36229461393](https://github.com/geezlesocial/scrolith/actions/runs/36229461393) succeeded; the immutable artifact contains the digest-bound SBOM and verified attestation.
- Monitoring owner Jamila Jibrin — Supervisor, and emergency-stop contact Iqra Jibrin — Project Manager, confirmed (see [Issue #128 confirmation](https://github.com/geezlesocial/scrolith/issues/128#issuecomment-5851243832)). Private contact methods remain in the restricted record.

The approval timestamp above follows GitHub's recorded comment creation time. The timestamp supplied separately as `2026-09-26T02:23:00Z` differs from that metadata and is not used as the exact comment timestamp.

Account-to-credential mappings, passwords, secret names, personal contact details, and candidate-specific staging revision/endpoint identifiers must remain in the designated access-controlled private record, not this public document. Verify the private mapping independently and verify the read-only candidate target, revision, image digest, health result, and 0% traffic before any DAST. Do not deploy or change traffic as part of those checks.

The corrected provenance workflow has run from the trusted `main` workflow identity; see run [#36229461393](https://github.com/geezlesocial/scrolith/actions/runs/36229461393). This provenance evidence does not clear the remaining candidate pre-window check or authorize testing outside the approved scope.

> **Final status: G1 BLOCKED — DO NOT START DAST until the fresh pre-window check passes and every approval prerequisite is complete.**
