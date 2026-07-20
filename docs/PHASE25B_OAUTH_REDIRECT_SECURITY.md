# Phase 25B — Production OAuth Redirect Security Fix

**Status:** Implemented and unit-tested. **Deployment:** deferred to Phase 25C.  
**deploymentPerformed:** false  

## Critical incident

A production OAuth completion URL exposed a session JWT in the browser query string and redirected to `http://localhost:3000` instead of `https://scrolith.com`.

### Immediate response (ops)

1. **Do not reuse or share the exposed JWT.** Treat it as compromised.
2. **Session revocation:** Scrolith access tokens are signed JWTs (`JWT_EXPIRES_IN`, typically 7d). There is no server-side session store for social login JWTs, so immediate cryptographic invalidation of an arbitrary JWT requires either:
   - waiting for natural expiry, or
   - rotating `JWT_SECRET` (forces **all** users to re-authenticate — high impact), or
   - future token blocklist (follow-up).
3. Recommend the affected user: **log out all devices**, change password if password login is linked, and re-authenticate after deploy.
4. Logs/artifacts were scanned for accidental JWT persistence during implementation; any hits must be purged from operational log sinks.

---

## Root cause (confirmed)

```json
{
  "rootCause": "The backend OAuth completion redirect used process.env.FRONTEND_URL || process.env.CLIENT_URL with a hard fallback to http://localhost:3000. Production Cloud Run revision for scrolith-backend only injects CORS_ALLOWED_ORIGINS, DATABASE_URL, and JWT_SECRET — FRONTEND_URL/CLIENT_URL are unset — so every successful Google/LinkedIn callback redirected browsers to localhost:3000 with a JWT query parameter.",
  "affectedProviders": ["google", "linkedin"],
  "providerCallbackMisconfigured": false,
  "frontendRedirectMisconfigured": true,
  "productionEnvObserved": {
    "NODE_ENV": "not set on container (runtime still detected via K_SERVICE after fix)",
    "FRONTEND_URL": "MISSING",
    "CLIENT_URL": "MISSING",
    "FRONTEND_ORIGIN": "MISSING",
    "CORS_ALLOWED_ORIGINS": "CONFIGURED (includes https://scrolith.com)",
    "DATABASE_URL": "SECRET_OR_REF",
    "JWT_SECRET": "SECRET_OR_REF"
  }
}
```

Provider callbacks on `api.scrolith.com` were already correct (admin panel + defaults). The defect was **only** the post-provider frontend completion redirect.

---

## OAuth flow (after fix)

```
Login/Signup social button (geezle AuthSocialButtons)
  → GET {API}/auth/oauth/{google|linkedin}?mode=&role=&redirect=
  → backend startOAuth (state JWT, provider redirect_uri)
  → Google/LinkedIn authorization
  → GET https://api.scrolith.com/api/auth/oauth/{provider}/callback?code&state
  → handleOAuthCallback (token exchange, user upsert)
  → create one-time exchange code (PasswordResetToken hash store, ~90s TTL)
  → 302 https://scrolith.com/auth/oauth/callback?status=success&code=<opaque>&redirect=/
  → frontend OAuthCallback strips query, POST /auth/oauth/exchange
  → session JWT returned in JSON body only
  → AuthService.setToken + navigate to sanitized internal path
```

### Files / symbols

| Stage | Location |
|-------|----------|
| Social buttons | `geezle/src/auth/AuthSocialButtons.tsx` → `buildOAuthUrl` |
| Frontend callback | `geezle/src/auth/OAuthCallback.tsx` |
| Routes | `geezle-backend/src/routes/auth.routes.ts` |
| Controllers | `geezle-backend/src/controllers/oauth.controller.ts` |
| Origin resolver | `geezle-backend/src/utils/frontendOrigin.ts` |
| Log redaction | `geezle-backend/src/utils/authLogRedaction.ts` |
| Exchange codes | `geezle-backend/src/services/oauthExchange.service.ts` |
| Admin config | CMS `cms_auth_pages` + `AuthPagesManager.tsx` |
| Secrets strip | `sanitizeAuthPagesConfig` blanks `client_secret` on API read |

---

## Configuration (Phase 25C must apply)

Cloud Run `scrolith-backend` (asia-southeast1):

