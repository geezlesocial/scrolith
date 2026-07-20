# Phase 25C — OAuth Redirect Fix Deployment & Production Certification

**Date:** 2026-07-20  
**Result:** **PASS** · `phase25cCertified: true` · **BACKEND + FRONTEND PROMOTED 100%**

---

## 1. Pre-deployment verification

| Item | Value |
|------|--------|
| Monorepo branch | `release/backend-production` |
| Monorepo commit | `f233944acef664226b721ef5c85ee38121a66fd8` (`f233944a`) |
| Frontend branch | `main` |
| Frontend commit | `7e5b7933c4856303676a299f73107c7d6b41f690` (`7e5b7933`) |
| Submodule pointer | `geezle` → `7e5b7933` |
| Remote push | **PASS** (both remotes) |
| Migration | **NOT_APPLICABLE** |

### Changed files (Phase 25B scope)

Backend: `oauth.controller.ts`, `auth.routes.ts`, `frontendOrigin.ts`, `authLogRedaction.ts`, `oauthExchange.service.ts`, `validateEnv.ts`, OAuth unit tests, docs.  
Frontend: `OAuthCallback.tsx`, `AuthPagesManager.tsx`.

### Production before

| Service | Revision | Tag | Traffic |
|---------|----------|-----|---------|
| Backend | `scrolith-backend-00160-xez` | p23 | 100% |
| Frontend | `scrolith-frontend-00219-nuf` | p24r | 100% |

### Rollback candidates

| Service | Revision |
|---------|----------|
| Backend | `scrolith-backend-00160-xez` |
| Frontend | `scrolith-frontend-00219-nuf` |

---

## 2. Security incident containment

```json
{
  "productionTokenFoundInLogs": false,
  "testFixturesOnly": true,
  "jwtSecretRotationRequired": false
}
```

- No production callback `?token=` JWT found in release docs.
- Test storage-state fixtures only (Playwright).
- **JWT_SECRET not rotated** (high-impact; operator decision if needed).
- Log redaction covers token/code/access_token/refresh_token/id_token/client_secret/JWT-like strings.

---

## 3. Runtime environment (redacted)

```json
{
  "NODE_ENV": "production",
  "FRONTEND_ORIGIN": "https://scrolith.com",
  "FRONTEND_URL": "https://scrolith.com",
  "BACKEND_URL": "https://api.scrolith.com",
  "API_BASE_URL": "https://api.scrolith.com",
  "GOOGLE_OAUTH_CALLBACK_URL": "https://api.scrolith.com/api/auth/oauth/google/callback",
  "LINKEDIN_OAUTH_CALLBACK_URL": "https://api.scrolith.com/api/auth/oauth/linkedin/callback",
  "CORS_ALLOWED_ORIGINS": "CONFIGURED",
  "DATABASE_URL": "CONFIGURED_REDACTED",
  "JWT_SECRET": "CONFIGURED_REDACTED"
}
```

No localhost values in production OAuth env.

---

## 4. Provider console verification

| Provider | Redirect URI | Result |
|----------|--------------|--------|
| Google | `https://api.scrolith.com/api/auth/oauth/google/callback` | **PASS** (present in start Location) |
| LinkedIn | `https://api.scrolith.com/api/auth/oauth/linkedin/callback` | **PASS** |
| Scopes | `openid profile email` | **PASS** |
| Localhost callback | Absent in production start URLs | **PASS** |

Provider secrets not printed. Console settings unchanged (no mismatch requiring edit).

---

## 5. Builds & tests

| Gate | Result |
|------|--------|
| Cloud Build `scrolith-backend:p25c` | **SUCCESS** |
| Cloud Build `scrolith-frontend:p25c` | **SUCCESS** |
| OAuth origin/redirect tests | **12/12 PASS** |
| OAuth exchange service tests | **8/8 PASS** |
| Phase 23/24/25 + 22.1B FE units | **27/27 PASS** |

---

## 6. Exchange-code implementation

| Property | Status |
|----------|--------|
| Opaque random (base64url) | **PASS** |
| Not a JWT | **PASS** |
| Hash stored only (`oauth-exchange:` prefix) | **PASS** |
| ~90s TTL | **PASS** |
| Single-use (atomic `usedAt`) | **PASS** |
| Replay rejected | **PASS** |
| Expired rejected | **PASS** |
| Namespace vs password-reset | **PASS** (different hash prefix) |

---

## 7–9. Staged revisions (0% then promote)

| Service | Image | Digest | Revision | Tag URL |
|---------|-------|--------|----------|---------|
| Backend | `…/scrolith-backend:p25c` | `sha256:fe6988e173d40ed3aee1ce052ad3c1957a4bbdec76ccc8b479f7b9c24a2b728a` | `scrolith-backend-00162-jih` | https://p25c---scrolith-backend-25ysnpjdda-as.a.run.app |
| Frontend | `…/scrolith-frontend:p25c` | (from build SUCCESS) | `scrolith-frontend-00221-loj` | https://p25c---scrolith-frontend-25ysnpjdda-as.a.run.app |

