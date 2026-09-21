# Scrolith Post-G2 Release-Gate Execution Authorization

Status: PENDING EXECUTION AUTHORIZATION

Date created: 2026-09-21

Repository: `geezlesocial/scrolith`

Branch: `codex/staging-redis-remediation-20260917`

G2 approved commit:

`9ece6591eaaf97f5de96c3b1b2f9532d69b57906`

G2 approval document:

`security/approvals/g2-dependency-risk-approval.md`

## Execution rules

This document authorizes non-production testing only.

No gate may begin until its required fields are completed, reviewed, and formally approved.

All bracketed fields are required inputs. Do not execute any test while a bracketed placeholder remains.

This document does not authorize:

- Production deployment.
- Production traffic changes.
- Production database changes.
- Production secret, Key Vault, or Redis changes.
- Use of real customer data.
- Real payment transactions.
- Destructive testing outside the approved scope.
- Unapproved denial-of-service testing.
- Testing third-party systems without authorization.
- Mailpit or email changes outside the approved test environment.

All testing must use approved non-production or isolated infrastructure.

## G1 — Authenticated DAST authorization

### Target

Verified staging URL:

`https://ca-scrolith-staging-api.yellowmushroom-b8714740.southeastasia.azurecontainerapps.io`

Approved staging environment:

`cae-scrolith-staging`

Azure Container App:

`ca-scrolith-staging-api`

Resource group:

`rg-scrolith-staging`

Isolation evidence:

The staging environment is confirmed non-production and separate from
`cae-scrolith-production`. Mailpit is internal-only. No App Service or Static
Web App staging resource was found.

Verification evidence:

Read-only Azure CLI queries confirmed the Container App FQDN, resource group,
environment ID, external ingress, and separate staging environment domain.
Repository configuration references the same staging hostname.

The verified URL is not itself authorization to test. The exact DAST scope,
accounts, limits, window, and emergency contacts must be approved below.

### Approved DAST scope

Approved domains:

- `ca-scrolith-staging-api.yellowmushroom-b8714740.southeastasia.azurecontainerapps.io`

Additional approved domains:

- `[enter additional approved domains, or write "None"]`

Approved API paths:

- `[enter exact approved API paths]`

Excluded API paths:

- `[enter excluded paths, or write "None"]`

Approved application areas:

- Authentication and session management.
- MFA and passkey flows.
- Authorization and role boundaries.
- API access controls.
- File uploads.
- SSRF and unsafe URL protections.
- Rate limiting.
- Payment test flows using test data only.
- Messaging and marketplace test flows using test data only.
- Sensitive-data exposure checks.

Out of scope:

- Production systems.
- Unapproved domains.
- Third-party systems.
- Destructive actions.
- Denial-of-service testing.
- Real customer data.
- Real payment transactions.
- Credential attacks against real users.
- Any endpoint not listed in the approved scope.

### Authorized test accounts

Test account 1 identifier:

`[enter approved non-secret test account identifier]`

Test account 1 role:

`[enter approved role]`

Test account 2 identifier:

`[enter approved non-secret test account identifier]`

Test account 2 role:

`[enter approved role]`

Additional test accounts:

`[enter approved account identifiers and roles, or write "None"]`

Passwords, tokens, cookies, API keys, and secrets must not be stored in this document.

### Test window

Start time:

`[YYYY-MM-DD HH:MM UTC]`

End time:

`[YYYY-MM-DD HH:MM UTC]`

Approved timezone:

`UTC`

### DAST limits

Maximum requests per second:

`[enter approved requests-per-second limit]`

Maximum concurrent sessions:

`[enter approved concurrency limit]`

Maximum test duration:

`[enter approved duration]`

Maximum request count:

`[enter approved maximum request count]`

### Emergency stop

Emergency-stop contact name:

`[enter real contact name]`

Emergency-stop email or phone:

`[enter verified emergency contact information]`

Emergency-stop procedure:

`[enter the exact procedure for stopping the DAST run, disabling the scanner, and notifying the owner]`

### G1 approval

Approved by:

`[enter authorized G1 approver]`

Approver role:

`[enter G1 approver role]`

Approval reference:

`[enter approved ticket, pull request, or authorized email reference]`

Signature or electronic authorization:

`[enter approved signature or auditable electronic authorization]`

