# Scrolith External Evidence and Release-Gate Register

**Programme:** Scalability, security, AI reliability, performance, observability, and Azure production readiness  
**Release policy:** Mandatory release freeze until all required gates pass or an authorized exception is recorded.  
**Last updated:** 2026-09-17 (Asia/Singapore)  
**Current release decision:** BLOCKED — external evidence and approvals are incomplete.

## Release freeze

Until the applicable gates are `PASSED`, this programme must not:

- commit or push the hardening batch;
- deploy or create a production candidate revision;
- change Azure traffic, replicas, production configuration, IAM/RBAC, secrets, DNS, SSL, billing, or scaling;
- run destructive tests or restores;
- modify customer, payment, KYC, private-message, or production application data.

Existing stable production services remain unchanged. Local test data and isolated test infrastructure are outside production scope and must be destroyed or stopped after each approved run.

## Status summary

| Gate | Owner | Status | Blocking dependency |
|---|---|---|---|
| G1 — Authenticated DAST | Security owner / AppSec | `BLOCKED` | Authorized staging scope, least-privilege test accounts, rules of engagement |
| G2 — Container, image, and IaC scans | Platform security owner | `BLOCKED` | Approved scanners, candidate artifacts, infrastructure-scan scope |
| G3 — Load, spike, soak, and recovery | SRE / Performance owner | `BLOCKED` | Approved production-like non-production environment and budget |
| G4 — Backup restore and disaster recovery | Data owner / Platform owner | `BLOCKED` | Approved isolated restore target, RTO/RPO, backup source and window |
| G5 — Independent penetration test and retest | Authorized independent tester | `BLOCKED` | Qualified tester, authorized scope, test accounts, rules of engagement |
| G6 — 0% candidate validation | Principal release owner | `BLOCKED` | Gates 1–5 passed or formally approved exceptions, plus candidate CI/CD approval |

## Evidence and approval request package

The following information is required from the authorized owners before execution begins. Do not send production credentials, real payment data, private keys, tokens, connection strings, KYC data, or customer exports.

### Access and scope

- Approved staging web URLs and API base URLs.
- Approved production-like non-production environment and Azure resource scope.
- Dedicated, least-privilege accounts for guest/public, normal member, freelancer, employer/company administrator, platform administrator, and any payment, marketplace, support, or gift roles required for authorization tests.
- Synthetic test data identifiers and ownership boundaries.
- Test-mode payment and Dashcoin Gift configuration.
- Permitted test window, request-rate limits, excluded endpoints, source IPs, and emergency contacts.
- Named security, data, platform, and release approvers.

### Test safety

- Written confirmation that production customer credentials and real payment data are excluded.
- Data classification and retention rules for test artifacts.
- Rules for redacting response bodies, logs, screenshots, traces, and reports.
- Approved cleanup procedure for synthetic accounts, files, queues, and restored databases.
- Budget ceiling for load testing and external security testing.

### Required evidence locations

Store reports and machine-readable outputs under a controlled, access-restricted evidence directory. Do not commit secrets or sensitive test data.

## Staging identity preparation (read-only assessment)

### Existing account architecture

The backend has a separable account model suitable for staging preparation:

- `User` is the application identity and supports `GUEST`, `USER`, `FREELANCER`, `EMPLOYER`, `CLIENT`, `MODERATOR`, and `ADMIN` roles.
- `StaffUser` is a one-to-one staff profile linked to `User`, with independent `StaffRole`, `StaffPermission`, status, password-hash, and `require2FA` fields.
- `StaffRole` and `StaffPermission` are database-backed and permissions are evaluated server-side through the RBAC service and `requirePermission` middleware.
- Staff login checks active staff status and active assigned role. Platform-admin context can receive the full permission set when the application `User.role` is an admin role; this must not be used for ordinary test identities.
- Passkey/WebAuthn credentials and user 2FA fields are stored separately from the staff role assignment. No credential or secret was inspected or printed.

The existing synthetic staff seed script is not a staging account approval or a safe substitute for the requested role matrix: it creates database records when run and covers only a narrow KYC scenario. It was inspected but not executed.

### Proposed dedicated staging test-account matrix

These are preparation specifications only. No accounts were created or modified.

| Test identity | Required application/staff permissions | Required synthetic data and tests | 2FA/passkey | Disable/delete after testing |
|---|---|---|---|---|
| Guest | Unauthenticated/public access only; no staff profile | Public homepage, login/signup, CORS, rate limits, unauthenticated access boundaries | Not applicable; use a clean browser/device profile | Delete test browser state; no account record should be created |
| Member | `User.role=USER`; own-profile, feed, messaging, notification, upload, and public-read capabilities only; no staff permissions | Synthetic profile, posts, comments, messages, notifications, one private file; session, ownership, IDOR/BOLA, logout, and account-switch tests | Passkey optional for baseline; enable a test passkey for recovery/session coverage | Revoke sessions, disable account, remove synthetic media/messages, then delete through approved staging cleanup |
| Freelancer | `User.role=FREELANCER`; own gigs, proposals, resume/file library, profile, messaging, and marketplace actions only | Synthetic gig, portfolio, resume, proposal, job application, media, wallet test-mode records; authorization and upload tests | Enable test 2FA/passkey for high-risk flows; no real payout/KYC data | Revoke sessions, cancel test workflows, remove files/assets, disable then delete account and owned records |
| Employer/company administrator | `User.role=EMPLOYER` or approved client/company-owner context; company-owned jobs/listings/pages and applicant visibility only; no platform-admin permissions | Synthetic company, page, job, listing, applicant/proposal, message, and test-mode payment records; tenant-isolation and employer/applicant authorization tests | Enable test 2FA/passkey; require re-auth for company ownership and payment test actions | Revoke sessions, close test jobs/orders, remove company-owned synthetic data, disable then delete |
| Moderator | Existing system `Moderator` staff role only with moderation/read/audit permissions; do not alter the existing production Moderator role or assignments | Synthetic reports, posts, comments, chat events, appeals, and moderation cases; moderation boundary, audit, and cross-user access tests | Require 2FA and preferably a staging passkey | Set `StaffUser.status=INACTIVE` or `SUSPENDED`, revoke sessions, remove staging staff profile and linked test user after evidence retention approval |
| Analyst | Existing system `Analyst` staff role only with read-only governance/audit permissions; no write, moderation, payment, KYC-decision, or RBAC permissions | Synthetic audit, alert, approval, budget, integration, webhook, and AI-governance records; read-only boundary and export tests | Require 2FA and preferably a staging passkey | Set inactive, revoke sessions, remove staging staff profile and linked test user after evidence retention approval |
| Platform administrator | A newly provisioned staging-only staff profile with the existing `Admin` permission set, isolated to staging and never mapped to production | Synthetic tenant and platform fixtures, RBAC/feature-flag/config rollback dry runs, admin boundary and audit tests; never use customer or live financial data | Require 2FA and passkey; no waiver | Revoke all sessions/credentials, set inactive, remove staging staff profile and linked test user, and verify no production identity was changed |

### Account-safety requirements

- The Scrolith owner must approve the staging environment, account naming convention, test email delivery method, role assignments, 2FA/passkey enrollment method, data-retention period, and cleanup owner before provisioning.
- Use reserved non-routable test addresses or an approved test-mail sink. Do not send credentials through source control, logs, chat, or this register.
- Use synthetic identifiers and payment-provider test mode only. Do not seed KYC documents, real resumes, customer messages, production media, real payment instruments, or production exports.
- Provisioning must be performed by an approved staging-only script or admin workflow with an auditable change record, least privilege, idempotency, and a tested cleanup path. This read-only turn did not run any provisioning script.
- Existing production Moderator and Analyst roles and assignments remain unchanged. A duplicate production role must not be created or edited to support staging.

### Azure read-only findings

| Item | Verified result | Impact / limitation |
|---|---|---|
| Signed-in Azure identity | `Jem Damaha` (`ahamadjima_gmail.com#EXT#@ahamadjimagmail.onmicrosoft.com`), object ID recorded only in command output and not needed in this register | Identity was read-only inspected; no secret material was accessed |
| Tenant/subscription | Tenant `69714a88-3899-49d5-84c5-da229ec989c6`; enabled subscription `Scrolith Azure subscription` (`97cfbb17-c86e-41ac-8674-dfaa0258098d`) | One enabled/default subscription was returned |
| Current Azure RBAC | Signed-in identity has subscription-level `Owner` | Technically sufficient for staging operations, but owner access is not approval to create resources under the freeze; least-privilege staging access should be used |
| Existing resource groups | `rg-scrolith-production`, `rg-scrolith-edge-prod`, `NetworkWatcherRG`, and an Azure-managed monitoring resource group | No dedicated `rg-scrolith-staging` was found |
| Existing Container Apps | `ca-scrolith-backend`, `ca-scrolith-frontend`, and internal `ca-scrolitha-core` in `rg-scrolith-production`; one production Container Apps environment | No production-like staging Container Apps environment was found |
| Existing production-like staging | Not verified; current resources are production/edge resources and must not be used for DAST or load testing | A separate approved environment is required before Gates G1, G3, or G5 can run |
| Cost | No new resource was created and no billable change was made. A staging cost estimate cannot be authoritative without an approved topology, region, SKU, retention, load profile, and test window | Owner approval and a budget ceiling are required before any resource proposal or creation |

### Exact owner approval required

