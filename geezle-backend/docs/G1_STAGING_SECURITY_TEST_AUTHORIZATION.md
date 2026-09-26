# Scrolith G1 Staging Security Test Authorization

> **Status: BLOCKED — written approval is recorded; account mapping, corrected provenance, and candidate verification remain incomplete.**

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
- Corrected workflow run ID from the trusted `main` branch: **PENDING**
- Accepted candidate image reference and digest: **PENDING corrected workflow run**
- Accepted SBOM checksum: **PENDING corrected workflow run**
- Attestation subject, builder identity, and signature verification: **PENDING corrected workflow run and independent review**

The corrected workflow must bind the attestation subject to the exact image digest and identify the trusted workflow as `https://github.com/geezlesocial/scrolith/.github/workflows/g1-staging-provenance.yml@refs/heads/main`.

## Staging target — verify read-only before approval

- Verified candidate revision: **PENDING**
- Verified direct candidate API URL: **PENDING**
- Verified candidate image digest currently running: **PENDING**
- Verified candidate traffic weight: **PENDING — must be 0%**
- Direct candidate health result and timestamp: **PENDING**
- Frontend URL, if required for this scope: **PENDING verification**

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

- Non-privileged synthetic staging account and role mapping: **PENDING independent verification**
- Credential-to-account mapping and private secret reference: **PENDING independent verification**
- Privileged account use and necessity, if any: **PENDING explicit approval**
- MFA requirement and validation evidence for any privileged account: **PENDING independent verification**
- Tokens, passwords, MFA seeds, and backup codes: **must never be written to this document, source control, or public workflow artifacts**

Do not infer that a secret belongs to an account based only on its name.

## Proposed execution limits

These are proposed limits and become effective only after formal approval:

- Owner-approved UTC window, subject to all prerequisites below: `2026-09-27T14:00:00Z` to `2026-09-27T14:30:00Z` (September 27, 2026, 10:00–10:30 PM PHT/SGT, UTC+8)
- Maximum duration: 30 minutes
- Maximum total requests: 300
- Workers: 1
- Maximum rate: 1 request per second per account
- Request timeout: 10 seconds
- Retry limit: 1 retry per request

The monitoring owner and emergency-stop contact must be named in the private approval record before execution.

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
- Private account-to-credential mapping attached and verified: **PENDING**
- Exact candidate revision, direct API URL, and image digest approved: **PENDING**
- Corrected provenance workflow run, image digest, SBOM checksum, and verified signed attestation: **PENDING**
- Monitoring owner and emergency-stop contact confirmed in the designated private record: **PENDING**

The approval timestamp above follows GitHub's recorded comment creation time. The timestamp supplied separately as `2026-09-26T02:23:00Z` differs from that metadata and is not used as the exact comment timestamp.

Account-to-credential mappings, passwords, secret names, personal contact details, and candidate-specific staging revision/endpoint identifiers must remain in the designated access-controlled private record, not this public document. Verify the private mapping independently and verify the read-only candidate target, revision, image digest, health result, and 0% traffic before any DAST. Do not deploy or change traffic as part of those checks.

The corrected provenance workflow requires its trusted workflow identity on `main`. It must run after the workflow change reaches `main`; this PR does not itself establish new provenance or clear the historical provenance blocker.

> **Final status: G1 BLOCKED — DO NOT START DAST.**