Approval date:

`[YYYY-MM-DD]`

G1 status:

`PENDING`

## G3 — Load, spike, soak, recovery, and rollback authorization

### Isolated environment

Approved load-test environment:

`[enter isolated environment identifier]`

Environment owner:

`[enter environment owner]`

Isolation confirmation:

`[confirm that this environment cannot affect production or unrelated systems]`

Approved test traffic source:

`[enter approved load-generator identity or environment]`

### Load test

Virtual users:

`[enter approved number]`

Request rate:

`[enter approved requests per second]`

Duration:

`[enter approved duration]`

Traffic profile:

`[describe the approved representative non-production traffic]`

### Spike test

Starting load:

`[enter starting users or requests per second]`

Peak load:

`[enter peak users or requests per second]`

Ramp-up duration:

`[enter duration]`

Peak duration:

`[enter duration]`

Ramp-down duration:

`[enter duration]`

### Soak test

Sustained load:

`[enter approved users or requests per second]`

Duration:

`[enter approved duration]`

### Performance thresholds

Maximum p95 latency:

`[enter approved threshold]`

Maximum p99 latency:

`[enter approved threshold]`

Maximum error rate:

`[enter approved percentage]`

Maximum CPU utilization:

`[enter approved percentage]`

Maximum memory utilization:

`[enter approved percentage]`

Maximum database connection utilization:

`[enter approved percentage]`

Maximum Redis utilization:

`[enter approved percentage]`

Required recovery time:

`[enter approved recovery threshold]`

### Cloud budget

Maximum approved test budget:

`[enter currency and maximum amount]`

Budget owner:

`[enter budget owner]`

Cost-alert threshold:

`[enter cost-alert threshold]`

Automatic budget-stop mechanism:

`[enter approved mechanism, or write "None"]`

### Stop conditions

Stop the test immediately if:

- Error rate exceeds the approved threshold.
- Database or Redis data becomes inconsistent.
- The test affects production or unrelated systems.
- Unexpected billing or uncontrolled resource usage occurs.
- Security controls are bypassed.
- The environment becomes unstable.
- The environment cannot recover.
- The approved budget is reached.
- The emergency-stop owner requests termination.
- Any unapproved endpoint or external service is contacted.

### Dependency-recovery scenarios

Approved scenarios:

- PostgreSQL connection failure and recovery.
- Redis outage and recovery.
- External-service timeout and recovery.
- Queue or worker interruption and recovery.
- Container restart and health-check recovery.
- Network dependency failure and recovery.

Data-integrity validation:

`[describe the approved validation method]`

Recovery evidence location:

`[enter approved test-report or artifact location]`

### Rollback procedure

Rollback procedure:

`[enter exact rollback command, process, or document link]`

Rollback target:

`[enter previous stable revision or image digest]`

Rollback owner:

`[enter rollback owner]`

Expected rollback duration:

`[enter expected duration]`

Rollback success criteria:

`[enter health, data, logs, metrics, and service criteria]`

Rollback evidence location:

`[enter approved rollback-test evidence location]`

### G3 approval

Approved by:

`[enter authorized G3 approver]`

Approver role:

`[enter G3 approver role]`

Approval reference:

`[enter approved ticket, pull request, or authorized email reference]`

Signature or electronic authorization:

`[enter approved signature or auditable electronic authorization]`

Approval date:

`[YYYY-MM-DD]`

G3 status:

`PENDING`

## G4 — Isolated backup and restore authorization

### Isolated database

Non-production database identifier:

`[enter isolated non-production database identifier]`

Database owner:

`[enter database owner]`

Database environment:

`[enter isolated database environment]`

Backup target:

`[enter approved non-production backup location]`

Backup encryption confirmation:

`[confirm that encryption is enabled]`

Backup access-control confirmation:

`[confirm that only authorized personnel and test identities can access the backup]`

### Data restrictions

Data source:

`SANITIZED TEST DATA ONLY`

Production personal data permitted:

`NO`

Production credentials permitted:

`NO`

Real payment data permitted:

`NO`

Production database connection permitted:

`NO`

### Recovery objectives

Target RPO:

`[enter approved recovery point objective]`

Target RTO:

`[enter approved recovery time objective]`

Backup creation time:

`[YYYY-MM-DD HH:MM UTC]`