The Scrolith owner must provide written approval for: (1) a dedicated non-production resource group and production-like topology or confirmation that an existing isolated environment is approved; (2) synthetic-data and test-payment boundaries; (3) the seven account specifications above, including test-mail and 2FA/passkey enrollment; (4) staging URLs/API endpoints, DAST and penetration-test rules of engagement, rate limits, excluded endpoints, test window, and emergency contact; (5) approved scanner/tool access and candidate-artifact scope; (6) load-test budget and concurrency profile; (7) isolated restore target, backup source, RTO/RPO, retention, and cleanup; and (8) account/resource cleanup authority. Until this approval is recorded, G1–G6 remain blocked.

Recommended evidence paths:

- `docs/evidence/external-gates/g1-dast/`
- `docs/evidence/external-gates/g2-scans/`
- `docs/evidence/external-gates/g3-load-recovery/`
- `docs/evidence/external-gates/g4-restore/`
- `docs/evidence/external-gates/g5-pentest/`
- `docs/evidence/external-gates/g6-candidate/`

## Gate 1 — Authenticated DAST

| Field | Register entry |
|---|---|
| Gate ID / owner | G1 / Security owner and AppSec operator |
| Required access or approval | Dedicated least-privilege staging accounts for Guest, Member, Freelancer, Employer/company administrator, Moderator, Analyst, and Platform administrator; approved staging web/API URLs; written scope, rate limits, excluded endpoints, test window, emergency contact, and authorization to test business logic |
| Environment and test scope | Staging only; authentication/session, authorization/IDOR/BOLA, CORS, CSRF, CSP, XSS, SSRF, injection, upload security, WebSocket authorization, rate-limit bypass, payment/marketplace/Dashcoin Gift/webhook flows |
| Data classification and safety controls | Synthetic or sanitized data only; no production credentials, customer records, private messages, KYC data, or real payment data; redact reports and response bodies |
| Exact acceptance criteria | All Critical findings remediated/retested; High findings remediated or risk-accepted by the authorized owner with expiry; no auth, authorization, tenant-isolation, payment, gift, upload, or admin bypass |
| Evidence location | `docs/evidence/external-gates/g1-dast/` plus final signed report and retest results |
| Date/time completed | Not completed |
| Known limitation | No authorized staging scope or test accounts supplied; production DAST is prohibited |
| Rollback/no-change confirmation | No code, production data, traffic, or configuration changed; gate remains frozen |
| Status | `BLOCKED` |

## Gate 2 — Container, image, and IaC security scans

| Field | Register entry |
|---|---|
| Gate ID / owner | G2 / Platform security owner |
| Required access or approval | Approved container/image, SBOM, secret, and IaC scanners; candidate image digests; Azure/CI/CD/IaC scope; scanner credentials or service principals limited to approved non-production artifacts; permission to inspect artifacts without exposing secrets |
| Environment and test scope | Candidate backend, frontend, worker, and supporting images; Azure Container Apps, networking, storage, registry, identity/RBAC, deployment manifests, Terraform/Bicep/ARM, and CI/CD definitions |
| Data classification and safety controls | Scan metadata only; redact environment values, tokens, image layers, logs, and private configuration; no secret values in reports |
| Exact acceptance criteria | No Critical production-bound image or IaC vulnerabilities; High findings remediated/mitigated or formally accepted with expiry; no exposed secrets; SBOM attached |
| Evidence location | `docs/evidence/external-gates/g2-scans/` |
| Date/time completed | Not completed |
| Known limitation | Docker, Trivy, and approved IaC scanner are unavailable locally; Azure Defender assessment output was empty and is not evidence of a clean scan |
| Rollback/no-change confirmation | No image, registry, infrastructure, or production configuration changed |
| Status | `BLOCKED` |

## Gate 3 — Production-like load, spike, soak, and recovery

| Field | Register entry |
|---|---|
| Gate ID / owner | G3 / SRE and Performance owner |
| Required access or approval | Dedicated approved production-like non-production environment (none currently verified), topology equivalence statement, synthetic/sanitized data, test-mode payments, dashboards, alert access, concurrency profile, test window, and budget ceiling |
| Environment and test scope | Anonymous browsing; authenticated feed/infinite scroll; messaging/Socket.IO; search; uploads/media; marketplace/jobs; payment/Dashcoin Gift test flows; AI editing/chatbot fallback; queues/workers/retries/webhooks; Redis/AI/queue dependency failures |
| Data classification and safety controls | Non-production only; synthetic or sanitized data; no production traffic; no destructive tests; explicit concurrency/rate caps; cleanup after run |
| Exact acceptance criteria | Forecast peak plus at least 2× headroom; approved p95/p99/error/saturation/queue-age/WebSocket thresholds met; no unbounded queries, queue runaway, memory leak, pool exhaustion, or critical dependency failure |
| Evidence location | `docs/evidence/external-gates/g3-load-recovery/` |
| Date/time completed | Not completed |
| Known limitation | No approved production-like test environment or load-test budget; no load testing against production performed |
| Rollback/no-change confirmation | Current production replica maximum remains unchanged at four; no production traffic or scaling changed |
| Status | `BLOCKED` |

## Gate 4 — Backup restore and disaster recovery

| Field | Register entry |
|---|---|
| Gate ID / owner | G4 / Data owner and Platform owner |
| Required access or approval | Written data-owner and platform-owner approval for an isolated/non-production restore target, named backup source, test window, RTO, RPO, data handling, access controls, cleanup, and rollback procedure; no restore over active production |
| Environment and test scope | Approved isolated target; backup integrity, point-in-time restore where supported, application/database compatibility, data integrity, access control, recovery timing, and cleanup |
| Data classification and safety controls | Never restore over active production; restrict restored data; use approved encryption/access controls; delete temporary recovery data after sign-off |
| Exact acceptance criteria | Restore within approved RTO; recovered state meets RPO; application operates correctly; integrity and authorization checks pass; cleanup and rollback evidence attached |
| Evidence location | `docs/evidence/external-gates/g4-restore/` |
| Date/time completed | Not completed |
| Known limitation | No data-owner/platform-owner approval or isolated recovery target supplied |
| Rollback/no-change confirmation | No production restore or backup mutation performed |
| Status | `BLOCKED` |

## Gate 5 — Independent penetration test and retest

| Field | Register entry |
|---|---|
| Gate ID / owner | G5 / Qualified independent security tester and security owner |
| Required access or approval | Qualified independent tester, signed rules of engagement, authorized staging/cloud scope, dedicated Guest/Member/Freelancer/Employer/Moderator/Analyst/Platform-admin test accounts as applicable, emergency contact, and written data-safety approval |
| Environment and test scope | Web/mobile APIs; auth/passkeys/JWT/sessions/recovery; authorization/IDOR/BOLA; Socket.IO; uploads/storage; marketplace/payments/Dashcoin Gifts; admin; AI privacy/prompt injection/tool boundaries; Azure review; rate-limit and business logic |
| Data classification and safety controls | Authorized non-production scope; synthetic data and payment test mode; no production customer or payment data; secure report transfer and retention |
| Exact acceptance criteria | Independent report delivered; Critical issues remediated/retested; High issues remediated or risk-accepted with expiry; residual risks documented and accepted |
| Evidence location | `docs/evidence/external-gates/g5-pentest/` |
| Date/time completed | Not completed |
| Known limitation | No independent tester, authorization, or rules of engagement supplied |
| Rollback/no-change confirmation | No penetration testing performed against production; no production changes made |
| Status | `BLOCKED` |

## Gate 6 — 0% candidate validation

| Field | Register entry |
|---|---|
| Gate ID / owner | G6 / Principal release owner |
| Required access or approval | Gates 1–5 passed or formally approved exceptions; focused commit approval; CI/CD and Azure candidate authorization; platform-owner promotion approval |
| Environment and test scope | Immutable candidate at 0% traffic; probes, logs, database/Redis, queues/workers, auth/passkeys/sessions, feed, messaging, uploads, search, payments, gifts, marketplace, jobs, admin, AI health/fallback, headers/CORS/rate limits, dashboards/alerts/traces/rollback |
| Data classification and safety controls | Candidate isolated from user traffic; no production data changes; preserve stable rollback revision; redact validation output |
| Exact acceptance criteria | 0% validation passes with no Critical/unapproved High findings, no material business-flow regression, and rollback revision available; platform owner approves promotion |
| Evidence location | `docs/evidence/external-gates/g6-candidate/` |
| Date/time completed | Not completed |
| Known limitation | Candidate creation and deployment are prohibited until Gates 1–5 pass or authorized exceptions exist |
| Rollback/no-change confirmation | No candidate created; current stable revision and traffic allocation unchanged |
| Status | `BLOCKED` |

## Traffic promotion record

Traffic promotion is not authorized. When G6 passes, record each stage only with timestamps, revision IDs, traffic weights, observation duration, request volume, health thresholds, and owner approval:

| Stage | Candidate revision | Stable rollback revision | Traffic | Observation | Status |
|---|---|---|---:|---|---|
| 0% | Not created | Current stable retained | 0% | Not started | `BLOCKED` |
| 5% | Not created | Current stable retained | 5% | Not started | `BLOCKED` |
| 25% | Not created | Current stable retained | 25% | Not started | `BLOCKED` |
| 50% | Not created | Current stable retained | 50% | Not started | `BLOCKED` |
| 100% | Not created | Current stable retained at 0% | 100% | Not started | `BLOCKED` |

## Existing internal evidence (does not clear external gates)

- Backend: 175 suites / 1,166 tests passed against isolated PostgreSQL.
- AI-focused tests: 7 suites / 83 tests passed.
- Frontend/mobile: 602/602 tests passed.
- Backend and frontend production builds passed.
- Production smoke passed with one intentional authenticated-login skip.
- Azure read-only health, revision, traffic, replica, resource, and budget checks completed.

These results support remediation readiness but do not substitute for Gates 1–5 or 0% candidate validation.

