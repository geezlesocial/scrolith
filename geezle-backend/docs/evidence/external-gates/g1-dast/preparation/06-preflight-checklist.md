# Future G1 preflight checklist — commands not executed

**NO-GO unless every gate passes inside a newly approved, exact UTC window.** This is a runbook template, not authorization. Do not run the commands in this preparation task.

## Required record before the window

Written owner approval must identify: exact staging API hostname, Azure subscription/resource group/container app, candidate revision and immutable digest, stable revision, label, stable/candidate traffic, specific methods and path allowlist, roles, limits, scanner digest/version/add-ons, approved plan/manifest hashes, operator, independent verifier, monitoring owner, emergency stop, evidence location, and exact UTC start/end. Jamila's monitor and Iqra's emergency-stop availability must be freshly confirmed. The old windows and identities recorded in Issue #128 are expired.

## Read-only Azure preflight commands (placeholders; do not execute now)

Run only after specific authorization for read-only Azure inspection. Keep outputs to revision name, image digest, health/provisioning, label mapping and traffic weights; do not dump environment variables or secret references.

```powershell
# Fill these only from the written authorization; never infer the subscription or target.
$subscription = '<APPROVED-STAGING-SUBSCRIPTION-ID>'
$resourceGroup = '<APPROVED-STAGING-RESOURCE-GROUP>'
$apiApp = '<APPROVED-STAGING-API-CONTAINER-APP>'
$candidateRevision = '<APPROVED-CANDIDATE-REVISION>'
$stableRevision = '<APPROVED-STABLE-REVISION>'

az account show --query '{subscriptionId:id,tenantId:tenantId}' -o json
# Compare the output locally to the approval; if either value differs, NO-GO.
az containerapp revision list -g $resourceGroup -n $apiApp `
  --query "[].{name:name,active:properties.active,health:properties.healthState,provisioning:properties.provisioningState,images:properties.template.containers[].image}" -o json
az containerapp show -g $resourceGroup -n $apiApp `
  --query '{latestRevision:properties.latestRevisionName,traffic:properties.configuration.ingress.traffic,labels:properties.configuration.ingress.traffic[].label}' -o json
```

Never query or print secret-bearing environment values. Confirm exact candidate digest, candidate Healthy/active and 0% traffic, exact stable identity and 100% traffic, candidate label bound to approved revision, and no unexpected traffic target. Any mismatch is `NO-GO — DO NOT START DAST`.

## Scanner/config preflight (offline)

1. Verify `zap.sh -version` reports core 2.17.0 using the digest-pinned image; record selected platform and child digest.
2. Verify installed add-on names/versions are frozen and no update/check/update action will mutate them.
3. Hash the exact YAML and route manifest with `Get-FileHash -Algorithm SHA256`; record full output hashes and UTC timestamp.
4. Parse/validate the Automation Framework plan offline. Confirm the only target is the exact approved candidate host; no production hostname or wildcard exists; all scan jobs are absent/disabled; include/exclude rules match the signed allowlist; total request cap, worker, rate, timeout, retry and deadline are enforced externally.
5. Have an independent reviewer compare role mapping, scanner configuration, exclusions, and request limits to the written approval.
6. Confirm operator, Jamila (monitor), Iqra (emergency stop), evidence destination, stop channel, and live health monitor availability for this exact window.

Do not include a direct candidate health request here without a separately approved preflight scope. If direct health is expressly included, issue exactly the approved health request and record only status/time; do not follow redirects or browse other routes.

## Go/no-go

Proceed only if time is inside window; Azure context is correct; current revisions/digests/label/health/traffic exactly match; stable is 100% and candidate 0%; auth mapping and normal MFA/device approval work have been independently validated; scanner/version/add-ons/hashes match; route allowlist is exact; monitor, stop contact, operator and evidence storage are ready. Otherwise record `NO-GO — DO NOT START DAST`, stop, and request a new approval/window. Stop before the window end even if work remains.