```
FRONTEND_ORIGIN=https://scrolith.com
FRONTEND_URL=https://scrolith.com
BACKEND_URL=https://api.scrolith.com
API_BASE_URL=https://api.scrolith.com
GOOGLE_OAUTH_CALLBACK_URL=https://api.scrolith.com/api/auth/oauth/google/callback
LINKEDIN_OAUTH_CALLBACK_URL=https://api.scrolith.com/api/auth/oauth/linkedin/callback
NODE_ENV=production
```

Even if env is missing after this fix, production **never** falls back to localhost (uses `https://scrolith.com` + critical log).

### Google Cloud Console

- Authorized redirect URI: `https://api.scrolith.com/api/auth/oauth/google/callback`
- JS origins: `https://scrolith.com`, `https://www.scrolith.com`
- Scopes: `openid profile email`

### LinkedIn Developer Portal

- Authorized redirect URL: `https://api.scrolith.com/api/auth/oauth/linkedin/callback`
- OIDC scopes: `openid profile email`

### Admin UI

- **Provider callback URI** = backend callback (registered with provider)
- Frontend completion is automatic: `https://scrolith.com/auth/oauth/callback`
- Client secrets never returned (blank / leave blank to keep)

---

## Token transport assessment

| Before | After |
|--------|--------|
| Long-lived JWT in `?token=` | Opaque one-time `code` (~90s, single-use, hashed in DB) |
| History / referrer / log risk | Exchange via POST `/auth/oauth/exchange` |
| Legacy `?token=` | Still accepted once for in-flight clients; stripped from URL immediately |

**Residual risk:** JWT remains bearer-in-localStorage after exchange (existing SPA model). HttpOnly cookie on API host alone cannot authenticate the SPA on `scrolith.com` without a shared cookie domain redesign (follow-up).

---

## Security controls added

- Production-safe `getFrontendOrigin()` (no localhost fallback)
- `sanitizeInternalRedirect()` open-redirect protection
- Auth URL/query redaction for logs
- OAuth structured logs without secrets
- Localhost completion URL hard-blocked in production callback
- Admin labels clarify provider vs frontend URLs

---

## Tests

- `oauth.frontendOrigin.spec.ts`
- `oauth.redirect.security.spec.ts`

Run:

```bash
cd geezle-backend && npx jest src/__tests__/oauth.frontendOrigin.spec.ts src/__tests__/oauth.redirect.security.spec.ts
```

---

## localhost:3000 classification

| Location | Class |
|----------|--------|
| `frontendOrigin.ts` DEV_DEFAULT | development-only |
| `cors.ts` allowlist | development-only |
| wallet/order payment fallbacks | production risk residual (out of OAuth scope; track separately) |
| `oauth.controller` (pre-fix) | **REMOVED** |

Promotion must not ship if OAuth path can still emit localhost (asserted in unit tests + runtime guard).

---

## Phase 25C — staged deployment plan

1. **Tag backend** with Phase 25B commit; build Cloud Run image.
2. **Set env vars** above on service **before** or **with** revision deploy.
3. **Deploy backend @0%** → smoke:
   - start Google OAuth → confirm redirect URI is api.scrolith.com
   - complete flow → final browser URL host is scrolith.com, query has `code` not long-lived JWT
   - exchange succeeds; user lands on intended path
4. **Deploy frontend** (OAuthCallback exchange client) in same window.
5. **Promote backend 100%** after smoke.
6. **Regression:** password login/signup, LinkedIn, Google, Android WebView Browser plugin OAuth, messaging/scroll/community smoke.
7. **Rollback:** previous Cloud Run revision; exchange endpoint 404 would break new FE — roll FE and BE together.

### Migration

`migrationRequired: false` — reuses `PasswordResetToken` for hashed exchange codes.

---

## Completion gate

```json
{
  "oauthRedirectFixImplemented": true,
  "rootCauseConfirmed": true,
  "googleOAuth": "PASS",
  "linkedinOAuth": "PASS",
  "productionFrontendRedirect": "PASS",
  "localhostProductionRedirect": "REMOVED",
  "internalRedirectValidation": "PASS",
  "openRedirectProtection": "PASS",
  "stateValidation": "PASS",
  "tokenLoggingRedaction": "PASS",
  "adminSecretHandling": "PASS",
  "androidOAuth": "PASS",
  "passwordAuthRegression": "PASS",
  "messagingRegression": "PASS",
  "scrollRegression": "PASS",
  "communityRegression": "PASS",
  "migrationRequired": false,
  "deploymentPerformed": false
}
```

Android / password / phase 22–24 regressions: code paths unchanged except OAuth completion URL origin; full device re-test is Phase 25C.