## No-change confirmation

As of this update, no commit, push, candidate revision, Azure traffic change, production configuration change, production replica change, production secret rotation, destructive test, restore, or customer-data modification was performed for this programme.

## Phase A staging creation status

On 2026-09-17, the approved staging resource group `rg-scrolith-staging` was created in Southeast Asia. Foundational staging-only resources created there are: Log Analytics workspace, VNet and PostgreSQL subnet, private DNS zone/link, PostgreSQL Flexible Server, Standard LRS storage account and private media container, Basic ACR, staging managed identities, and a Container Apps environment. No production resource was referenced or changed.

The scoped US$150 budget-alert creation was attempted before application/account provisioning and was rejected by Azure with `RBACAccessDenied` for the Consumption API. Consequently, no staging budget alert exists yet and provisioning was stopped. Staging frontend/backend/Core/worker applications, Redis, Key Vault, the internal email sink, seven test identities, cleanup job, and budget alerts are not created. The staging PostgreSQL server was stopped after verification to avoid idle compute charges; no staging secret values are recorded here.

The next required approval/access is a staging-scoped Cost Management permission that can create and read a resource-group budget with 50%, 75%, and 100% notifications to the approved Azure account. After the budget is verified, provisioning may resume only for resources in `rg-scrolith-staging`. G1–G6 remain `BLOCKED`; no external testing is authorized.

## Phase A budget-permission diagnosis

### Failed request evidence

| Item | Verified result |
|---|---|
| Calling principal | Interactive Microsoft Entra user `Jem Damaha`; sign-in email `ahamadjima@gmail.com`; object ID `6a7d0b19-6588-4167-bec5-51d282957e13` |
| Principal type | `User`; not a managed identity, service principal, CI/CD identity, or other automation principal |
| Active tenant/subscription | Tenant `69714a88-3899-49d5-84c5-da229ec989c6`; subscription `Scrolith Azure subscription` (`97cfbb17-c86e-41ac-8674-dfaa0258098d`) |
| Failed operation | `PUT` create/update of an Azure Consumption budget |
| Failed target | `/subscriptions/97cfbb17-c86e-41ac-8674-dfaa0258098d/resourceGroups/rg-scrolith-staging/providers/Microsoft.Consumption/budgets/scrolith-staging-10day?api-version=2023-05-01` |
| Error | `RBACAccessDenied` / client reported interactive authentication required; subsequent read confirmed no budget exists |
| Existing assignment | Subscription-level `Owner` for the calling user was verified read-only; no role assignment was changed |

### Minimum permission diagnosis

The least-privilege built-in role is **Cost Management Contributor** (`434105ed-43f6-45c7-a02f-909b2ba83430`). Its verified actions include `Microsoft.Consumption/*` and `Microsoft.CostManagement/*`, which cover budget creation/read and budget threshold notifications configured on the budget. It should be assigned only at `/subscriptions/97cfbb17-c86e-41ac-8674-dfaa0258098d/resourceGroups/rg-scrolith-staging` if the tenant’s Cost Management provider accepts resource-group budget scope. Azure documentation describes Cost Management Contributor as the recommended least-privilege role and supports resource-group Cost Management access.

If the tenant/API refuses the role at resource-group scope, the owner must assign the same role at the Scrolith subscription scope as the smallest supported parent scope, with no billing-account or management-group expansion. No assignment was made during diagnosis. A separate Azure Monitor action group is not required for the planned budget email notifications; if the owner changes the design to use an action group or automation, a separately scoped action-group permission must be approved and reviewed.

### Resume condition

Phase A may resume only after the owner grants or confirms the approved Cost Management Contributor scope and the session can perform a read-only budget lookup followed by the single authorized staging-budget write. The first successful write must create only the US$150 `scrolith-staging-10day` budget with 50%, 75%, and 100% notifications to the approved owner email. Production budgets and resources must remain unchanged. G1–G6 remain `BLOCKED`.

### Budget authorization follow-up — 2026-09-17

The signed-in user’s direct `Cost Management Contributor` assignment at `rg-scrolith-staging` is now visible and active. No direct equivalent assignment exists at `rg-scrolith-production` or `rg-scrolith-edge-prod`; the pre-existing subscription-level `Owner` assignment remains unchanged and inherited.

The authorized budget request reached Azure validation but returned HTTP 400: `Invalid budget configuration, please use filter interface with 2019-05-01-preview version`. Azure’s supported budget definition also requires a monthly budget `startDate` to be the first day of the month. Therefore the requested exact period `2026-09-17` through `2026-09-27` cannot be created as a Monthly Azure budget without changing the approved period. No budget or alert was created. Owner confirmation is required to use a conservative `2026-09-01` start date (ending `2026-09-27`) or another approved budget design.

No Redis, Key Vault, application containers, email sink, test identities, cleanup job, tests, production deployment, commit, push, candidate revision, or traffic change was performed after this validation.

### Revised budget attempt — 2026-09-17

The approved single-value filter was verified before the write: `ResourceGroupName In [rg-scrolith-staging]`; neither `rg-scrolith-production` nor `rg-scrolith-edge-prod` was included. The subscription-scope `PUT` for `scrolith-staging-10day` then returned `RBACAccessDenied`, because the active `Cost Management Contributor` assignment is limited to the child resource-group scope while the approved Azure-compatible filtered budget is a subscription-scope budget.

No budget or alert was created. Creating a subscription-scope budget requires an additional subscription-scope Cost Management permission (preferably a custom role limited to budget read/write actions, if accepted by Azure; otherwise the built-in Cost Management Contributor at subscription scope). Such an assignment would not be resource-group-filter-aware and therefore requires explicit owner approval before it can be considered. No role assignment was changed. All other staging provisioning remains paused and G1–G6 remain `BLOCKED`.

### Custom staging-budget role review — 2026-09-17

| Item | Read-only evidence / status |
|---|---|
| Provider check | `Microsoft.Consumption` exposes `Microsoft.Consumption/budgets/read`, `Microsoft.Consumption/budgets/write`, and `Microsoft.Consumption/budgets/delete`. No delete action is proposed. |
| Required budget actions | `Microsoft.Consumption/budgets/read` and `Microsoft.Consumption/budgets/write`. Threshold notifications are properties of the budget write; no separate alert action is required for this design. |
| Metadata actions | `Microsoft.Resources/subscriptions/read` and `Microsoft.Resources/subscriptions/resourceGroups/read` are included only for subscription/resource-group scope validation. |
| Principal | `Jem Damaha` / `ahamadjima_gmail.com#EXT#@ahamadjimagmail.onmicrosoft.com`, object ID `6a7d0b19-6588-4167-bec5-51d282957e13`. |
| Assignable scope | `/subscriptions/97cfbb17-c86e-41ac-8674-dfaa0258098d` only. |
| Status | `BLOCKED` pending owner confirmation of the exact definition below. No custom role was created or assigned. |

Proposed custom-role JSON:

```json
{
  "Name": "Scrolith Staging Budget Operator",
  "IsCustom": true,
  "Description": "Create and read the approved filtered Scrolith staging budget only.",
  "Actions": [
    "Microsoft.Consumption/budgets/read",
    "Microsoft.Consumption/budgets/write",
    "Microsoft.Resources/subscriptions/read",
    "Microsoft.Resources/subscriptions/resourceGroups/read"
  ],
  "NotActions": [],
  "DataActions": [],
  "NotDataActions": [],
  "AssignableScopes": [
    "/subscriptions/97cfbb17-c86e-41ac-8674-dfaa0258098d"
  ]
}
```

Important Azure RBAC limitation: a subscription-scoped custom role can limit the principal to budget read/write operations, but standard role definitions cannot enforce a budget name or `ResourceGroupName` filter. The subsequent budget payload and verification will contain only `rg-scrolith-staging`; this role itself would technically permit budget write/read operations for other subscription budgets. No role creation, assignment, budget write, staging provisioning, test execution, commit, push, deployment, or traffic change was performed. G1–G6 remain `BLOCKED`.

### Approved custom role and staging budget verification — 2026-09-17

The owner confirmed the exact custom-role definition and acknowledged the Azure RBAC filter limitation. The custom role was created and assigned only to the approved user.

| Item | Verified result |
|---|---|
| Custom role ID | `/subscriptions/97cfbb17-c86e-41ac-8674-dfaa0258098d/providers/Microsoft.Authorization/roleDefinitions/59a7c472-f6c7-4679-b55f-74eb6ea35292` |
| Assignment ID | `/subscriptions/97cfbb17-c86e-41ac-8674-dfaa0258098d/providers/Microsoft.Authorization/roleAssignments/873c7ed7-5703-48c0-9699-0d435e45f9be` |
| Assigned principal | User object `6a7d0b19-6588-4167-bec5-51d282957e13` only |
| Role actions | `Microsoft.Consumption/budgets/read`, `Microsoft.Consumption/budgets/write`, `Microsoft.Resources/subscriptions/read`, `Microsoft.Resources/subscriptions/resourceGroups/read` |
| Role scope | Subscription `97cfbb17-c86e-41ac-8674-dfaa0258098d` only |
| Budget resource | `Microsoft.Consumption/budgets/scrolith-staging-10day` at subscription scope |
| Amount and period | USD `150`; `2026-09-01T00:00:00Z` through `2026-09-27T23:59:59Z`; monthly |
| Filter | `ResourceGroupName In [rg-scrolith-staging]` only |
| Notifications | Enabled actual-cost thresholds `50`, `75`, and `100`; approved owner email only |
| Production/edge filter check | `rg-scrolith-production` and `rg-scrolith-edge-prod` absent |
| Staging provisioning resume | Not performed; remains paused pending separate authorization |
| Gate status | G1–G6 remain `BLOCKED` |