Restore test time:

`[YYYY-MM-DD HH:MM UTC]`

### Restore validation

The restored database must pass:

- Database connectivity.
- Schema validation.
- Migration status validation.
- Table validation.
- Index validation.
- Relationship validation.
- Constraint validation.
- Representative read checks.
- Representative write checks.
- Application health checks.
- Authentication and authorization checks.
- Data-integrity checks.
- No unexpected data loss.
- No connection to production services.
- No exposure of backup contents outside the isolated environment.

Restore validation owner:

`[enter restore validation owner]`

Restore evidence location:

`[enter approved restore-test report or artifact location]`

### Cleanup procedure

Temporary restored database cleanup:

`[enter exact deletion or cleanup procedure]`

Temporary storage cleanup:

`[enter exact cleanup procedure]`

Temporary credential revocation:

`[enter exact revocation procedure]`

Network and firewall cleanup:

`[enter exact cleanup procedure]`

Evidence-retention location:

`[enter approved artifact or ticket location]`

Cleanup verification owner:

`[enter person responsible for confirming cleanup]`

### G4 approval

Approved by:

`[enter authorized G4 approver]`

Approver role:

`[enter G4 approver role]`

Approval reference:

`[enter approved ticket, pull request, or authorized email reference]`

Signature or electronic authorization:

`[enter approved signature or auditable electronic authorization]`

Approval date:

`[YYYY-MM-DD]`

G4 status:

`PENDING`

## G5 — Independent penetration-test authorization

### Independent tester

Tester or company:

`[enter real independent tester or security company]`

Tester contact:

`[enter verified business contact]`

Independence confirmation:

`[explain how the tester is independent from the implementation and deployment team]`

Conflict-of-interest confirmation:

`[confirm that no prohibited conflict of interest exists]`

### Approved penetration-test scope

Approved target:

`https://ca-scrolith-staging-api.yellowmushroom-b8714740.southeastasia.azurecontainerapps.io`

Approved environment:

`cae-scrolith-staging`

Approved domains:

- `ca-scrolith-staging-api.yellowmushroom-b8714740.southeastasia.azurecontainerapps.io`

Additional approved domains:

- `[enter approved domains, or write "None"]`

Approved APIs:

- `[enter approved API paths]`

Approved features:

- `[enter approved features]`

Out of scope:

- Production systems.
- Destructive actions.
- Denial-of-service testing unless separately authorized.
- Real customer data.
- Real payment transactions.
- Unapproved third-party services.
- Credential attacks against real users.
- Any domain, API, or feature not listed in the approved scope.

### Rules of engagement

Rules-of-engagement document:

`[enter approved document link or ticket]`

Allowed testing methods:

`[describe approved methods]`

Prohibited testing methods:

`[describe prohibited methods]`

Test data restrictions:

`SANITIZED TEST DATA ONLY`

Emergency-stop procedure:

`[describe exact emergency-stop procedure]`

Finding-severity method:

`[enter approved severity classification method]`

Evidence-handling method:

`[describe how evidence, credentials, logs, and personal data will be handled]`

### Test dates

Test start:

`[YYYY-MM-DD HH:MM UTC]`

Test end:

`[YYYY-MM-DD HH:MM UTC]`

Emergency contact:

`[enter real name and verified contact information]`

### Retest requirement

A retest is required after remediation.

Retest deadline:

`[enter approved retest deadline]`

Retest scope:

`[enter findings and components that must be retested]`

Required deliverables:

- Final penetration-test report.
- Severity classification for each finding.
- Affected endpoint or component.
- Redacted evidence.
- Remediation recommendations.
- Retest report.
- Confirmation of unresolved findings.
- Confirmation that testing stayed within the approved scope.

### G5 approval

Approved by:

`[enter authorized G5 approver]`

Approver role:

`[enter G5 approver role]`

Approval reference:

`[enter approved ticket, pull request, or authorized email reference]`

Signature or electronic authorization:

`[enter approved signature or auditable electronic authorization]`

Approval date:

`[YYYY-MM-DD]`

G5 status:

`PENDING`

## 0%-traffic staging candidate

This section must remain pending until G1, G3, G4, and G5 are approved and completed successfully.

No candidate may be deployed or exposed to traffic while any gate is pending or blocked.

