# G1 authorization request draft — NOT APPROVED

**PREPARATION ONLY — DOES NOT AUTHORIZE DAST. Do not post this as approval.**

Issue: [Scrolith #128](https://github.com/geezlesocial/scrolith/issues/128)

## Phase 1 — limited G1 pilot (separate approval required)

Proposed contexts: Guest and one ordinary non-admin Member, one role/context at a time. Proposed scope is the five route/method pairs and seven expected request observations in `02-route-method-manifest.md`; the third negative observation (CORS unapproved-origin preflight) is conditional on private confirmation of staging production-mode policy and a non-allowlisted test origin. ZAP allowance is passive-only, no spider, active scan, or automatic route discovery.

Proposed budget: hard cap 50 requests total (4 baseline observations, 3 negative checks, up to 16 normal auth/verification requests, 20 passive ZAP requests, and 7 contingency). Other independent limits: 60 minutes maximum, 0.25 requests/second maximum, one worker, 10-second timeout, and at most one retry for transport failure only. Count all preflight, login, Human Verification, MFA/device approval, session verification, scan, and retry requests. If normal authentication exceeds its 16-request allocation, stop and request a revised authorization. Any time/rate/request cap stops the pilot. These values are proposals, not permission.

This pilot can assess only scanner/configuration correctness, exact approved target/path handling, use of a normally established session, basic CORS/security-header observations, and one narrow cross-user settings denial. It cannot pass G1, establish broad coverage, or authorize any excluded action. Guest and Member identities/fixtures require private readiness verification; no account or credential was accessed. Passkeys and remembered-device persistence remain excluded under Issue #128.

## Full G1 — remains BLOCKED

Full G1 requires all applicable role and route coverage, handler reviews, approved synthetic fixtures and cleanup, findings disposition, and required retests. Guest, Member, Freelancer, Employer/company administrator, Moderator, Analyst, and Platform administrator readiness must be privately verified where applicable. A completed Phase 1 pilot does **not** pass Full G1 and does not change the gate from **BLOCKED**.

## Proposed decision fields

- Owner/approver: Ibrahim Muhammed Jibrin — approval not given by this draft.
- DAST operator: **[REQUIRES OWNER DECISION]**
- Monitoring owner: Jamila Jibrin — **REQUIRES FRESH CONFIRMATION**
- Emergency-stop contact: Iqra Jibrin — **REQUIRES FRESH CONFIRMATION**
- Independent verifier: **[REQUIRES OWNER DECISION]**
- Exact target API hostname/app and candidate revision/digest: **[REQUIRES WRITTEN APPROVAL AND FRESH READ-ONLY PREFLIGHT]**
- Stable revision, label, and traffic: **[REQUIRES FRESH READ-ONLY PREFLIGHT]**
- Pilot role(s), exact route/method allowlist, and excluded paths: **[REQUIRES OWNER + API/SECURITY REVIEW]**
- Guest/Member identity and synthetic fixture pass/fail: **PRIVATE VERIFICATION REQUIRED; NO VALUES IN ISSUE/YAML/LOGS**
- Preflight and pilot UTC windows: **[REQUIRES OWNER DECISION]**
- Evidence destination and retention: **[REQUIRES OWNER DECISION]**
- Limits: Phase 1 proposal only — 1 worker; one role at a time; max 0.25 req/s; 50 total requests with the allocation above; 10-second timeout; max one transport-only retry; max 60 minutes. Security/SRE must confirm safe rate and limiter headroom.
- Scanner: `ghcr.io/zaproxy/zaproxy@sha256:781a2bdaea47324e7bab583e2263f21d257b0aee61ed51521a5be45f5f5081ef`; selected platform/child digest, `zap.sh -version`, and exact add-on inventory remain **OPEN — NO-GO** until verified; no add-on update during any eventual run.

## Required acknowledgement text for a future separate Phase 1 authorization

> I authorize one limited staging-only G1 pilot against **[exact approved staging API origin and candidate digest]** during **[start/end UTC]**, limited to **[Guest and/or Member; exact reviewed route/method allowlist; exclusions]**. Use scanner **[immutable index and selected child digest/platform, verified version and frozen add-ons]**, plan SHA-256 **[hash]**, and route-manifest SHA-256 **[hash]**. Enforce **[approved limits]**. Production, real users/data, privileged roles, passkeys, remembered profiles, payments/gifts, uploads, webhooks, real KYC, private messages, destructive/restore actions, secret extraction, load/DoS, and configuration changes are excluded. No test starts unless fresh preflight passes and the operator, independent verifier, monitor, and emergency-stop contact are available. This limited pilot does not mark Full G1 passed. Stop at the approved end time or immediately upon any scope, health, traffic, origin, safety, or data issue.

## Separate future Full G1 authorization

Full G1 needs a new scope and authorization after Phase 1 findings and coverage gaps are reviewed. It must name all applicable roles and routes, fixtures/cleanup, scanner and limits, evidence/retention, and retest criteria. Approval for Phase 1 must not be reused as authorization for Full G1.

This is a draft only. The approver must make a fresh, specific decision after the scope and prerequisites are reviewed. No DAST or deployment is authorized by this document.
