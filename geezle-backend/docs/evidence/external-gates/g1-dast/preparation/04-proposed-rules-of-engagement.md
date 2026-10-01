# Proposed G1 rules of engagement and limits

**PREPARATION ONLY — DOES NOT AUTHORIZE DAST.** The latest recorded candidate is historical evidence only: API revision `ca-scrolith-staging-api--cand-4fa003df-2130`, digest `sha256:9ee3af8d217ccd1c6bd23358c3c78019a63c640b0bd58b91659daad152564694`, `g1-candidate`; stable `ca-scrolith-staging-api--promote-addecb050`; recorded traffic stable 100%, candidate 0%. Fresh Azure verification is not performed or authorized here.

## Source inventory and scope math

Against `backend/main` commit `c27caec1ef6ab71654fc3fc1d9bc6cd602c8ef2c`, a static parser over `geezle-backend/src/routes/**` found 1,591 route-call sites, of which 1,550 are single-line literal declarations; it leaves 41 declarations for manual expansion. The parsed declarations contain 1,217 distinct HTTP-method + router-local-path pairs across 141 route source files. Router prefixes in `src/server.ts`, nested mounts, direct `app.*` routes, runtime-conditional routes, dynamic path construction, and implicit middleware mean this is **not** a count of final externally reachable endpoints. The route manifest preserves source-local paths and mount prefixes so the owner can resolve them; it is not an authorization list.

Planning upper bound: 1,217 parsed method/path patterns × 7 contexts (guest plus six authenticated roles) = **8,519 context/pattern pairs** before role applicability, exclusions, parameter variants, authentication overhead, or scan payload multiplication. Therefore full coverage is not a one-window scan. No route has yet been cleared by handler-level review; the currently approved automated-ZAP and scripted-authorization budgets are both **0**.

## Conservative proposal for a later, owner-approved pilot

These are proposed caps, not approved limits. Select a small, handler-reviewed read-only subset first; do not use the entire census as a ZAP seed list.

| Limit | Proposed pilot cap | Basis |
|---|---:|---|
| Authenticated contexts active at once | 1 | Prevent cross-role token/session contamination. |
| Scanner workers/concurrency | 1 | Serialize traffic and preserve attribution. |
| Rate | 0.25 requests/second maximum | At most one request every four seconds; lower than the default scanner behavior. |
| Maximum elapsed window | 60 minutes | Hard stop before owner-approved window end. |
| Maximum total requests | 720 | 3,600 seconds × 0.25 requests/second; retries/auth/setup requests count against the same cap. |
| ZAP request allocation | 480 | Three quarters of the total cap; only approved passive/low-impact checks in an exact allowlist. |
| Scripted authorization checks | 120 | Explicit, paired positive/negative authorization cases on reviewed endpoints only. |
| Authentication, health, verification and contingency reserve | 120 | Normal login/MFA/device approval, session verification, and at most one transport retry per request; all counted. |
| Per-request timeout | 10 seconds | Governance default; stop on repeated timeouts or service impact. |
| Retry | At most 1, transport failure only | Never retry 4xx/5xx, rate-limit, or application error responses. |

720 requests can only touch 720 of 8,519 theoretical context/pattern pairs even once. This pilot cap is therefore for a single reviewed slice, not a full G1 pass. API/SRE must confirm actual safe rate and existing rate-limit headroom; if lower, use the lower value. Stop immediately on production-origin traffic, unexpected side effects, repeated 429/5xx, latency/health degradation, data exposure, wrong role, wrong image/revision, or any cap/window mismatch. No DoS, stress, broad crawl, brute force, fuzzing, or active scanning is authorized by this proposal.

## Handling and exclusions

Every mutation, upload, download, payment, Dashcoin Gift, webhook, email/notification, AI invocation, admin setting, deletion, restore, or real-time event stays `EXCLUDE` until an owner-reviewed synthetic fixture, bounded effect, and verified cleanup/rollback are documented. Never use customer data or real external integrations. Explicitly exclude production/edge, real payments, production webhooks, real KYC, private messages, destructive deletion without synthetic cleanup, restore, secret extraction, denial-of-service/load testing, DNS/SSL/IAM/billing changes, arbitrary admin configuration, passkeys, and remembered-profile persistence. See the per-pattern disposition in `02-route-method-manifest.md`.

Owner decision required before authorization: choose scope slice, role(s), exact method/path allowlist, request budgets, synthetic fixtures and cleanup, findings severity/stop rules, operator, independent verifier, monitor, emergency stop, target identity, UTC window, and evidence destination. Past approvals do not carry forward.
