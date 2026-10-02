# G1 read-only member verifier: deployment preparation

**Status: source-only preparation. Nothing in this document authorizes a build, Azure change, database connection, job execution, or account test.** The source base for this preparation is `geezlesocial/scrolith`, branch `backend/main`, commit `3c99f73ae6a6bc787f181e28da3d0b4838335406`.

## Intended evidence chain

Approved source SHA → dedicated verifier Dockerfile → reviewed build/provenance workflow → immutable ACR digest → dedicated Container Apps Job definition → independently approved read-only PostgreSQL principal → private Key Vault/Container Apps secret references → separately reviewed execution authorization → one manual execution → fixed, non-identifying stdout and a separately protected result channel for authorized reviewers.

The workflow sketch is deliberately under `docs/templates/g1-readonly-verifier-provenance.yml`. It is not an active GitHub Actions workflow. Do not move it into `.github/workflows` without separate written authorization. The Dockerfile is only a source definition; it has not been built. No image digest is established for this verifier.

## Prepared artifacts

- `geezle-backend/Dockerfile.g1-readonly-verifier`: dedicated multi-stage image; Prisma client generation is schema-only and does not embed a database URL. The final stage contains the compiled verifier and runtime dependencies only. It has a direct Node entrypoint and runs as UID/GID 10001.
- `geezle-backend/package.g1-readonly-verifier.json` and `package.g1-readonly-verifier-lock.json`: isolated dependency manifest and clean lock (generated from this manifest alone via the public npm registry with lifecycle scripts disabled), excluding API-server dependencies.
- `deploy/azure/g1-readonly-verifier-job.bicep`: proposed manual, single-replica Job. Resource IDs, identities, Key Vault references, registry/repository authorization, and staging environment must be verified by the authorized infrastructure owner before any deployment review.
- `deploy/postgres/g1-readonly-verifier-role.sql`: unexecuted, parameterized review template for the narrowly scoped role `scrolith_g1_verifier_ro`, plus catalog/effective-privilege inspection queries. Database, schema, and table identifiers remain unverified placeholders.
- `docs/templates/g1-readonly-verifier-provenance.yml`: non-executable workflow review artifact only.

## Image and Job safety properties

The Dockerfile pins `node:22.23.2-alpine3.24` to the `linux/amd64` child manifest digest `sha256:b64da1de5a51067ab8e75f0bc8dbd0905d8894baa22261f439a4572f41291e50`. The OCI index observed during read-only registry metadata inspection was `sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85`. Revalidate the selected platform manifest during an authorized build review.

The Job template uses Manual trigger, timeout 120 seconds, retry limit 0, parallelism 1, completion count 1, exactly one container, and no init container, ingress, command, or args override. It composes the image reference with a fixed `@sha256:` prefix and a 64-character digest parameter; separately validate that the supplied characters are lowercase hexadecimal and bind it to reviewed provenance before deployment. The template contains no account selectors or raw secret values. `DATABASE_URL`, `G1_MEMBER_A_SELECTOR`, and `G1_MEMBER_B_SELECTOR` are references to Container Apps secrets populated from approved Key Vault references using a dedicated identity. Secret references and identity IDs are placeholders until the staging infrastructure owner verifies the supported Key Vault integration and identity lifecycle. In particular, confirm that the proposed identity lifecycle setting permits image pull and secret resolution; do not weaken identity controls to make deployment succeed.

Container Apps documentation warns that permission to start a Job can expose the Job's configured secrets. Therefore, do not grant broad human `jobs/start/action` access. A constrained, audited launcher or other reviewed execution-authorization mechanism is a prerequisite. Do not use per-execution command/template environment overrides: their retention and persistence properties are not approved.

## Database least privilege and stop conditions

The SQL file is a source template, not an execution script approved for use. The database owner must establish the actual database, schema, and Prisma-mapped User table, and review the SQL and all verification queries before any DBA applies it. It grants only database CONNECT, schema USAGE, and column SELECT on `id`, `email`, `role`, and `isActive`; it sets no password and does not revoke shared/PUBLIC privileges. Unexpected inherited/effective rights are a **STOP**, not a reason to auto-revoke shared grants. `default_transaction_read_only` is optional defense in depth only; ACLs and effective privileges remain the security boundary. Review ownership, role memberships, database/schema/table ACLs, column grants, PUBLIC ACLs, applicable RLS policies, and accessible SECURITY DEFINER routines before approval.

Do not proceed if any of these are unresolved:

1. Canonical source SHA, verifier review, and signed image provenance are not approved.
2. The staging Container Apps environment, registry, repository, pull identity, and Key Vault identity/secret references are not independently verified.
3. Database/schema/table mapping, role ownership, effective privileges, RLS, SECURITY DEFINER exposure, or role memberships are unknown or broader than intended.
4. Selector secret creation, access, rotation, retention, and deletion are not approved and documented. Selectors must never enter source, image layers, command-line arguments, workflow inputs, or logs.
5. Execution authorization does not prevent unauthorized users from invoking a Job that has access to the database and selectors.
6. The source renderer is specified to emit only this fixed line, independent of verification result, but deployed Job output and access controls have not been verified. Stdout/stderr must not reveal account existence, selector values, email addresses, IDs, records, database information, environment values, or exception text:
   ```text
   G1 synthetic Member verification completed; account-level results withheld.
   ```
   This redacts stdout/stderr only. The process exit code remains `0` when all checks pass and `1` otherwise; a successful Job status therefore implies both selected records exist, are distinct, have role `USER`, and are active. This repository does not define or prove who can read Container Apps execution status or logs: the Bicep template declares no role assignments, and the provenance workflow sketch is not active. Before any execution, the infrastructure owner must provide evidence that execution metadata and logs are restricted to the specifically authorized G1 reviewers. If that boundary cannot be verified, do not execute this Job; design a separately protected result channel and non-disclosing public execution status first.
7. A reviewer has not separately approved the exact source SHA, workflow, image digest, staging target, identities, secret references, one-run scope, and evidence retention plan.

The existing `job-scrolith-stg-identities` and image `sha256:33b69ff35549901120a7434d90cf3c94b4b04b5122a38831c7cbfbf51cb860a3` are explicitly prohibited for this verification because that image/job path includes database-mutating seed behavior. Do not reuse it.

## Required future approvals

This preparation still needs code/security review, Bicep compilation in an approved toolchain, build workflow review and separate build authorization, digest-bound provenance review, infrastructure-owner review of the staging-only Job and identities, DBA review of the SQL template and effective privileges, secret-lifecycle approval, and execution-specific authorization. A future execution also requires a time-bounded approval naming the two synthetic accounts and a controlled evidence/retention procedure; do not put their selectors into this repository.

No verifier, container, Azure Job, SQL, migration, seed, or live application command was run as part of this preparation.
