# G1 authorization request draft — NOT APPROVED

**PREPARATION ONLY — DOES NOT AUTHORIZE DAST. Do not post this as an approval.**

Issue: [Scrolith #128](https://github.com/geezlesocial/scrolith/issues/128)

## Proposed decision fields

- Owner/approver: Ibrahim Muhammed Jibrin — approval not given by this draft.
- DAST operator: **[REQUIRES OWNER DECISION]**
- Monitoring owner: Jamila Jibrin — **REQUIRES FRESH CONFIRMATION**
- Emergency-stop contact: Iqra Jibrin — **REQUIRES FRESH CONFIRMATION**
- Independent verifier: **[REQUIRES OWNER DECISION]**
- Target API hostname, app, subscription, resource group: **[REQUIRES WRITTEN APPROVAL AND FRESH PREFLIGHT]**
- Candidate revision/digest/label and stable revision: **[REQUIRES FRESH READ-ONLY PREFLIGHT]**
- Role(s), exact reviewed route/method allowlist, and excluded paths: **[REQUIRES OWNER + API/SECURITY REVIEW]**
- Proposed preflight UTC window: **[REQUIRES OWNER DECISION]**
- Proposed DAST UTC window: **[REQUIRES OWNER DECISION]**
- Evidence destination and retention: **[REQUIRES OWNER DECISION]**
- Limits: proposed pilot only — 1 context, 1 worker, 0.25 req/s, 720 total requests (480 ZAP / 120 scripted authorization / 120 auth+verification reserve), 10-second timeout, max one transport retry, 60 minutes; all pending Security/SRE approval and route-specific budget reduction.
- Scanner: `ghcr.io/zaproxy/zaproxy@sha256:781a2bdaea47324e7bab583e2263f21d257b0aee61ed51521a5be45f5f5081ef`; reported core self-check and add-on freeze remain required before authorization.

## Required acknowledgement text for a future separate authorization

> I authorize one staging-only G1 authenticated DAST run against **[exact approved staging API origin and candidate digest]** during **[start/end UTC]**, limited to **[approved role(s), exact route/method allowlist, and exclusions]**. Use scanner digest **[immutable digest and platform]**, plan SHA-256 **[hash]**, and route-manifest SHA-256 **[hash]**. Enforce **[approved limits]**. Production, real users/data, passkeys, remembered profiles, real payments, production webhooks, real KYC, private messages, destructive/restore actions, secret extraction, load/DoS, and configuration changes are excluded. No tests may start unless fresh preflight passes and the operator, independent verifier, monitor, and emergency-stop contact are available. Stop at the approved end time or immediately upon any scope, health, traffic, origin, safety, or data issue.

This wording is a draft only; the approver must make a fresh, specific decision after the route scope and all prerequisites are reviewed.
