# G2 non-Prisma dependency Highs — OWNER-APPROVAL-PENDING

This is a separate, unapproved decision draft. It does not amend or broaden
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

Status for every entry: `OWNER APPROVAL PENDING`.

Proposed owner: `Designated dependency/security owner — assignment pending`.
Proposed remediation deadline: `2026-10-14 (proposed; not approved)`.
Proposed exception expiry: `2026-10-21 (proposed; not approved)`.

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
- Approval requirements: an authorized human owner must name the owner, accept
  the exact advisory/package/path, confirm runtime absence, set a deadline and
  expiry, and require retest. No approval is recorded by this draft.

## Decision

`G2 remains BLOCKED` pending either compatible remediation or explicit owner
approval for each residual High advisory. The approved Prisma exception does
not cover these non-Prisma advisories.