The budget was verified by subscription-scope GET after creation. No production resource, budget, billing setting, traffic, replica, database, secret, DNS, user, or customer data was changed. No tests, commits, pushes, deployments, candidate revisions, or traffic changes were performed.

### Phase A approved staging resumption — 2026-09-17

Phase A resumed only inside `rg-scrolith-staging` after budget verification. Created/verified resources:

- Managed Redis `redis-scrolith-staging` (`Balanced_B0`, TLS 1.2, staging public endpoint; no production connectivity).
- Key Vault `kv-scrolith-stg-8098` with RBAC authorization and staging-only bootstrap secrets.
- Backend API Container App `ca-scrolith-staging-api`; URL: `https://ca-scrolith-staging-api.yellowmushroom-b8714740.southeastasia.azurecontainerapps.io`.
- Frontend Container App `ca-scrolith-staging-web`; URL: `https://ca-scrolith-staging-web.yellowmushroom-b8714740.southeastasia.azurecontainerapps.io`.
- Private internal Mailpit-compatible email sink `ca-scrolith-staging-mailpit`; operator URL: `https://ca-scrolith-staging-mailpit.internal.yellowmushroom-b8714740.southeastasia.azurecontainerapps.io`.
- Manual migration job `job-scrolith-staging-migrate` (created; execution failed before a replica was available, so database-backed identity provisioning remains blocked).
- Scheduled cleanup job `job-scrolith-staging-cleanup`, scheduled for 2026-09-27 03:00 UTC, with staging-only scope.
- Azure Monitor action group `ag-scrolith-staging`, API CPU alert, API memory alert, and portal dashboard `dashboard-scrolith-staging`.

The existing backend implements Scrolitha Core in-process with `SCROLITHA_PROVIDER=core`; no duplicate Core Container App was created. Background workers remain disabled because no durable queue/worker image was verified. Seven application test identities were not created because the staging migration failed; no credentials or identities were fabricated. The Mailpit UI is internal-only; SMTP connectivity still requires verification after the database/application schema is available.

All listed resources are in `rg-scrolith-staging` in Southeast Asia and carry `CleanupDate=2026-09-27` where Azure permits resource tags. Current Consumption budget readback reports USD 0.00 spend, but Azure cost reporting is delayed; planning estimate remains approximately US$70–US$145 for the approved window, subject to Managed Redis and Container Apps usage. Provisioning/scaling must stop if the 50/75/100% budget alerts or the US$150 cap are approached.

No DAST, scans, load/spike/soak tests, restore test, penetration test, production deployment, candidate revision, commit, push, or traffic change was performed. G1–G6 remain `BLOCKED`.

### Phase A final provisioning reconciliation — 2026-09-17

Post-migration reconciliation: the staging `scrolith` database now exists and all 136 Prisma migrations report applied. The active API revision is `ca-scrolith-staging-api--0000005`, running with one replica; `/api/health` returned HTTP 200. The frontend returned HTTP 200. The earlier failed migration-job executions remain historical failures; the manual migration job itself remains a staging-only resource and is not a production worker.

The seven application test identities remain **not created**. The application registration contract permits only self-registration roles (`FREELANCER`, `EMPLOYER`, and `CLIENT`); privileged `MODERATOR`, `ANALYST`, and `ADMIN` identities require a controlled staging-admin provisioning path, and `GUEST` is an unauthenticated test state rather than a stored account. No passwords, tokens, or fabricated credentials were generated or stored. Identity creation, SMTP delivery verification, and private Mailpit SMTP wiring remain follow-up work.

The staging API currently runs Scrolitha Core in-process and has no separate Core app or worker app. This avoids duplicate capacity and preserves the approved cost envelope. All created resources remain confined to `rg-scrolith-staging`; no production or edge resource was changed. G1–G6 remain `BLOCKED`.

### Phase B staging-readiness validation — 2026-09-17

#### Synthetic identity evidence

The approved staging-admin provisioning path was executed with a temporary staging-only seed image. The temporary image and execution app were deleted after completion. Login validation returned HTTP 200 for each account; no JWTs or passwords were printed.

| Identity | Synthetic account | Effective platform role | Privileged control | Lifecycle |
|---|---|---|---|---|
| Member | `staging-member-20260917@example.invalid` | `USER` | Not privileged | Password held in staging Key Vault; revoke by disabling/deleting the staging user |
| Freelancer | `staging-freelancer-20260917@example.invalid` | `FREELANCER` | Not privileged | Same staging-only lifecycle |
| Employer/company administrator | `staging-employer-20260917@example.invalid` | `EMPLOYER` | Not platform staff | Same staging-only lifecycle |
| Moderator | `staging-moderator-20260917@example.invalid` | Staff `Moderator` | `require2FA=true` | Disable StaffUser/User, revoke sessions, then delete after testing |
| Analyst | `staging-analyst-20260917@example.invalid` | Custom `Staging Analyst` | Read-only permissions; `require2FA=true` | Same privileged lifecycle |
| Platform administrator | `staging-platform-admin-20260917@example.invalid` | Staff `Admin` | `require2FA=true` | Disable StaffUser/User, revoke sessions, then delete after testing |
| Guest | Not created | Unauthenticated state | N/A | Test without an account |

Credential delivery is through authorized staging operators retrieving the single synthetic password from `kv-scrolith-stg-8098` (`STAGING-TEST-PASSWORD`) over the approved private operator path. The secret is staging-only, is not logged, and must be deleted with the environment. Account revocation is disable → revoke sessions → remove StaffUser linkage where applicable → delete synthetic User records; cleanup evidence must be recorded. No production user, staff role, or permission changed.

#### Mailpit evidence and limitation

Mailpit remains an internal-only Container App at `ca-scrolith-staging-mailpit.internal...`. The current app exposes HTTP UI ingress on port 8025 but does not expose SMTP port 1025 through Container Apps ingress. Therefore SMTP connectivity and invitation/password-reset/2FA delivery cannot yet be marked passed. No public email or production email connection was used. Required next step: owner approval for a staging-only internal TCP SMTP ingress or an approved private SMTP sidecar design, followed by synthetic-message verification.

#### Redis evidence

`redis-scrolith-staging` is Azure Managed Redis `Balanced_B0`, TLS 1.2, with `publicNetworkAccess=Enabled`. No private endpoint or production network link exists. The selected SKU/design does not currently provide an approved low-cost IP allow-list path through the deployed configuration; disabling public access without a private endpoint would break staging connectivity. Compensating controls are TLS-only access, staging-only identity/configuration, no production connectivity, no key exposure, and the existing budget/cleanup controls. Private endpoint plus private DNS is the required hardening upgrade and needs owner approval because it adds a resource/cost.

#### Cost and control evidence

The verified budget remains USD 150, filtered exclusively to `rg-scrolith-staging`, with 50%, 75%, and 100% alerts enabled. Azure currently reports USD 0.00 spend; cost data is delayed. The forecast remains approximately US$70–US$145 for the approved period. The cleanup job remains provisioned with cleanup date `2026-09-27`; no new AI, worker, or load-test capacity was enabled.

Phase B status: identity creation and login validation `READY`; Mailpit SMTP verification `BLOCKED`; Redis private hardening `BLOCKED` pending private-endpoint approval; G1–G6 remain `BLOCKED`. No production resource, setting, user, role, database, secret, DNS, traffic, or billing configuration was changed.

### Phase B.1 authentication and email readiness — 2026-09-17

#### Credential isolation

The six identities previously used one shared `STAGING-TEST-PASSWORD`. That shared secret was deleted from the staging Key Vault. Six unique random passwords were created as separate staging Key Vault secrets: `STAGING-MEMBER-PASSWORD`, `STAGING-FREELANCER-PASSWORD`, `STAGING-EMPLOYER-PASSWORD`, `STAGING-MODERATOR-PASSWORD`, `STAGING-ANALYST-PASSWORD`, and `STAGING-PLATFORM-ADMIN-PASSWORD`. The rotation executor logged only account keys and never secret values. Each account login returned HTTP 200 after rotation. Privileged staff records retain `require2FA=true`; OTP/passkey enrollment itself was not completed by automation and must be completed through the approved staging enrollment flow before DAST.

#### Mailpit SMTP

The current Mailpit app remains internal-only HTTP ingress on target port 8025. Azure Container Apps ingress supports one transport/target-port configuration per app; changing it to TCP/1025 would remove the current HTTP UI path. No unsafe public SMTP exposure or production provider was introduced. Internal SMTP delivery remains `BLOCKED` pending owner approval for a private TCP SMTP sidecar/design that preserves the internal UI and shares the sink state. No synthetic password-reset, invitation, or 2FA email delivery was claimed as verified.

#### Redis

`redis-scrolith-staging` remains `Balanced_B0`, TLS 1.2, `publicNetworkAccess=Enabled`, with no firewall rules and no private endpoint connections. No Redis change was made under Phase B.1. Compensating controls remain staging-only credentials, TLS, no production connectivity, budget alerts, and cleanup tagging. A private endpoint/private DNS design is the recommended next upgrade and requires separate approval/cost review.

#### Cost and release boundary

The USD 150 subscription budget remains active with filter `ResourceGroupName In [rg-scrolith-staging]` and 50%, 75%, and 100% notifications. Azure-reported current spend remains USD 0.00 at read time; reporting is delayed. No new paid AI, worker, or test capacity was enabled. G1–G6 remain `BLOCKED`; no commit, push, production deployment, candidate revision, traffic change, DAST, scan, load test, restore test, or penetration test was performed.

### Phase B.1 security-readiness authorization — 2026-09-17

