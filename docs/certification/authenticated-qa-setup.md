# Authenticated QA Setup Guide (Phase 21.1.6)

## Purpose

Provide a reusable authenticated session so Playwright can certify Member Home, Community, Scroll, Profile, and Notifications without manual browser operation.

## Prerequisites

- Node.js 20+
- `npm ci` in `geezle/`
- Playwright browsers: `npx playwright install chromium`
- A **non-production-admin** QA account with feed content

## Option A — Generate storage state (recommended)

```powershell
cd C:\Projects\geezle
$env:CERT_EMAIL="qa-cert@example.com"
$env:CERT_PASSWORD="***"
$env:CERT_BASE_URL="https://p2115---scrolith-frontend-25ysnpjdda-as.a.run.app"
npm run test:cert:storage
```

Writes: `tests/certification/fixtures/storage-state.json` (gitignored).

## Option B — Manual storage state

1. Copy `tests/certification/fixtures/storage-state.example.json`
2. Replace token/user after logging in via DevTools → Application → Local Storage
3. Save as `tests/certification/fixtures/storage-state.json`

## Environment variables

| Variable | Description |
|----------|-------------|
| `CERT_BASE_URL` | Default: staged p2115 tag URL |
| `CERT_STORAGE_STATE` | Path to storage state JSON |
| `CERT_EMAIL` / `CERT_PASSWORD` | Login credentials |
| `CERT_FEED_IDENTITY_MS` | Identity dwell (default 60000) |
| `CERT_API_BASE` | Optional API base for token login |
| `CERT_REQUIRE_AUTH` | Gate fails if no credentials |
| `CERT_ALLOW_SKIP_AUTH` | Gate allows unit-only pass |
| `CERT_SKIP_E2E` | Skip Playwright entirely |

## Run suites

```powershell
# Full desktop + mobile-390 cert
npm run test:cert:e2e

# All mobile projects
npx playwright test -c tests/certification/playwright.config.ts --project=pixel-7 --project=iphone-15 --project=mobile-390

# Release gate (units + e2e)
npm run test:cert:gate
```

## CORS note

The Cloud Run **tag URL** may CORS-block API calls from browsers. Prefer:

1. Adding the tag origin to API CORS allowlist for QA only, **or**
2. Running against `https://scrolith.com` while the staged revision receives traffic (cookie/session on production domain).

## Security

- Never commit real `storage-state.json` or passwords.
- Use a dedicated QA account with limited privileges.
- Rotate credentials after major release campaigns.
