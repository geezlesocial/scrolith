# Scrolith Staging API Deployment Runbook

**Status:** Proposed authoritative procedure pending merge to `backend/main`  
**Scope:** Staging API only  
**Target:** Azure Container Apps `ca-scrolith-staging-api` in `rg-scrolith-staging`  
**Normal-traffic policy:** stable revision 100%; candidate revision 0%  
**Production:** explicitly out of scope

## 1. Purpose

This runbook defines the authoritative procedure for deploying an immutable Scrolith backend image to a new **0% staging candidate revision** and retaining evidence that maps:

`source SHA -> provenance/build -> immutable image digest -> deployment operation -> Azure revision`

A successful build or provenance run alone is not a deployment record. A read-only observation of a revision/digest association alone is also not a deployment record. Closure requires the operator record described in Section 8.

## 2. Ownership and approvals

- **Project/release approver:** Ibrahim Muhammed Jibrin
- **Primary staging deployment operator:** Jem, as previously authorized in Issue #128; a substitute operator requires explicit written approval.
- **Monitoring owner:** Jamila Jibrin unless a different monitor is named in the deployment authorization.
- **Emergency-stop contact:** Iqra Jibrin unless a different contact is named in the deployment authorization.
- **Canonical backend repository:** `geezlesocial/scrolith`
- **Canonical backend branch:** `backend/main`
- **Backend source path:** `geezle-backend/`
- **Backend image build definition:** `geezle-backend/Dockerfile.acr.temp`
- **Staging provenance workflow:** `.github/workflows/g1-staging-provenance.yml`

Each deployment requires a written staging-only authorization that names the exact source SHA and immutable image digest. Production deployment, stable traffic promotion, and unrelated settings changes require separate approval.

## 3. Required inputs

Before any Azure mutation, record:

```text
SOURCE_SHA=<40-char git SHA reachable from backend/main>
PROVENANCE_RUN=<GitHub Actions run URL or ID>
IMAGE_REPOSITORY=acrscrolithstaging8098.azurecr.io/scrolith-backend
IMAGE_DIGEST=sha256:<64 hex chars>
IMAGE=${IMAGE_REPOSITORY}@${IMAGE_DIGEST}
RESOURCE_GROUP=rg-scrolith-staging
APP=ca-scrolith-staging-api
AUTHORIZATION=<Issue/PR/release-record URL>
```

The operator must verify that the provenance evidence binds the exact `IMAGE_DIGEST` to the approved `SOURCE_SHA` and approved Dockerfile.

## 4. Stop conditions

**STOP; do not deploy** if any of the following is true:

- `SOURCE_SHA` is not the approved full SHA or is not reachable from `backend/main`.
- The provenance record does not bind the exact image digest to the exact source SHA.
- The Azure subscription or staging resource group is not the expected one.
- The Container App is not in multiple-revision mode.
- The current stable revision is not healthy or normal traffic is not 100% on the expected stable revision.
- An unexpected candidate or traffic rule is present.
- The requested change includes production, stable traffic promotion, secret disclosure, or unrelated configuration changes.
- The operator cannot retain sanitized command/output evidence.

## 5. Read-only preflight

Use the authorized Azure account and capture sanitized output.

```bash
set -euo pipefail

RG="rg-scrolith-staging"
APP="ca-scrolith-staging-api"

az account show --query '{subscription:id,tenant:tenantId,userType:user.type}' -o json

az containerapp show \
  --name "$APP" \
  --resource-group "$RG" \
  --query '{name:name,revisionMode:properties.configuration.activeRevisionsMode,latestRevision:properties.latestRevisionName}' \
  -o json

az containerapp ingress traffic show \
  --name "$APP" \
  --resource-group "$RG" \
  -o json

az containerapp revision list \
  --name "$APP" \
  --resource-group "$RG" \
  --query '[].{name:name,active:properties.active,health:properties.healthState,running:properties.runningState,image:properties.template.containers[0].image}' \
  -o json
```

Record the stable revision name and confirm the app is in `Multiple` revision mode. Do not change mode as part of this procedure.

## 6. Create the 0% candidate revision

Use only an immutable digest-qualified image reference.

