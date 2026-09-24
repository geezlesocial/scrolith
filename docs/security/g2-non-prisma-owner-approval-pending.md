# G2 non-Prisma dependency Highs — APPROVED TEMPORARY EXCEPTION

This is a separate approved temporary exception. It does not amend or broaden
the approved Prisma dependency-risk record at
`security/approvals/g2-dependency-risk-approval.md`.

Evidence source: Security run `35924078157`, full npm audit artifact, exact
source checkpoint `5c0fd8ba60371746b48f0d74485a15e2d413f790`.

## Scope and status

The findings below are in the full dependency graph and are associated with
test/build tooling paths. They must not be silently treated as resolved merely
because the prior runtime image was clean. The final runtime-image absence and
SBOM absence must be re-proven for the final source/image pair after the next
authoritative CI run.

Status for every entry: `APPROVED`, subject to the exact scope, controls, deadline,
and expiry recorded below.

Approved by:
- Ibrahim Muhammed Jibrin
- Jima Ahamad

Remediation owners:
- Ibrahim Muhammed Jibrin
- Jima Ahamad

Approval date: `2026-09-24`.
Remediation deadline: `2026-10-14`.
Exception expiry: `2026-10-21`.
Earlier-fix trigger: immediate review and remediation when a compatible validated
fixed dependency becomes available.

## Findings

| Package | Advisory IDs | Installed range | Fixed version | Dependency path / role |
| --- | --- | --- | --- | --- |
| `brace-expansion` | `GHSA-f886-m6hf-6m8v`, `GHSA-3jxr-9vmj-r5cp`, `GHSA-mh99-v99m-4gvg`, `GHSA-rgw5-rvv9-x895` | `<=1.1.17` | `>=1.1.18` | `minimatch@3.1.2 -> glob@7.2.3 -> Jest` / test tooling |
| `browserslist` | `GHSA-c83g-rgw3-j3cx`, `GHSA-73wf-gq98-2v4g` | `<=4.28.6` | `>=4.29.0` | Babel/ts-jest/Jest build and test graph / build-test tooling |
| `form-data` | `GHSA-hmw2-7cc7-3qxx` | `4.0.0 - 4.0.5` | `>=4.0.6` | `supertest@6.3.3 -> superagent@8.1.2` and test typings / test tooling |
| `js-yaml` | `GHSA-h67p-54hq-rp68`, `GHSA-52cp-r559-cp3m`, `GHSA-5p4m-2wfm-xmqj`, `GHSA-2883-xcg3-v3hh` | `<=3.15.1` | `>=3.15.2` | `@istanbuljs/load-nyc-config -> babel-plugin-istanbul -> babel-jest/Jest` / test tooling |
| `minimatch` | `GHSA-3ppc-4f35-3m26`, `GHSA-7r86-cg39-jmmj`, `GHSA-23c5-xmqv-rm74` | `<=3.1.3` | `>=3.1.4` | `glob@7.2.3 -> Jest/test-exclude` / test tooling |
| `picomatch` | `GHSA-3v7f-55p6-f55p`, `GHSA-c2c7-rcm5-vvqj` | `<=2.3.1` | `>=2.3.2` | `anymatch -> jest-haste-map` and Jest utilities / test tooling |

The production graph also contains `form-data@2.5.6` through the Google Cloud
storage/request typings path; that installed major is outside the affected
`4.0.0 - 4.0.5` range for `GHSA-hmw2-7cc7-3qxx` and is recorded separately from
the vulnerable test `form-data` node.

## Required decision record for each entry

- Runtime image/SBOM: must be re-verified for the final image; the prior
  evidence showed these non-Prisma test/build packages absent from the runtime
  image.
- Runtime reachability: no production application import has been established;
  the listed paths are CI/build/test tooling paths. This is not a substitute
  for final image and import-graph verification.
