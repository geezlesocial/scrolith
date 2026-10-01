# Proposed G1 rules of engagement and limits

**PREPARATION ONLY — DOES NOT AUTHORIZE DAST.** The candidate/revision details in this document are historical issue evidence, not a current Azure check. No target was contacted.

## Source inventory and scope math

Against `backend/main` commit `c27caec1ef6ab71654fc3fc1d9bc6cd602c8ef2c`, a static parser over `geezle-backend/src/routes/**` found 1,591 route-call sites, of which 1,550 are single-line literal declarations; it leaves 41 declarations for manual expansion. The parsed declarations contain 1,217 distinct HTTP-method + router-local-path pairs across 141 route source files. Router prefixes in `src/server.ts`, nested mounts, direct `app.*` routes, runtime-conditional routes, dynamic path construction, and implicit middleware mean this is **not** a count of final externally reachable endpoints. The route manifest preserves source-local paths and mount prefixes; it is not an authorization list.

Planning upper bound: 1,217 parsed method/path patterns × 7 contexts (guest plus six authenticated roles) = **8,519 context/pattern pairs** before role applicability, exclusions, parameter variants, authentication overhead, or scan payload multiplication. This is not a full-G1 request estimate. No route is authorized by this document.

## Proposed Phase 1 handler-reviewed pilot (owner approval still required)

The separate pilot manifest in `02-route-method-manifest.md` reviews **5 distinct route/method pairs** across Guest and one ordinary Member context. It proposes seven scripted observations, a 50-request hard cap, and passive-only ZAP replay. These are planning values, not approved limits.

| Limit | Proposed Phase 1 cap | Basis |
|---|---:|---|
| Active role contexts | 1 at a time | Separate Guest and Member processes/contexts; no identity crossover. |
| Scanner workers | 1 | Serialize traffic and preserve attribution. |
| Rate | 0.25 requests/second maximum | No more than one request every four seconds. |
| Elapsed window | 60 minutes maximum | Independent hard stop. |
| Total requests | **50** | Pilot-specific; every preflight, authentication, verification, scan, and retry request counts. |
| Baseline route observations | 4 | Public reads, one approved-origin preflight, and authenticated own-session read. |
| Negative authorization checks | 3 | Unauthenticated `/api/auth/me`; Member vs second synthetic user's settings; and a CORS negative-origin preflight only if staging's production-mode policy is privately confirmed. |
| Normal authentication/verification overhead | Up to 16 | Normal login and any required HV/MFA/device approval plus session verification. Stop if exhausted. |
| ZAP allowance | 20 | Passive-only replay of exact reviewed paths; no spider, active scan, or import/discovery job. |
| Contingency | 7 | Setup variance and transport-only retry budget; stays within total cap. |
| Per-request timeout | 10 seconds | Stop on repeated timeouts or service impact. |
| Retry | At most 1, transport failure only | No retry for 4xx, 5xx, 429, or application errors. |

The mathematical timing envelope is **3,600 seconds × 0.25 requests/second = 900 requests**. The proposed **50-request hard cap** is intentionally much lower; the unused 850-request timing capacity is not an allowance. The elapsed-time, rate, and total-request caps are independent: reaching any one stops the test. Authentication overhead is a strict 16-request ceiling; if ordinary login, required Human Verification, MFA, device approval, or verification needs more, stop and obtain a revised approval. Do not bypass controls or automate reauthentication.

This pilot can assess only scanner/configuration correctness, allowlist behavior, normal-session handling, basic CORS/security-header observations, and a narrow authorization boundary. It cannot pass full G1. API/SRE must confirm a safe request rate and current limiter headroom; use a lower rate/cap if needed. Stop immediately on production-origin traffic, unexpected side effects, repeated 429/5xx, latency/health degradation, data exposure, wrong role, wrong image/revision, or any cap/window mismatch. No DoS, stress, broad crawl, brute force, fuzzing, or active scanning is proposed.

## Exclusions and decision gates

Payments, Dashcoin Gifts, marketplace/order mutations, uploads, webhooks, AI mutation/invocation flows, WebSocket mutation/event testing, moderator/admin writes, deletion, KYC, real email/notifications, passkeys, remembered-device/profile persistence, destructive operations, and production remain excluded. Every other route remains held until its handler, authorization, side effects, rate limiting, fixture, cleanup, and test method are reviewed.

Owner decision required before any authorization: exact target and revision/digest, role(s), route/method allowlist, request budgets, synthetic fixtures and cleanup, findings severity/stop rules, operator, independent verifier, monitor, emergency stop, evidence destination, and UTC window. Past approvals do not carry forward. Preparation is not authorization.
