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

No release gate may begin until its required fields are completed, reviewed, and
formally approved.

This document authorizes non-production testing only. It does not authorize:

- Production deployment.
- Production traffic changes.
- Production database changes.
- Production secret, Key Vault, or Redis changes.
- Use of real customer data.
- Destructive testing outside the approved scope.
- Unapproved denial-of-service testing.
- Testing third-party systems without authorization.
- Mailpit or email changes outside the approved test environment.

All testing must use approved non-production or isolated infrastructure.

## G1 — Authenticated DAST authorization

### Target

Approved staging URL:

`[enter the real approved staging URL]`

Approved environment:

`[enter the staging environment or service identifier]`

### Scope

Approved domains:

- `[enter approved domain]`

Approved API paths:

- `[enter approved API paths]`

Approved application areas:

- Authentication and session management.
- MFA and passkey flows.
- Authorization and role boundaries.
- API access controls.
- File uploads.
- SSRF and unsafe URL protections.
- Rate limiting.
- Payment-related test flows using test data only.
- Messaging and marketplace test flows using test data only.
- Sensitive-data exposure checks.

Out of scope:

- Production systems.
- Unapproved domains or third-party services.
- Destructive actions.
- Denial-of-service testing.
- Real customer data.
- Real payment transactions.
- Credential attacks against real users.

### Authorized test accounts

Account 1 identifier:

`[enter test account identifier]`

Account 1 role:

`[enter role]`

Account 2 identifier:

`[enter test account identifier]`

Account 2 role:

`[enter role]`

Passwords, tokens, cookies, API keys, and secret values must never be written
in this document.

### Test window

Start time in UTC:

`[YYYY-MM-DD HH:MM UTC]`

End time in UTC:

`[YYYY-MM-DD HH:MM UTC]`

### Testing limits

Maximum requests per second:

`[enter approved limit]`

Maximum concurrent sessions:

`[enter approved limit]`

Maximum request duration:

`[enter approved limit]`

Testing must stop immediately if the staging environment becomes unstable,
unexpected external systems are affected, real data is exposed, or approved
limits are exceeded.

### Emergency stop

Emergency-stop contact name:

`[enter real contact name]`

Emergency-stop email or phone:

`[enter real contact information]`

Emergency-stop procedure:

`[enter exact stop procedure]`

### G1 approval

Approved by:

`[enter authorized approver]`

Approver role:

`[enter approver role]`

Signature or approval reference:

`[enter signed ticket, approved pull request, or authorized email reference]`

G1 authorization status:

`PENDING`

## G3 — Load, spike, soak, recovery, and rollback authorization

### Environment

Approved isolated load-test environment:

`[enter environment identifier]`

Environment owner:

`[enter owner]`

Isolation confirmation:

`[confirm that the environment cannot affect production or unrelated systems]`

### Baseline load test

Virtual users:

`[enter number]`

Request rate:

`[enter requests per second]`

Duration:

`[enter duration]`

Traffic profile:

`[describe approved representative test traffic]`

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

`[enter users or requests per second]`

Duration:

`[enter duration]`

### Success thresholds

Maximum p95 latency:

`[enter threshold]`

Maximum p99 latency:

`[enter threshold]`

Maximum error rate:

`[enter percentage]`

Maximum CPU utilization:

`[enter percentage]`

Maximum memory utilization:

`[enter percentage]`

Maximum database connection utilization:

`[enter percentage]`

Maximum Redis utilization:

`[enter percentage]`

Required recovery time:

`[enter threshold]`

### Stop conditions

Stop the test immediately if:

- Error rate exceeds the approved limit.
- Database or Redis data becomes inconsistent.
- The environment affects production or unrelated systems.
- Unexpected billing or uncontrolled cloud resource usage occurs.
- Security controls are bypassed.
- The environment becomes unstable or cannot recover.
- The approved budget limit is reached.
- The emergency-stop owner requests termination.

### Budget

Approved maximum test budget:

`[enter currency and maximum amount]`

Budget owner:

`[enter owner]`

Cost-alert threshold:

`[enter threshold]`

### Dependency recovery tests

Approved failure scenarios:

- PostgreSQL connection failure and recovery.
- Redis outage and recovery.
- External-service timeout and recovery.
- Queue or worker interruption and recovery.
- Container restart and health-check recovery.
- Network dependency failure and recovery.

Data-integrity validation:

`[describe the approved validation]`

### Rollback plan

Rollback procedure:

`[enter exact rollback command, process, or document link]`

Rollback target:

`[enter previous stable revision or image digest]`

Rollback owner:

`[enter owner]`

Expected rollback duration:

`[enter duration]`

Rollback success criteria:

`[describe health, data, logs, metrics, and service validation criteria]`

### G3 approval

Approved by:

`[enter authorized approver]`

Approver role:

`[enter approver role]`

Signature or approval reference:

`[enter signed ticket, approved pull request, or authorized email reference]`

G3 authorization status:

