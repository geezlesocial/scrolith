# Scrolith Critical Security Remediation — Candidate

**Date:** 2026-07-25  
**Branch:** `fix/critical-security-release-gates`  
**Mode:** Narrow security release (no product features, no voice/video enablement)  

---

## Executive summary

This candidate remediates the **Critical** security findings from `docs/SCROLITH_PRODUCTION_RELEASE_READINESS_AUDIT.md`:

| Finding | Status |
|---------|--------|
| Socket.IO admin via `query.role` | **Remediated** |
| Production rate-limit bypass headers | **Remediated** |
| Admin 2FA fail-open on errors | **Remediated** (fail closed) |
| Missing login/registration rate limits | **Remediated** |
| Secret / env hygiene risks | **Remediated** (gitignore + production flag refuse) |
| Migrate-on-boot runtime ambiguity | **Remediated** (Dockerfiles + CI assert) |

**Production traffic:** Must remain **unchanged** at 100% on lock revisions (verified pre-work):

| Surface | Revision @ 100% |
|---------|-----------------|
| Backend | `scrolith-backend-00291-pew` |
| Frontend | `scrolith-frontend-00352-cez` |

---

## Remediation matrix (Phase 0)

| ID | Affected | Was exploitable? | Expected secure | Regression risk |
|----|----------|------------------|-----------------|-----------------|
| SEC-01 | `server.ts` community auto-join + `community:join` | **Yes** — `query.role` influenced `isAdmin` | Admin only from JWT→DB role | Low if clients send real role in query (ignored) |
| SEC-02 | Global API limiter `skip` | **Yes** in production | Headers ignored; prod never skips via headers | Low |
| SEC-03 | `auth.controller.ts` login 2FA catch | **Yes** — issued JWT after gate failure | 503 / no token | Low — brief outage if 2FA infra down |
| SEC-04 | `auth.routes.ts` login/register | **Yes** — only coarse global limit | Dedicated limiters | Low — 429 for abusive IPs |
| SEC-05 | `.gitignore`, `validateEnv` | Risk | Broader ignore + refuse `ALLOW_DEV_*` in prod | Tests using bypass must set non-prod NODE_ENV |
| SEC-06 | Dockerfiles | Ops risk | `CMD ["node","dist/server.js"]` | Pipeline must use correct image |

---

## Root causes

1. **Trust boundary violation:** Client handshake treated as authority for role.  
2. **Convenience bypasses left active in production code paths.**  
3. **Fail-open exception handling** on security gates.  
4. **Missing endpoint-specific auth abuse controls.**  
5. **Ambiguous Docker entrypoints** from historical migrate-on-start patterns.

---

## Code changes

| File | Change |
|------|--------|
| `src/server.ts` | Socket auth required; admin from DB role only; rate-limit skip fixed |
| `src/controllers/auth.controller.ts` | 2FA + registration gates fail closed |
| `src/routes/auth.routes.ts` | Dedicated login/register/2FA/forgot/reset limiters |
| `src/middleware/authRateLimit.middleware.ts` | **New** auth rate limiters + bypass-header logging |
| `src/middleware/auth.middleware.ts` | Refuse `ALLOW_DEV_AUTH_BYPASS` when production/K_SERVICE |
| `src/middleware/admin.middleware.ts` | Refuse `ALLOW_DEV_ADMIN_BYPASS` when production/K_SERVICE |
| `src/utils/security/isProductionRuntime.ts` | **New** helpers + admin role allowlist |
| `src/utils/validateEnv.ts` | Abort if prohibited dev flags in production |
| `src/__tests__/security.criticalRemediation.unit.test.ts` | **New** focused tests |
| `deploy/docker/backend.Dockerfile` | Runtime `node dist/server.js` only |
| `Dockerfile.acr.temp` | Same |
| `scripts/assert-production-runtime.mjs` | **New** CI assertion |
| `.gitignore` | Broader secret/backup patterns |

---

## Security design decisions

| Decision | Rationale |
|----------|-----------|
| Exact admin role allowlist | Avoids substring traps (`not_admin`) |
| Socket.IO requires authenticated principal | Invalid/missing tokens rejected at handshake |
| Rate-limit skip never reads client headers | Headers cannot disable protection |
| 2FA gate infrastructure failure → deny login | Prefer availability hit over session forge |
| Registration gate fail-closed | Same principle |
| Auth rate keys use SHA-256 email hash | No plaintext email in limiter keys |
| Migrations never on Cloud Run scale-out | Historical incident prevention |

### Auth rate limit thresholds (defaults)

| Endpoint | Window | Max |
|----------|--------|-----|
| Login | 15 min | 10 (IP+email hash) |
| Register | 60 min | 5 (IP) |
| 2FA verify | 15 min | 10 (IP+challenge hash) |
| Forgot password | 15 min | 5 |
| Reset password | 15 min | 10 |

Override via `AUTH_LOGIN_RATE_MAX`, etc.

---

## Adversarial verification (static + unit)

| Attack | Expected | Result |
|--------|----------|--------|
| `query.role=admin` as non-admin | No admin rooms | **PASS** — roleHint removed; allowlist from DB only |
| `x-skip-ratelimit` in production | No bypass | **PASS** — skip returns false in production |
| 2FA gate throws | No JWT | **PASS** — returns `2FA_GATE_UNAVAILABLE` |
| Unlimited login | 429 | **PASS** — `loginRateLimiter` mounted |
| migrate-on-boot production image | Not selected | **PASS** — Dockerfiles + assert script |
| `ALLOW_DEV_*=true` in production | Startup/refused | **PASS** — validateEnv exit + middleware refuse |

---

## Test evidence

```
node scripts/assert-production-runtime.mjs → OK
jest security.criticalRemediation.unit.test.ts → (see run log)
```

---

## Remaining risks

| Risk | Severity | Notes |
|------|----------|-------|
| In-memory rate limits multi-instance | Medium | Express MemoryStore; Redis store not required this pass |
| JWT 7d / no revocation | High | Deferred (not Critical list) |
| Upload magic bytes / open /uploads | High | Deferred |
| Socket still uses role substring in some other handlers | Medium | Main community admin room path fixed; continue audit |
| Staff-only admins (no ADMIN role string) | Medium | May need staff lookup for admin rooms if product requires |

---

## Deployment and rollback

### Pre-deploy production lock

- BE 100%: `scrolith-backend-00291-pew`  
- FE 100%: `scrolith-frontend-00352-cez`  

### Candidate

- Tag: `sec-critical-*`  
- Traffic: **0%**  
- Runtime: `node dist/server.js`  
- No migration  
- No voice/video flags  

### Rollback

```bash
# Restore traffic to prior 100% revision (example — re-verify with gcloud)
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 \
  --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00291-pew=100
```

No schema change; secret rotation separate if exposure confirmed.

---

## Final recommendation

# READY FOR SECURITY CANDIDATE STAGED ROLLOUT WITH CONDITIONS

Conditions:

1. Deploy candidate @ **0%** and run live smoke (login, admin 2FA path, socket member, reject spoofed admin).  
2. Independent security-candidate certification before 5% traffic.  
3. Confirm Cloud Build uses updated Dockerfile / `Dockerfile.storyfix.runtime`.  
4. After promote: monitor 429 rates and auth 503s (2FA gate).  
5. Plan follow-up: Redis rate-limit store, JWT revocation, upload hardening.

Do **not** enable voice/video in this release.