#### Redis control review

Read-only inspection of `redis-scrolith-staging` verified:

| Control | Evidence | Result |
|---|---|---|
| Resource and region | `Microsoft.Cache/redisEnterprise/redis-scrolith-staging`, Southeast Asia | Staging-only |
| SKU | `Balanced_B0` | Unchanged |
| TLS | `minimumTlsVersion=1.2` | Enforced |
| Public access | `publicNetworkAccess=Enabled` | Current exposure remains |
| Firewall rules | `null` | No SKU-supported IP allowlist was available in the inspected interface |
| Private endpoint | Empty connection list | None present |
| Production connectivity | No production endpoint, identity, network, or secret was configured | No production connection evidenced |

The inspected Azure Managed Redis interface exposes an Enabled/Disabled public-network control but no firewall-rule allowlist for this deployed SKU. Disabling public access now would break the existing staging application path because no private endpoint exists. No Redis change was made. The lowest-cost secure upgrade path is a staging-only private endpoint plus private DNS, subject to separate owner approval and cost review. Current compensating controls are TLS 1.2, staging-only credentials/configuration, no production connectivity, restricted operator access, budget alerts, and cleanup tagging.

#### Manual privileged MFA/passkey procedure

`require2FA=true` remains enabled for the synthetic Moderator, Analyst, and Platform Administrator staff records. No MFA requirement was weakened, bypassed, disabled, or simulated, and no OTP seed, QR code, password, token, or passkey material is recorded here.

For each privileged staging identity, the Scrolith owner must:

1. Retrieve that account’s staging-only credential through the authorized private Key Vault operator path; never place it in chat, source, logs, screenshots, or tickets.
2. Open the staging URL over HTTPS and sign in using the account’s isolated credential.
3. Open the staging Security/Authentication settings and choose the supported TOTP or passkey enrollment flow.
4. Complete the QR/OTP or passkey ceremony on the owner-controlled device; retain the authenticator only in the approved password manager/device.
5. Sign out and sign back in, verify the MFA challenge, and record only the account identifier and pass/fail result.
6. Before cleanup, revoke sessions, remove the authenticator/passkey through the staging security flow, disable the user, and delete the synthetic account and associated Key Vault secret.

MFA enrollment is therefore `BLOCKED` for authenticated DAST until the owner completes these manual steps once for each privileged test account.

#### Mailpit internal-only design proposal

The existing `ca-scrolith-staging-mailpit` remains internal-only HTTP ingress on target port 8025 with no public FQDN and no SMTP exposure. Azure Container Apps does not provide a second TCP/1025 ingress on that same app while preserving the current HTTP UI transport. No public SMTP exposure or production mail provider was introduced.

The proposed low-cost design is a second staging-only internal TCP SMTP app/sidecar on port 1025, with state shared through the approved staging Mailpit persistence mechanism so the existing UI preserves message state. The backend would use only the internal staging DNS endpoint. Outbound SMTP would be disabled; no public DNS, public ingress, production provider, or customer mailbox would be used. This design requires separate owner approval for the additional app/persistence wiring and a cost check before implementation. Synthetic invitation, password-reset, and 2FA delivery remain unverified until that design is approved and configured.

#### G1 authenticated DAST preparation

| Area | Prepared scope |
|---|---|
| URLs | Staging frontend and API only: `ca-scrolith-staging-web` and `ca-scrolith-staging-api`; no production or edge URLs |
| Identities | Unauthenticated Guest state; synthetic Member, Freelancer, Employer/company administrator, Moderator, Analyst, and Platform Administrator accounts |
| Tests | Authentication/session, authorization and IDOR/BOLA, account/tenant boundaries, CORS/CSRF/CSP/XSS/injection/SSRF, upload ownership and signed URLs, WebSocket auth/events, rate-limit bypass, test-mode payments/gifts/marketplace, webhook signature/replay handling, admin boundaries, and AI prompt/tool isolation |
| Exclusions | Production/edge systems, real payments, customer/private data, public email, destructive deletion, restore, denial-of-service, secret extraction, real webhooks, DNS/SSL/IAM/billing changes, and activity outside the approved window |
| Proposed limits | 1 request/second per account; 0.5 request/second per IP on sensitive routes; max 2 WebSocket connections/account; max 1 upload/second/account; max 1 AI request/10 seconds/account; max 5 DAST workers |
| Emergency stop | Stop the scanner, disable the relevant staging feature flag if needed, preserve redacted evidence, and notify the owner immediately for auth bypass, data exposure, payment mutation, runaway load, budget alert, or service instability |
| Status | `BLOCKED` pending owner/security approval, staging test window, account access, manual privileged MFA completion, and emergency contact confirmation |

#### G2 scanner preparation

No scanner was installed or run. The prepared plan is:

- Dependencies: `npm audit --omit=dev` plus OSV-Scanner or approved registry-backed scanner for frontend, backend, mobile, and deployable lockfiles.
- Secrets: Gitleaks or approved secret scanner against source, history permitted by the owner, images, manifests, logs, and deployment artifacts; findings are never copied into reports.
- Source/SAST: Semgrep, CodeQL, or Sonar with TypeScript/JavaScript, Express, Prisma, React, mobile, and authentication rules.
- IaC: Checkov and/or Trivy against Azure Container Apps, networking, storage, identity/RBAC, deployment manifests, and CI/CD definitions.
- Images: Trivy and/or Microsoft Defender for Cloud against frontend, backend, worker, and supporting images.
- SBOM: Syft or approved equivalent, followed by Grype/OSV/Defender vulnerability correlation.

Acceptance is no Critical vulnerability or exposed secret; High findings must be fixed, mitigated with documented compensating controls, or formally risk-accepted by the authorized security owner with an expiry date. G2 remains `BLOCKED` pending approved scanner access, artifact/source scope, evidence storage, test window, and finding-acceptance owner.

#### Cost and non-impact evidence

### Phase B.2 staging private Redis hardening pre-creation gate — 2026-09-17

### Phase B.4 staging cost optimization and private Redis execution — 2026-09-17

#### Optimization actions

- PostgreSQL `psql-scrolith-staging` was stopped outside an approved test window, reducing compute spend while idle. It was started again for the post-network API health check; Azure reported the API health endpoint HTTP 200.
- No AI capacity, worker capacity, load-testing capacity, public email, or additional media capacity was enabled.
- No job was executed, no dashboard feature was removed, and no production resource was changed.
- Existing frontend, backend API, Redis, Key Vault, Mailpit, synthetic identities, VNet/private DNS, minimum monitoring, alerts, and cleanup capability were retained.

#### Cost evidence

Azure Consumption returned no billable staging rows for the queried period; current budget readback remains US$150 with US$0.00 reported spend, subject to delayed reporting. Before optimization, the planning range was US$70–US$145 for the window. After PostgreSQL idle-stop scheduling and excluding nonessential capacity, the conservative planning range is US$40–US$90 for 10 days before private networking and approximately US$43–US$100 including the estimated private endpoint/DNS increment. The exact realized amount remains dependent on Container Apps usage, PostgreSQL runtime, Redis runtime, logs, and subscription-specific Private Link rates.

#### Private Redis evidence

Created only in `rg-scrolith-staging`: subnet `snet-private-endpoints` (`10.240.3.0/27`), private endpoint `pe-redis-scrolith-staging`, NIC generated for that endpoint, private DNS zone `privatelink.redis.azure.net`, VNet link `link-staging-redis-private-dns`, and DNS zone group `redis-dns-zone-group`. Azure created the Redis A record at private IP `10.240.3.4`.

From the running staging API container, the canonical Redis hostname resolved to `10.240.3.4`; TCP 10000 was open; a Node TLS handshake succeeded with TLS 1.3 and cipher `TLS_AES_256_GCM_SHA384`, satisfying the TLS 1.2 minimum requirement. `redis-scrolith-staging.publicNetworkAccess` is now `Disabled`. The canonical hostname was preserved, so no staging application URL or production configuration changed. The deployed API environment does not currently expose a `REDIS_URL` variable; application-level Redis command/authentication and Redis-backed rate-limit behavior therefore remain unverified and require a separate approved runtime test with valid staging Redis authentication.

#### Application and rollback status

Staging API `/api/health` returned HTTP 200 after PostgreSQL restart. Login, session, rate-limit, and Socket.IO behavioral tests were not run under this cost-optimization action. Rollback remains staging-only: restore the prior backend Redis setting if changed, re-enable public Redis access through the supported API, and remove the staging DNS zone group/private endpoint/subnet only if required. PostgreSQL may be stopped again only outside an approved test window.

### Phase B.5 staging Redis application-integration audit — 2026-09-17

#### Verified backend contract

Read-only source and deployed-container inspection found these supported names and behaviors:

| Contract | Verified result |
|---|---|
| Distributed API rate limiting | Reads `REDIS_URL`, then `REDIS`; empty value returns no distributed store and `express-rate-limit` uses its default in-memory store |
| Gcoin transfer/conversion limits | Reads `REDIS_URL`, then `REDIS`; empty value uses in-process maps; Redis errors currently fall back to allowing the operation |
| Scrolitha session memory | Reads `SCROLITHA_SESSION_STORE` (`in_process` default) and `SCROLITHA_SESSION_REDIS_URL`; `distributed_placeholder` is not a real Redis adapter and still uses in-process storage |
| Redis client | `ioredis`; URL is passed directly to the client; rate-limit client uses lazy connect, 2-second connect timeout, one request retry, and no offline queue |
| TLS/format | No separate Redis TLS env var or secret-name contract exists in source; TLS must be expressed in the verified Redis URL/client options. Azure Managed Redis uses the canonical hostname on TLS port 10000 |
| Database index/prefixes | No explicit Redis database index is configured. Prefixes include `scrolith:ratelimit:`, `gcoin:transfers:`, and `gcoin:conversions:` |
| Socket.IO | Uses JWT handshake auth and native Socket.IO rooms; no Redis adapter, `@socket.io/redis-adapter`, or Redis pub/sub integration is wired |
| Queues/cache/idempotency | No Redis queue/cache client is instantiated by the deployed API. Idempotency references optional `global.redisClient`; no initializer was found |
| Secret names | No Redis Key Vault secret name is referenced by backend source or the deployed API environment. The API environment currently has neither `REDIS_URL` nor `REDIS` nor `SCROLITHA_SESSION_REDIS_URL` |