```bash
set -euo pipefail

RG="rg-scrolith-staging"
APP="ca-scrolith-staging-api"
IMAGE="acrscrolithstaging8098.azurecr.io/scrolith-backend@sha256:<APPROVED_DIGEST>"
SOURCE_SHA="<APPROVED_40_CHAR_SHA>"
REV_SUFFIX="cand-${SOURCE_SHA:0:12}"

CANDIDATE_REVISION="$(
  az containerapp update \
    --name "$APP" \
    --resource-group "$RG" \
    --image "$IMAGE" \
    --revision-suffix "$REV_SUFFIX" \
    --query properties.latestRevisionName \
    -o tsv
)"

test -n "$CANDIDATE_REVISION"
printf 'CANDIDATE_REVISION=%s\n' "$CANDIDATE_REVISION"
```

This step must not intentionally modify secrets, `FRONTEND_URL`, cookie settings, CORS settings, ingress mode, or normal traffic weights. If a release needs a configuration change, that change must be separately authorized and recorded.

## 7. Verify candidate, traffic, label and health

First verify the new revision uses the exact digest and is healthy.

```bash
az containerapp revision show \
  --name "$APP" \
  --resource-group "$RG" \
  --revision "$CANDIDATE_REVISION" \
  --query '{name:name,active:properties.active,health:properties.healthState,running:properties.runningState,image:properties.template.containers[0].image}' \
  -o json

az containerapp ingress traffic show \
  --name "$APP" \
  --resource-group "$RG" \
  -o json
```

**Required outcome:** the previously approved stable revision remains at 100% normal traffic and the new candidate receives 0% normal traffic. If traffic differs, stop and invoke rollback/escalation; do not promote the candidate.

After the candidate is healthy and the digest matches, assign or move the staging candidate label only if that action is included in the written authorization:

```bash
az containerapp revision label add \
  --name "$APP" \
  --resource-group "$RG" \
  --label g1-candidate \
  --revision "$CANDIDATE_REVISION"
```

Then re-run the revision and traffic queries and perform the approved direct `/api/health` check through the returned candidate/label endpoint. Record only sanitized health output.

## 8. Mandatory retained deployment record

For every successful deployment, the operator must record all of the following in the approved release/evidence record:

```text
Deployment status: SUCCESS
UTC start:
UTC finish:
Operator identity/role:
Authorization reference:
Repository: geezlesocial/scrolith
Canonical branch: backend/main
Source SHA:
Provenance workflow/run:
Dockerfile: geezle-backend/Dockerfile.acr.temp
Image repository: acrscrolithstaging8098.azurecr.io/scrolith-backend
Immutable image digest:
Azure resource group: rg-scrolith-staging
Container App: ca-scrolith-staging-api
Candidate revision created:
Candidate label mapping:
Stable revision before:
Stable revision after:
Traffic before:
Traffic after:
Candidate health/running state:
Direct health result:
Rollback required: yes/no
Sanitized command/output attachment or log reference:
```

The record must make the digest-to-revision link attributable to the deployment operation itself, not merely to a later observation.

## 9. Rollback / abort

Because the candidate must remain at 0% normal traffic, rollback is designed to preserve the stable revision unchanged.

If the candidate is unhealthy, has the wrong digest, or produces unexpected behavior:

1. Do **not** promote traffic.
2. Remove `g1-candidate` from the failed revision if it was assigned and if removal is within the approved rollback scope.
3. Deactivate the failed candidate if authorized:

```bash
az containerapp revision deactivate \
  --name "$APP" \
  --resource-group "$RG" \
  --revision "$CANDIDATE_REVISION"
```

4. Reconfirm the stable revision remains healthy at 100% normal traffic.
5. Record the failure, stop condition, and sanitized evidence.
6. Require new approval before another deployment attempt.

## 10. Release-gate closure rule

The staging deployment-procedure evidence item is **RESOLVED** when this runbook is merged to `backend/main` and formally designated as the authoritative staging API deployment procedure.

The digest-to-revision evidence item is **RESOLVED** only after one successful authorized execution produces the Section 8 record.

Until both conditions are met, do not describe the deployment-evidence requirement as fully closed.