- Compensating controls: immutable `npm ci`, isolated CI databases, no untrusted
  dependency configuration in deployment, non-root runtime image, final-image
  Trivy scan, Gitleaks, and CycloneDX SBOM review.
- Immediate remediation: test compatible direct-parent upgrades one dependency
  family at a time, regenerate the lockfile through npm, and rerun focused
  tests, full Jest, Prisma checks, Docker, audits, Trivy, Gitleaks, and SBOM.
- Approval record: the authorized owners accepted the exact advisory/package/path
  scope, confirmed runtime-image and runtime-SBOM absence, set the deadline and
  expiry, and require retest under the controls above. The approval is limited to
  the six non-Prisma packages listed in this document.

## Decision

The non-Prisma exception is `APPROVED` for the exact six-package scope and dates
recorded above. G2 remains subject to all other release-gate evidence. The
approved Prisma exception does not cover these non-Prisma advisories, and this
approval does not authorize Azure, ACR, staging, production, traffic, database,
Redis, Key Vault, secret, DAST, or later-gate execution.

## Owner Approval

**Status:** APPROVED

**Approval Date:** 2026-09-24

**Approved By:**
- Ibrahim Muhammed Jibrin
- Jima Ahamad

**Remediation Owners:**
- Ibrahim Muhammed Jibrin
- Jima Ahamad

**Remediation Deadline:** 2026-10-14

**Exception Expiry:** 2026-10-21

### Approval Statement

We approve the temporary G2 dependency-risk exception for the currently
documented non-Prisma development, test, and build-tooling High-severity
advisories affecting the following packages:

- `brace-expansion`
- `browserslist`
- `form-data`
- `js-yaml`
- `minimatch`
- `picomatch`

This approval is limited strictly to the dependency paths, advisory IDs,
technical scope, compensating controls, and supporting evidence documented in
this G2 dependency-risk exception.

The exception applies only where the affected packages are used for
development, testing, CI, or build tooling and have been verified as absent
from the production runtime image and production runtime SBOM.

The production-runtime dependency findings covered by the existing Prisma
exception remain governed separately by the existing approved Prisma
dependency-risk exception. This approval does not amend, replace, broaden,
or merge with that Prisma exception.

### Risk Acceptance Conditions

1. No affected non-Prisma dependency covered by this exception may be present
   in production runtime image/SBOM.
2. No Critical waived.
3. No production-runtime High waived.
4. No unresolved CodeQL waived.
5. No exact release-tree secret finding waived.
6. No Trivy image or IaC High/Critical waived.
7. No new out-of-scope advisory/path automatically covered.
8. Existing G2 controls/CI/secret scanning/CodeQL/runtime image/IaC/SBOM/audit remain.
9. Remediate when compatible fixed version, parent upgrade, or targeted override available.
10. Do not weaken scanners/tests/use unsafe forced upgrades.

### Scope Limitation

Only the six packages listed, non-Prisma development/test/build high findings.
No critical, runtime high, unresolved source/CodeQL, release-tree secret,
Trivy image/IaC high/critical, out of scope/future vulnerabilities, or
weakened controls.

### Operational Authorization Boundary

This is evidence/risk acceptance only. It does NOT authorize Azure/ACR/staging/
production/traffic/DB/Redis/Key Vault/secret changes, DAST, G3/G4/G5/G6, or
any later release-gate execution.

### Expiration and Earlier-Fix Trigger

Expires 2026-10-21. Deadline 2026-10-14. Earlier if a compatible validated fix
becomes available. Earlier-fix remediation includes a compatible patched
version, parent upgrade, safe targeted override, removal, or replacement.

### Approval Record

Approved by Ibrahim Muhammed Jibrin — date 2026-09-24
Approved by Jima Ahamad — date 2026-09-24
Remediation owner Ibrahim Muhammed Jibrin
Remediation owner Jima Ahamad
Deadline 2026-10-14
Expiry 2026-10-21
Earlier-fix trigger: Immediate review and remediation when a compatible
validated fixed dependency becomes available.