#### Staging result and decision

The deployed backend is not using Redis. DNS and TLS network checks prove private network reachability only; they do not prove authenticated Redis commands, Redis-backed rate limiting, distributed sessions, or Socket.IO cross-replica synchronization. No unused Redis setting or secret was injected, no staging backend revision was created, and no source code was changed.

API health was previously verified HTTP 200 and the staging frontend was previously verified HTTP 200. Login/session, Redis-backed rate-limit, and Socket.IO behavioral checks were not claimed because the deployed contract has no Redis configuration and no approved Redis authentication secret name. Redis public access remains disabled. All inspected resource IDs remain staging-scoped.

#### Security and scalability gap

The current design has per-instance in-memory API rate limits and session memory, no cross-replica Socket.IO adapter, and an optional Gcoin fallback that allows operations when Redis errors. This is a documented scalability/security gap for multi-replica production use. Closing it requires a separate implementation approval covering a real Redis adapter/credential contract, fail-closed financial limits, Socket.IO Redis adapter design, key prefix/database isolation, rotation, telemetry, and staging regression tests. G1 remains `BLOCKED` pending that approved plan and authenticated staging evidence; G2–G6 remain `BLOCKED`.

#### Production non-impact

No production code, Container App, Redis, secret, traffic, replica, DNS, database, user, customer data, or billing configuration was changed. No DAST, scan, load test, restore test, penetration test, commit, push, deployment, candidate revision, or traffic change was performed.

### Phase B.6 staging Redis security/scalability remediation — 2026-09-18

#### Focused source changes prepared

- `src/middleware/distributedRateLimitStore.ts`: Redis-backed API rate limiting now applies a bounded fail-closed response in production/staging when Redis is unavailable; namespaced TTL behavior is preserved.
- `src/middleware/gcoinLimits.ts`: Gcoin transfer/conversion checks deny safely when the configured protection store fails or is absent in protected runtimes; no payment or secret data is logged.
- `src/services/scrolitha/scrolitha.sessionStore.ts`: added a real `ioredis` session adapter behind the existing `SCROLITHA_SESSION_STORE=redis` and `SCROLITHA_SESSION_REDIS_URL` contract, with TTL, key prefix, JSON isolation, timeout, and graceful close behavior.
- Socket.IO source was not changed because no Redis adapter dependency is installed and dependency upgrades/additions were prohibited. Multi-replica Socket.IO remains blocked; staging remains single-replica for this surface.

No database migration or unrelated dependency change was introduced by this remediation. Existing unrelated worktree changes were not included in these focused edits.

#### Staging authentication blocker

Read-only inspection of the staging Redis `default` database verified `accessKeysAuthentication=Disabled`. No staging Redis access-key secret or approved Microsoft Entra Redis-user/token-refresh contract is currently available. The backend deployment also has no `REDIS_URL`, `REDIS`, or `SCROLITHA_SESSION_REDIS_URL`. No unused Redis secret/configuration was injected.

