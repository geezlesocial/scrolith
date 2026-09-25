# Scrolith G1 Staging Security Test Authorization

Status:
`G1 BLOCKED -- MISSING AUTHORIZATION

Owner:
Ibrahim Muhammed Jibrin

Role:
Owner

Emergency email:
[ibrahimjibrinnn@gmail.com](mailto:ibrahimjibrinnn@gmail.com)

Emergency phone:
+639159459320

Approved frontend URL:
[https://ca-scrolith-staging-web.yellowmushroom-b8714740.southeastasia.azurecontainerapps.io](https://ca-scrolith-staging-web.yellowmushroom-b8714740.southeastasia.azurecontainerapps.io)

Approved API URL:
[https://ca-scrolith-staging-api.yellowmushroom-b8714740.southeastasia.azurecontainerapps.io](https://ca-scrolith-staging-api.yellowmushroom-b8714740.southeastasia.azurecontainerapps.io)

Source commit:
`4fa003df704a3a369a1923dd1d752fc937ddd971

Dockerfile:
`geezle-backend/Dockerfile.acr.temp

Image:
`acrscrolithstaging8098.azurecr.io/scrolith-backend:g1-provenance-4fa003df704a-20260925-04

Image digest:
`sha256:3ff3d08f8151d3b351f6fe980b0cbe83fd989380bde61a059b68567da6268246

Provenance workflow:
[GitHub Actions run 36144883827](https://github.com/geezlesocial/scrolith/actions/runs/36144883827)

SBOM checksum:
`caab12dc03693de1101923ea3c928ccd060ec19b02459d406c664b311e0f5106

Approved testing mode:
`A -- read-only/discovery testing only

Approved routes:

- `GET /api/health
- `HEAD /api/health
- `GET /api/readyz
- `HEAD /api/readyz
- `GET /api/health/ready
- `HEAD /api/health/ready
- `GET /api/auth/health

Excluded routes and actions:

- All `POST`, `PUT`, `PATCH`, and `DELETE` requests
- Payments, payouts, escrow, withdrawals, and KYC
- Uploads and file operations
- OAuth and MFA enrollment/rese
- Admin routes
- Metrics and route-discovery routes
- AI and external integrations
- WebSocket and Socket.IO testing
- Database and Redis mutations
- Production connectivity
- Non-test data

Accounts:

Standard account:
[staging-dast-user@scrolith.com](mailto:staging-dast-user@scrolith.com)

Standard account role:
Standard staging user / non-privileged synthetic accoun

Admin account:
[staging-dast-admin@scrolith.com](mailto:staging-dast-admin@scrolith.com)

Admin account role:
Staging administrator / privileged synthetic account, limited to approved read-only checks

Admin MFA:
YES -- verified by the owner before testing

Credential store:
Azure Key Vault: `kv-scrolith-stg-8098

Known Key Vault secret:
`STAGING-PLATFORM-ADMIN-PASSWORD

Important:
Do not claim that `STAGING-PLATFORM-ADMIN-PASSWORD` belongs to either DAST account until the account-to-secret mapping is independently verified. The standard DAST credential mapping remains `PENDING`.

Testing window:

UTC start:
`2026-09-26T14:00:00Z

UTC end:
`2026-09-26T14:30:00Z

Philippine Time:
September 26, 2026, 10:00 PM-10:30 PM

Maximum duration:
30 minutes

Maximum total requests:
300

Request timeout:
10 seconds

Retry limit:
1 retry per reques

DAST workers:
1

Rate limits:

- 1 request/second/accoun
- 0.5 request/second/IP on sensitive routes
- 1 upload/second/account, although uploads are excluded
- 1 AI request/10 seconds/account, although AI routes are excluded
- 2 WebSocket connections/account, although WebSocket testing is excluded

Monitoring owner:
Ibrahim Muhammed Jibrin

Emergency-stop procedure:
Immediately stop the scanner, revoke its session, and notify Ibrahim Muhammed Jibrin at [ibrahimjibrinnn@gmail.com](mailto:ibrahimjibrinnn@gmail.com) or +639159459320. Stop immediately upon production connectivity, unexpected mutation, sustained 5xx increase, resource threshold breach, or account-isolation issue.

Automatic stop conditions:

- HTTP 5xx above 5% for two continuous minutes
- CPU above 85% for five minutes
- Memory above 85% for five minutes
- PostgreSQL connections above 80% capacity
- Redis memory above 80% capacity
- Any production connectivity
- Any non-test-data mutation
- Any unexpected upload, payment, payout, KYC, escrow, or withdrawal activity
- Any account-isolation failure

Evidence-retention location:
Private GitHub Actions artifact for the approved repository, with sensitive values redacted

Cleanup authorization:
YES -- remove temporary scanner artifacts and sessions after evidence is verified

Formal approval reference:
`PENDING

Electronic approval:
`PENDING

UTC approval timestamp:
`PENDING

Final status:
`G1 BLOCKED -- MISSING AUTHORIZATION