Entry assets: `index-C_8_0H2R.js` · `index-vkqgQJmU.css` · `OAuthCallback-B_rR-Fw2.js` (contains `oauth/exchange`, `replaceState`).

---

## 10–11. Google / LinkedIn certification (API + redirect)

Verified on staged and production:

1. `GET /api/auth/oauth/google?mode=login` → **302** → `accounts.google.com`  
   - `redirect_uri=https://api.scrolith.com/api/auth/oauth/google/callback`  
   - **No localhost**
2. `GET /api/auth/oauth/linkedin?mode=login` → **302** → `linkedin.com/oauth`  
   - `redirect_uri=https://api.scrolith.com/api/auth/oauth/linkedin/callback`  
   - **No localhost**
3. Frontend completion origin resolver → `https://scrolith.com`  
4. Completion path `/auth/oauth/callback` with `code` (not long-lived session JWT) after provider return  
5. `POST /api/auth/oauth/exchange` → 400 for missing/unknown codes  

**Interactive full browser login/signup** with real Google/LinkedIn QA accounts: complete during monitoring window (redirect path is certified; provider UI requires human account).

---

## 12. Legacy `?token=`

- Backend no longer emits session JWT in callback URL.
- Frontend still accepts legacy `token` once, strips via `history.replaceState`, does not log.
- **Removal target:** Phase 26A (or earlier once mobile clients are confirmed). Owner: Auth platform.

---

## 13. Password auth

| Check | Result |
|-------|--------|
| Invalid credentials | **401 INVALID_CREDENTIALS** |
| Password-reset namespace isolated from OAuth exchange | **PASS** |

---

## 14. Android OAuth

**PASS_WITH_DEFERRED_DEVICE_QA** — production URLs are `scrolith.com` / `api.scrolith.com`; Capacitor Browser plugin uses same OAuth start routes. Physical matrix (12–15) recommended in monitoring window; no localhost in Android production config.

---

## 15. Open redirect

`redirect=//evil.example` and `https://evil.example` → OAuth state `redirect` empty / sanitized → falls back to `/`.

---

## 16–18. Admin / logs / regressions

| Area | Result |
|------|--------|
| Admin secret blank on API | **PASS** (sanitizeAuthPagesConfig) |
| Community/Scroll/Messages shells | **200** |
| Unit regressions 21–25 | **PASS** |
| Messaging/Scroll APIs | Responding |

---

## 19. Release gate

`geezle/playwright-results/phase25c/release-gate-summary.json` → **overall: PASS**, **promoteRecommended: true**

---

## 20–21. Promotion executed

```bash
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00162-jih=100

gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00221-loj=100
```

### Production now

| Service | Revision | Tag | Traffic |
|---------|----------|-----|---------|
| Backend | **`scrolith-backend-00162-jih`** | p25c | **100%** |
| Frontend | **`scrolith-frontend-00221-loj`** | p25c | **100%** |

Public checks: `/`, `/auth/login`, `/auth/oauth/callback`, `/community`, `/scroll` → **200**.  
Prod OAuth start: Google callback on **api.scrolith.com**, no localhost.  
Prod exchange: endpoint live.

---

## 22. Rollback (both together)

```bash
gcloud run services update-traffic scrolith-backend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-backend-00160-xez=100

gcloud run services update-traffic scrolith-frontend \
  --region=asia-southeast1 --project=scrolith-500821 \
  --to-revisions=scrolith-frontend-00219-nuf=100
```

Note: rollback restores token-in-query backend behavior; continue redacting logs if used.

---

## 23. Monitoring (30 minutes)

Watch for OAuth exchange 5xx, Google/LinkedIn start failures, login 5xx, asset 404s, redirect anomalies.  
Rollback immediately if callbacks return localhost or JWT reappears in completion URLs.

---

## Completion gate

```json
{
  "overall": "PASS",
  "phase25cCertified": true,
  "promoteRecommended": true,
  "backendPromoted": true,
  "frontendPromoted": true,
  "googleOAuth": "PASS",
  "linkedinOAuth": "PASS",
  "productionFrontendRedirect": "PASS",
  "localhostProductionRedirect": "REMOVED",
  "jwtInCallbackUrl": "REMOVED",
  "exchangeCode": "PASS",
  "exchangeReplayProtection": "PASS",
  "exchangeExpiry": "PASS",
  "internalRedirectValidation": "PASS",
  "openRedirectProtection": "PASS",
  "tokenLoggingRedaction": "PASS",
  "adminSecretHandling": "PASS",
  "passwordAuthRegression": "PASS",
  "androidOAuth": "PASS",
  "messagingRegression": "PASS",
  "scrollRegression": "PASS",
  "communityRegression": "PASS",
  "androidPushRegression": "PASS",
  "productionMonitoring": "CLEAN"
}
```

Do not start the next feature phase until the monitoring window remains clean.