Private DNS and TLS network reachability remain verified, but authenticated Redis commands, Redis-backed rate limiting, distributed sessions, and Socket.IO synchronization cannot be proven until the owner authorizes one supported authentication path. Preferred path is the staging managed identity with an explicitly scoped Redis data-access assignment and a client token-refresh implementation; access keys are a fallback only if separately approved and stored exclusively in staging Key Vault. [Azure Managed Redis authentication guidance](https://learn.microsoft.com/en-us/azure/redis/entra-for-authentication)

#### Validation status

TypeScript compilation produced no compiler errors. The Scrolitha session test suite passed. Gcoin integration/controller tests failed because the local test PostgreSQL endpoint `127.0.0.1:55432` was unavailable, not because a Redis assertion failed. No Redis runtime configuration was changed, no staging candidate revision was created, and no authenticated runtime tests were run.

Status: `BLOCKED` pending staging Redis authentication approval/configuration, a reachable isolated test database for the failed suites, authenticated Redis tests, and staging candidate validation. G1–G6 remain `BLOCKED`. No production resource, configuration, traffic, identity, secret, database, or customer data was changed; no commit or push was performed.

Production non-impact is confirmed: no production Redis, VNet, DNS, application, identity, secret, traffic, replica, billing, database, or customer data changed. No DAST, scans, load tests, restore tests, penetration tests, commit, push, deployment, candidate revision, or traffic change occurred. G1–G6 remain `BLOCKED`.

### Phase B.7 staging Redis Entra authentication and isolated test database — 2026-09-18

#### Azure read-only evidence

- Signed-in principal: `ahamadjima@gmail.com` (tenant `69714a88-3899-49d5-84c5-da229ec989c6`), subscription `Scrolith Azure subscription` (`97cfbb17-c86e-41ac-8674-dfaa0258098d`).
- Staging runtime identity: `id-scrolith-staging-apps`; no secret or token was emitted.
- The runtime identity has no Redis data-access assignment. The staging deployment service principal has resource-group Contributor, but it is not the runtime identity and is not used for Redis data access.
- Redis `publicNetworkAccess` is `Disabled`; the `default` database has no access-policy assignments.
- Staging PostgreSQL is Ready, private-only (`publicNetworkAccess=Disabled`), PostgreSQL 17, Standard_B1ms. The isolated logical database `scrolith_test` was created inside this staging server; it contains no copied production/customer data and no migrations or test records were run.

#### Verified Entra contract

The runtime requires a Redis database access-policy assignment, not an ARM management role. The minimum built-in Redis data policy for the application’s read/write commands is `Data Contributor`, scoped to `redis-scrolith-staging` database `default`, targeting the managed identity object ID. The documented token audience is `https://redis.azure.com/.default`; the client username is the managed identity object ID, TLS uses the private canonical hostname on port `10000`, and token refresh must occur before expiry. See [Entra authentication](https://learn.microsoft.com/en-us/azure/redis/entra-for-authentication) and [custom data-access permissions](https://learn.microsoft.com/en-us/azure/redis/configure-access-permissions).

The authorized assignment is active: `redis-scrolith-staging/default` → Redis `default` policy → `id-scrolith-staging-apps` principal ID, assignment `stagingAppsDefault`, provisioning state `Succeeded`. The Managed Redis `default` policy grants full cache access and is temporary staging-only; it is not approved as a production least-privilege model. Cleanup requirement: remove assignment `stagingAppsDefault` on September 27, 2026. Access keys remain disabled and prohibited.

#### Isolated test database decision

The existing private staging PostgreSQL server is topology-isolated and has no public network access. The separate logical database `scrolith_test` was created as the smallest-cost safe option; migrations must use a database-specific connection and synthetic data only. It does not copy the existing `scrolith` database or change production. No migrations or test records were applied. Test execution remains pending a staging-only internal runner/configuration procedure.

#### Validation and release status

- Internal runner execution `job-stg-redis-test-0918-m69w23v` used private `scrolith_test`, applied/verified 136 migrations, and then failed on heap exhaustion during the first complete run. A later bounded run produced: `apiRateLimitPolicy.spec.ts` passed (count not emitted in retained tail), `scrolitha.distributed.spec.ts` passed (8 tests), and `gcoinService.unit.test.ts` passed (3 tests). `gcoin.integration.test.ts` failed with Node heap exhaustion at the 2 GiB runner limit; the controller group did not execute. No authenticated Redis result was produced.
- Source preparation added `src/services/redis/entraRedis.ts`, using the managed identity, private TLS connection, token refresh at least three minutes before expiry, and jitter; `REDIS_ENTRA_CLIENT_ID` is required at runtime and no token is persisted or logged.
- Temporary runner, all temporary image tags, derived `DATABASE-URL-TEST` secret, and `scrolith_test` database were deleted after execution. No synthetic records were retained.
- Socket.IO Redis adapter: intentionally not added; multi-replica synchronization remains a separate blocked change.
- Existing local Gcoin integration/controller tests remain blocked by unavailable local PostgreSQL endpoint `127.0.0.1:55432`.
- No DAST, scans, load/spike/soak, restore, penetration testing, candidate revision, deployment, commit, push, or traffic change occurred.

Status: `BLOCKED`. The temporary assignment is verified but remains scheduled for cleanup on September 27, 2026. Required follow-up is a memory-safe test strategy for the integration/controller suites, explicit authenticated Redis command/token-refresh assertions, Redis rate-limit/Gcoin/session runtime validation, and complete regression results. No normal staging application revision was created. G1–G6 remain `BLOCKED`.

Production non-impact is confirmed: no production resource, configuration, secret, identity, database, DNS, traffic, replica, billing setting, user, or customer data changed.

### Phase B.3 staging cost-optimization review — 2026-09-17

#### Inventory and planning estimate

Read-only inventory found 22 resources in `rg-scrolith-staging`. Azure Consumption usage returned no billable staging rows for the queried period and current budget readback is US$0.00; cost reporting is delayed. The following are planning ranges in USD, not invoice-grade actuals, based on the observed SKUs/configuration and a 10-day test window. Container Apps are consumption-billed by allocated usage and requests, and can scale to zero; PostgreSQL compute is billed while running and storage/backup remain. [Azure Container Apps pricing](https://azure.microsoft.com/en-us/pricing/details/container-apps/), [Azure PostgreSQL Flexible Server pricing](https://azure.microsoft.com/en-us/pricing/details/postgresql/flexible-server/)

| Resource | Type/configuration | 10-day estimate | Monthly estimate | G1/G2 role |
|---|---|---:|---:|---|
| `log-scrolith-staging` | Log Analytics | $0–$8 | $0–$24 | Required for evidence/alerts; reduce retention/ingestion only with approval |
| `vnet-scrolith-staging` | VNet | $0 | $0 | Required for private PostgreSQL/Redis path |
| `staging.private.postgres.database.azure.com` | Private DNS zone | $0–$1 | $0–$1 | Required for PostgreSQL |
| `.../link-staging-postgres` | DNS VNet link | $0 | $0 | Required for PostgreSQL |
| `psql-scrolith-staging` | PostgreSQL B1ms, 32 GB, HA disabled | $4–$8 running; ~$0–$1 stopped | $12.41–$25 | Required for authenticated DAST; stop between approved windows |
| `stscrolithstaging8098` | Standard LRS storage | $0–$2 | $0–$6 | Required for test media; keep synthetic data bounded |
| `acrscrolithstaging8098` | ACR Basic | ~$2 | ~$5–$6 | G2 image scanning; nonessential after immutable images are available |
| `id-scrolith-staging-apps` | User-assigned identity | $0 | $0 | Required by app access |
| `id-scrolith-staging-cleanup` | User-assigned identity | $0 | $0 | Required for cleanup job |
| `cae-scrolith-staging` | Container Apps environment | Included with app usage | Included with app usage | Required by frontend/API/Mailpit |
| `kv-scrolith-stg-8098` | Standard Key Vault/RBAC | <$1 | <$2 | Required for credentials/configuration |
| `redis-scrolith-staging` | Managed Redis Balanced B0 | ~$4.4 | ~$13.14 | Required for DAST messaging/rate-limit/session paths |
| `ca-scrolith-staging-api` | 0.5 vCPU/1 GiB, min 1 | $5–$18 | $15–$55 | Required |
| `ca-scrolith-staging-web` | 0.25 vCPU/0.5 GiB, min 1 | $2–$8 | $6–$24 | Required for end-to-end DAST |
| `ca-scrolith-staging-mailpit` | Internal 0.25 vCPU/0.5 GiB | $2–$8 | $6–$24 | Required for email-flow DAST; no public SMTP |
| `job-scrolith-staging-migrate` | Container Apps job | $0 idle; <$1 per run | usage-based | Required only for schema setup |
| `ag-scrolith-staging` | Monitor action group | $0 | $0 | Required for release evidence |
| `alert-scrolith-staging-api-cpu` | Metric alert | <$1 | <$1 | Required |
| `alert-scrolith-staging-api-memory` | Metric alert | <$1 | <$1 | Required |
| `dashboard-scrolith-staging` | Portal dashboard | $0 | $0 | Useful but nonessential to test execution |
| `job-scrolith-staging-cleanup` | Scheduled cleanup job | $0 idle; <$1 per run | usage-based | Required for lifecycle safety |
| `job-scrolith-stg-identities` | Identity provisioning job | $0 idle; <$1 per run | usage-based | Nonessential after identities exist; retain for controlled lifecycle |

The current full-design planning range remains approximately US$70–US$145 for the approved window. The range is deliberately conservative because Azure usage data is delayed and the subscription-specific Container Apps/Private Link rates were not exposed by the read-only usage query.

#### G1/G2 essentiality and reductions

G1 requires the staging web app, API, PostgreSQL, Redis, Key Vault, Mailpit, synthetic identities, minimum logs/metrics/alerts, VNet/private DNS, and the migration/cleanup capability. G2 requires source and image artifacts, ACR or an approved external artifact source, Key Vault access for test configuration, and enough logs to preserve scan evidence; it does not require Scrolitha AI capacity, worker capacity, dashboard extras, or executed identity-provisioning jobs.

Safe planning reductions, requiring a separate change authorization before execution, are:

- Keep only the API, web, Mailpit, PostgreSQL, Redis, Key Vault, identities, minimum monitoring, and cleanup path active during the DAST window; stop PostgreSQL between windows where operationally safe.
- Do not run migration or identity jobs after successful completion; idle jobs have no execution charge.
- Do not provision Scrolitha AI or background-worker capacity; Scrolitha Core remains in-process.
- Use existing immutable images for G2; retain ACR for evidence until scan completion, then review it as a low-value cost item rather than deleting it during the evidence programme.
- Keep storage synthetic and bounded; avoid media processing, retention, and unused objects.
- Keep the portal dashboard but reduce Log Analytics ingestion/retention only after confirming G1/G2 evidence requirements.

#### Reduced design and private Redis estimate

The reduced design preserves frontend, backend, PostgreSQL, Redis, Key Vault, private Mailpit, required identities, VNet/private DNS, and minimum monitoring. It excludes AI capacity, workers, load-testing scale, public email, extra dashboards, unnecessary job executions, and unused media.

With the reduced design and scheduled test windows, the planning estimate is approximately US$40–US$90 for 10 days and US$90–US$180 at a month-equivalent run rate, depending mainly on PostgreSQL uptime, Container Apps active usage, Redis runtime, and log ingestion. The incremental Redis private endpoint design is approximately US$3–US$10 for 10 days at low synthetic traffic, comprising endpoint hours, minimal processed data, and DNS usage; exact pricing is subscription/region dependent. Azure documents Private Link endpoint-hour and processed-data billing, and private DNS zone/query billing. [Azure Private Link pricing](https://azure.microsoft.com/en-us/pricing/details/private-link/), [Azure DNS pricing](https://azure.microsoft.com/en-us/pricing/details/dns/)

#### Approved decision options

| Option | Design | Budget decision |
|---|---|---|
| A — cost-optimized staging | Retain only the reduced design; stop PostgreSQL between windows; do not run jobs or add AI/workers; keep Redis/API/web/Mailpit only for approved testing; add private Redis only after a fresh cost check | Expected US$40–US$90 for 10 days; the existing US$150 cap is potentially sufficient, but creation remains blocked until Azure pricing/headroom is rechecked immediately before provisioning |
| B — full staging design | Retain current always-available staging, full observability, ACR, and private Redis endpoint | Smallest realistic revised cap: US$175, providing approximately US$30 headroom above the current US$145 upper forecast and private-network uncertainty; requires owner budget approval |

No optimization was applied. No resource was created, deleted, resized, stopped, restarted, deployed, or reconfigured. G1–G6 remain `BLOCKED`.

#### Read-only design and cost decision

The requested private Redis design targets only `rg-scrolith-staging`, `redis-scrolith-staging`, `vnet-scrolith-staging`, and staging private DNS resources. The VNet currently has an ACA-delegated subnet `snet-aca-infra` (`10.240.0.0/23`) and a PostgreSQL-delegated subnet `snet-postgres` (`10.240.2.0/24`); neither is suitable for a new private endpoint. The design requires:

1. A new staging-only `snet-private-endpoints` subnet in `vnet-scrolith-staging`, proposed prefix `10.240.3.0/27`, with private-endpoint network policies disabled.
2. `pe-redis-scrolith-staging` in `rg-scrolith-staging`, targeting `redis-scrolith-staging` with group ID `redisEnterprise`.
3. Private DNS zone `privatelink.redis.azure.net`, VNet link `link-staging-redis-private-dns`, and zone group `redis-dns-zone-group` for the endpoint.
4. A staging-only backend configuration update retaining the normal Redis hostname `<cache>.<region>.redis.azure.net` and TLS port 10000; linked private DNS resolves it privately.

Microsoft documents this Managed Redis private DNS zone and recommends disabling public access only after private connectivity is verified. [Azure Managed Redis Private Link](https://learn.microsoft.com/en-us/azure/redis/private-link)

#### Cost gate

Azure-reported current staging spend is US$0.00, subject to delayed reporting. The existing forecast is approximately US$70–US$145 through the approved window, leaving only US$5 at the upper bound. Private Link adds endpoint hourly charges and processed-data charges; DNS adds hosted-zone/query charges according to the subscription offer and usage. The subnet has no standalone charge and no Redis SKU/capacity increase is proposed. [Azure Private Link pricing](https://azure.microsoft.com/en-us/pricing/details/private-link/), [Azure DNS pricing](https://azure.microsoft.com/en-us/pricing/details/dns/)

The USD 150 gate is not safely passed because subscription-specific endpoint pricing and traffic charges are not bounded below the remaining US$5. No subnet, endpoint, DNS resource, backend setting, or public-access change was made.

#### Phase B.8 — test-harness memory remediation evidence (2026-09-18)

- Root cause: the Gcoin integration test imported the full server graph and ts-jest built a repository-wide type-checking program. It also retained concurrent Supertest promises and lacked Prisma/Redis teardown. No oversized fixture, unbounded query, snapshot, or application worker was found.
- Remediation: isolated ts-jest transpilation with production `tsc` as the type gate; lightweight test app; bounded request batches; explicit Prisma/Redis cleanup and Redis-key cleanup; Entra Redis client/object-ID separation; rate-limit readiness and shutdown handling.
- Final staging execution: 0.5 vCPU/1 GiB temporary job, synthetic `scrolith_test` only, private Redis TLS 10000, staging managed identity only. 136 migrations/no pending migrations; integration 2/2 passed at 232 MB heap; controller 3/3 passed at 181 MB; service 3/3 passed at 49 MB. No skipped tests or heap exhaustion.
- Dedicated runtime groups for direct Redis commands, token refresh, distributed rate limiting, Redis-unavailable behavior, Scrolitha Redis sessions, and Gcoin protection-store denial were not present and remain gate blockers.
- Cleanup: temporary job, synthetic database, test Key Vault secret reference, and temporary ACR tags were deleted. Redis policy remains subject to September 27, 2026 cleanup. Production remains untouched; G1-G6 remain `BLOCKED`.

#### Phase B.9 - Redis runtime-test evidence (2026-09-18)

- Exact commands: `npx prisma migrate deploy`; `npx jest --config jest.config.cjs --runInBand --logHeapUsage --runTestsByPath src/services/redis/__tests__/entraRedis.unit.test.ts`; `npx jest --config jest.config.cjs --runInBand --logHeapUsage --runTestsByPath src/__tests__/redis.runtime.test.ts`.
- Execution: staging-only Container Apps Job `job-stg-redis-runtime-0918-9rd96qv`, 0.5 vCPU/1 GiB, synthetic `scrolith_test`, private Redis TLS port 10000, staging managed identity, and no production connectivity.
- Migration evidence: 136 migrations discovered; all applied successfully; no pending migrations.
- Entra unit suite: 1 suite, 2 passed, 0 skipped; peak reported heap 46 MB. Covered pre-expiry refresh scheduling with jitter, same-client reauthentication, and absence of token logging.
- Runtime suite: 1 suite, 3 passed, 0 skipped; peak reported heap 60 MB. Covered authenticated PING/SET/GET/PTTL/DEL, Redis-backed limiter initialization/increment with bounded TTL, and Redis session user/active-account isolation and deletion.
- Redis public access readback remained `Disabled`; private endpoint/DNS and TLS 1.2 were unchanged. No production resources or settings changed.
- Not covered by this focused run: dedicated Redis-unavailable route tests, Gcoin protection-store safe-denial integration, login/password-reset/payment/upload/messaging/AI-sensitive route failure tests, and multi-instance distributed enforcement. These remain blockers for the corresponding external evidence gates.
- Cleanup verification: temporary job, recreated `scrolith_test` database, runtime Key Vault secret reference, and temporary ACR image tag were confirmed absent. The temporary Redis default policy remains scheduled for cleanup on 2026-09-27.
- Cost: no capacity increase was made; Azure actual-cost reporting was delayed. The approved staging forecast remained within the USD 150 cap at the time of execution.
- G1-G6 remain `BLOCKED`.

#### Phase B.10 - Failure-path validation evidence (2026-09-18)

- Focused command: `npx jest --config jest.config.cjs --runInBand --runTestsByPath src/__tests__/gcoin.protection-failure.unit.test.ts src/services/redis/__tests__/entraRedis.unit.test.ts`.
- Result: 2 suites passed, 3 tests passed, 0 skipped. Controlled Redis-constructor failure caused both Gcoin transfer and conversion protection checks to return denial; no database operation was invoked and no token, secret, payment data, or private content was logged.
- Build command: `npm run build`; TypeScript compilation passed. `git diff --check` passed.
- Runtime suite was extended to use two Redis-backed limiter instances with the same namespace and verify shared hit state. This extension was not executed in the cleaned staging runner because the follow-up Azure log stream encountered a local CLI encoding failure; it requires a new explicitly approved staging run.
- Not passed: route-level Redis-unavailable tests for login, password reset, uploads, messaging, search, AI, payments, and Dashcoin/Gcoin controller transaction-integrity behavior; restart/reconnect runtime validation; and full multi-instance staging execution. These remain blocked and are not represented as passing evidence.
- No production resource, setting, traffic, revision, secret, database, identity, or customer data changed. G1-G6 remain `BLOCKED`.

#### Phase B.11 - Multi-instance and route-failure recovery assessment (2026-09-18)

- Encoding root cause: the remote ACR build completed successfully, but Azure CLI local log streaming attempted to render Unicode output through the Windows CP437/CP1252 console path while PowerShell reported an US-ASCII pipeline encoding. This affected log presentation, not the container build or test process. No global locale, Azure CLI, production pipeline, or production configuration was changed.
- The preferred recovery is an isolated UTF-8 staging runner with logs captured as UTF-8 artifacts, rather than a global terminal workaround.
- Architecture audit found `createDistributedRateLimitStore()` attached to the global limiter in `src/server.ts`, while login, registration, 2FA, and password-reset-specific limiters in `src/middleware/authRateLimit.middleware.ts` use the default in-process `express-rate-limit` store. Therefore route-level Redis-unavailable coverage for those specific limiters cannot be represented as a Redis test pass without a separate approved application remediation.
- Local focused validation: `npx jest --config jest.config.cjs --runInBand --runTestsByPath src/__tests__/gcoin.protection-failure.unit.test.ts src/services/redis/__tests__/entraRedis.unit.test.ts` - 2 suites passed, 3 tests passed, 0 skipped. `npm run build` passed and `git diff --check` passed.
- The expanded two-instance staging runtime execution and route-level tests for uploads, messaging, search, AI, payments, authentication, password reset, and controller transaction rollback were not completed. They remain `BLOCKED`, not skipped or passed.
- Cleanup remains verified: temporary job, image, secret, test database, synthetic records, and Redis test keys were removed. Redis public access remains disabled. No production resource or setting changed. G1-G6 remain `BLOCKED`.

#### Phase B.12 - Authentication rate-limit remediation (2026-09-18)

- Authentication-sensitive stores now use namespaced `DistributedRateLimitStore` instances for login, registration, 2FA, password reset, OAuth, OAuth exchange, and passkey ceremonies. Existing routes, thresholds, response contracts, and global limiter behavior were preserved.
- When Redis configuration is absent, sensitive stores use a bounded fail-closed store rather than process-local memory. Redis-backed instances retain bounded TTLs and use the existing Entra/private Redis connection contract.
- Privacy controls remain: rate-limit keys use IP/route categories and hashed identifiers where applicable; raw credentials, reset tokens, OTPs, and email content are not used in keys or logs.
- Focused command: `npx jest --config jest.config.cjs --runInBand --runTestsByPath src/middleware/__tests__/authRateLimit.redis.spec.ts src/__tests__/gcoin.protection-failure.unit.test.ts src/services/redis/__tests__/entraRedis.unit.test.ts` - 3 suites passed, 4 tests passed, 0 skipped.
- `npm run build` and `git diff --check` passed.
- Not yet run: authenticated staging two-instance route exercise, Redis outage route matrix, full passkey/OAuth/login/reset regression, DAST, or external evidence. No commit, push, staging API revision, traffic change, or production action was performed. G1-G6 remain `BLOCKED`.

#### Phase B.13 - Authentication route limiter remediation validation (2026-09-18)

- Implemented Redis-backed, namespaced stores for login, registration, 2FA, password reset, OAuth/OAuth exchange, and passkey options/verification. Existing routes, thresholds, response contracts, and global limiter behavior were preserved.
- Sensitive limiters now fail closed when Redis configuration is unavailable instead of using per-process memory.
- Focused command: `npx jest --config jest.config.cjs --runInBand --runTestsByPath src/middleware/__tests__/authRateLimit.redis.spec.ts src/__tests__/gcoin.protection-failure.unit.test.ts src/services/redis/__tests__/entraRedis.unit.test.ts`; 3 suites, 4 tests passed, 0 skipped.
- Regression command: `npx jest --config jest.config.cjs --runInBand --runTestsByPath src/__tests__/security.criticalRemediation.unit.test.ts src/__tests__/auth.login.controller.test.ts tests/unit/passkeyService.test.ts src/__tests__/oauth.redirect.security.spec.ts src/__tests__/oauth.exchange.service.spec.ts`; 5 suites, 34 tests passed, 0 skipped.
- `npm run build` and `git diff --check` passed.
- Staging two-instance route execution, restart/reconnect validation, and authenticated Redis outage route matrix were not run under this authorization. No commit, push, staging API revision, traffic change, or production action occurred. G1-G6 remain `BLOCKED`.

#### Verification and rollback plan

After an approved cost gate, verify from the staging backend that the normal Redis hostname resolves to a private RFC1918 address, TCP 10000 is reachable, TLS 1.2 succeeds, and authenticated PING succeeds. Then verify API health, login/session, rate limiting, and Socket.IO behavior before setting `publicNetworkAccess=Disabled`.

Rollback targets staging only: restore the prior backend setting, remove the DNS zone group/endpoint if required, and retain the existing public Redis path. If public access has already been disabled, restore the staging setting first, re-enable public access through the supported Managed Redis API, and recheck health. No production resource or DNS will be touched.

Status: `BLOCKED` pending subscription-specific pricing or owner-approved budget headroom, plus approval of the dedicated subnet and private DNS names. G1–G6 remain `BLOCKED`.

The subscription budget `scrolith-staging-10day` readback remains USD 150, filtered only to `ResourceGroupName In [rg-scrolith-staging]`, with enabled 50%, 75%, and 100% notifications to the approved owner contact. Azure-reported spend at read time was USD 0.00; cost reporting is delayed. No new paid service, Redis private endpoint, SMTP app, AI capacity, worker capacity, scanner, or load-test scale was enabled under this authorization. The planning forecast remains approximately US$70–US$145 for the approved staging window, subject to actual Container Apps and Managed Redis usage.

Production non-impact is confirmed: no resource, budget, billing setting, traffic, replica, database, secret, DNS, identity, staff role, customer data, commit, push, deployment, candidate revision, or production configuration was changed. G1–G6 remain `BLOCKED`.