`PENDING`

## G4 — Isolated backup and restore authorization

### Backup environment

Isolated database target:

`[enter non-production database identifier]`

Database owner:

`[enter owner]`

Backup target:

`[enter approved non-production backup location]`

Backup encryption confirmation:

`[confirm encryption is enabled]`

### Data authorization

Data source:

`SANITIZED TEST DATA ONLY`

Production personal data permitted:

`NO`

Production credentials permitted:

`NO`

Real payment data permitted:

`NO`

### Recovery objectives

Target RPO:

`[enter approved recovery point objective]`

Target RTO:

`[enter approved recovery time objective]`

### Restore validation

The restored database must pass:

- Database connectivity.
- Schema validation.
- Migration status validation.
- Table and index validation.
- Relationship and constraint validation.
- Representative read checks.
- Representative write checks.
- Application health checks.
- Authentication and authorization checks.
- Data-integrity checks.
- No unexpected data loss.

Restore validation owner:

`[enter owner]`

### Cleanup

Temporary restored database deletion method:

`[enter exact cleanup method]`

Temporary storage cleanup method:

`[enter exact cleanup method]`

Temporary credential revocation method:

`[enter exact revocation method]`

Evidence-retention location:

`[enter approved artifact or ticket location]`

### G4 approval

Approved by:

`[enter authorized approver]`

Approver role:

`[enter approver role]`

Signature or approval reference:

`[enter signed ticket, approved pull request, or authorized email reference]`

G4 authorization status:

`PENDING`

## G5 — Independent penetration-test authorization

### Independent tester

Tester or company:

`[enter real independent tester or security company]`

Tester contact:

`[enter verified business contact]`

Independence confirmation:

`[explain how independence from the implementation team is confirmed]`

### Scope

Approved target:

`[enter approved staging URL or environment]`

Approved domains:

- `[enter approved domain]`

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

### Rules of engagement

Rules-of-engagement document:

`[enter approved document link or ticket]`

Testing methods allowed:

`[describe approved methods]`

Testing methods prohibited:

`[describe prohibited methods]`

Emergency-stop procedure:

`[describe exact procedure]`

### Test window

Start time in UTC:

`[YYYY-MM-DD HH:MM UTC]`

End time in UTC:

`[YYYY-MM-DD HH:MM UTC]`

Emergency contact:

`[enter real name and contact]`

### Required deliverables

The independent tester must provide:

- Final penetration-test report.
- Finding severity classifications.
- Affected endpoint or component.
- Redacted evidence.
- Remediation recommendations.
- Retest report.
- Confirmation of unresolved findings.

### G5 approval

Approved by:

`[enter authorized approver]`

Approver role:

`[enter approver role]`

Signature or approval reference:

`[enter signed ticket, approved pull request, or authorized email reference]`

G5 authorization status:

`PENDING`

## 0%-traffic staging candidate authorization

This section remains inactive until G1, G3, G4, and G5 are completed and passed.

### Candidate identity

Candidate commit:

`[enter exact fully validated commit SHA]`

Runtime image digest:

`[enter exact sha256 image digest]`

SBOM checksum:

`[enter exact SBOM checksum]`

SBOM artifact:

`[enter retained SBOM artifact link]`

Candidate configuration reference:

`[enter approved configuration reference without secret values]`

### Staging target

Staging service or environment:

`[enter staging target]`

Traffic allocation:

`0%`

Production traffic change permitted:

`NO`

Staging owner:

`[enter owner]`

### Pre-candidate checks

The following must pass before deployment:

- G1 authenticated DAST and retest.
- G3 load, spike, soak, recovery, and rollback tests.
- G4 backup and restore rehearsal.
- G5 independent penetration test and retest.
- Full application test suite.
- Prisma validation and migrations.
- TypeScript build.
- Docker build.
- Production-only and full npm audit.
- CodeQL SARIF evidence validation.
- Trivy runtime-image and IaC scans.
- Gitleaks.
- SBOM generation and checksum verification.

### Health validation

Validate:

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
- Payment test flows using test data only.
- Messaging and marketplace test flows using test data only.

### Rollback validation

Rollback procedure:

`[enter exact rollback procedure]`

Rollback target revision:

`[enter exact previous stable revision]`

Rollback owner:

`[enter owner]`

Expected rollback duration:

`[enter duration]`

Rollback success criteria:

`[enter exact criteria]`

Rollback test evidence:

`PENDING`

### Go/no-go approval

Go/no-go owner:

`[enter authorized owner]`

Go/no-go decision:

`PENDING`

Go/no-go approval reference:

`PENDING`

## Final authorization decision

G1 status: `BLOCKED`

G3 status: `BLOCKED`

G4 status: `BLOCKED`

G5 status: `BLOCKED`

0%-traffic staging status: `NOT STARTED`

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

only after all required fields are completed, independently reviewed where
required, and formally authorized.

Production remains out of scope until a separate production release
authorization is created and approved.