### Candidate identity

Candidate commit:

`PENDING — add exact validated commit after G1–G5 pass`

Runtime image digest:

`PENDING — add exact sha256 digest after candidate build`

SBOM checksum:

`PENDING — add exact checksum after candidate build`

SBOM artifact:

`PENDING — add retained SBOM artifact link`

Candidate CI evidence:

`PENDING — add authoritative workflow links for the exact candidate commit`

### Staging target

Staging service:

`ca-scrolith-staging-api`

Staging environment:

`cae-scrolith-staging`

Staging URL:

`https://ca-scrolith-staging-api.yellowmushroom-b8714740.southeastasia.azurecontainerapps.io`

Resource group:

`rg-scrolith-staging`

Traffic allocation:

`0%`

Production traffic change permitted:

`NO`

Staging owner:

`PENDING — add staging owner`

### Pre-candidate checks

The following must pass before candidate creation:

- G1 authenticated DAST completed with no blocking unresolved findings.
- G3 load, spike, soak, dependency-recovery, and rollback tests completed.
- G4 backup and restore rehearsal completed within approved RPO and RTO.
- G5 independent penetration test completed.
- Required retests completed or formally accepted.
- Candidate commit is identified exactly.
- Runtime image digest is recorded exactly.
- SBOM checksum is recorded exactly.
- Rollback revision is known and available.
- Go/no-go owner has approved the candidate.

### Monitoring plan

Health checks:

- Application health endpoints.
- Authentication.
- MFA and passkeys.
- Session handling.
- Authorization.
- PostgreSQL connectivity.
- Redis connectivity.
- Queues and workers.
- Logs.
- Metrics.
- Alerts.
- Critical user journeys.

Monitoring dashboard:

`PENDING — add approved monitoring dashboard`

Monitoring owner:

`PENDING — add monitoring owner`

Monitoring window:

`PENDING — add approved monitoring period`

Alert thresholds:

`PENDING — add approved alert thresholds`

Incident escalation procedure:

`PENDING — add approved escalation procedure`

### Rollback validation

Rollback procedure:

`PENDING — add exact rollback procedure`

Rollback target revision:

`PENDING — add exact previous stable revision`

Rollback image digest:

`PENDING — add exact rollback image digest`

Rollback owner:

`PENDING — add rollback owner`

Expected rollback duration:

`PENDING — add expected duration`

Rollback success criteria:

`PENDING — add exact success criteria`

Rollback test evidence:

`PENDING`

### Go/no-go approval

Go/no-go owner:

`PENDING — add authorized owner`

Go/no-go owner role:

`PENDING — add owner role`

Go/no-go decision:

`PENDING`

Go/no-go approval reference:

`PENDING`

Go/no-go signature or electronic authorization:

`PENDING`

## Final authorization decision

G1 status:

`BLOCKED`

G3 status:

`BLOCKED`

G4 status:

`BLOCKED`

G5 status:

`BLOCKED`

0%-traffic staging status:

`NOT STARTED`

Overall authorization status:

`PENDING EXECUTION AUTHORIZATION`

Authorization statement:

I confirm that the information in this document is complete and accurate for
the stated non-production scope. I confirm that no production deployment,
production traffic change, production database change, secret change, Redis
change, Key Vault change, or Mailpit change is authorized by this document.

Authorized by:

`[enter authorized owner name]`

Authorized role:

`[enter authorized owner role]`

Signature:

`[enter signature or approved electronic authorization]`

Date:

`[YYYY-MM-DD]`

Approval reference:

`[enter approved change ticket, pull request, or authorized email]`

## Execution rule

The coding agent must not execute any gate while this document contains
placeholders or while any gate status is `PENDING` or `BLOCKED`.

The overall status may be changed to:

`APPROVED FOR GATE EXECUTION`

only after:

- G1 fields are complete and approved.
- G3 fields are complete and approved.
- G4 fields are complete and approved.
- G5 fields are complete and approved.
- All placeholders have been removed.
- All required signatures or auditable approvals are recorded.
- The exact candidate commit, image digest, SBOM checksum, staging target,
  rollback revision, monitoring plan, and go/no-go owner are recorded.
- The candidate remains at 0% traffic until explicit go/no-go approval.

Production remains out of scope until a separate production release
authorization is created and approved.
