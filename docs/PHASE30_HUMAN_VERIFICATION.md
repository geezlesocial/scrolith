# Phase 30 — Scrolith Human Verification

## Overview

**Scrolith Human Verification** is Scrolith’s first-party, privacy-friendly human verification system (CAPTCHA alternative).

It is **not** Google reCAPTCHA. Optional Google reCAPTCHA remains available under Admin → Google Settings as a separate provider.

## Goals

- Protect high-risk public forms from automated abuse
- Keep verification fully owned by Scrolith (no third-party CAPTCHA required)
- Mobile-friendly, accessible, admin-configurable
- Production-safe defaults: **master disabled** until an administrator enables it

## Architecture

```
Client form
  → <ScrolithHumanVerification endpoint="login|signup|..." />
  → POST /api/human-verification/create
  → user selects an option
  → POST /api/human-verification/verify  (returns one-time verificationToken)
  → form submit includes humanVerificationToken
  → backend enforceHumanVerification(endpoint) consumes token
```

### Security model

| Property | Implementation |
|---|---|
| Server-side generation | `challengeEngine` + `HumanVerificationService` |
| Answer secrecy | `answerHash` only; never sent to client |
| One-time challenge | status `solved` / `consumed` |
| One-time pass token | SHA-256 `verificationTokenHash`, single consume |
| Expiration | challenge TTL + verification TTL |
| Rate limit | IP hourly create/verify + express rate limit |
| Progressive difficulty | fail counter escalates automatic difficulty |
| Temporary lock | in-memory lock after max attempts |
| Audit | `HumanVerificationAuditLog` |

## Challenge types

Arithmetic, number sequence, shape count, icon count, largest/smallest number, odd/even, color, emoji, pattern, logic, time, object, word, letter, common sense.

Difficulty: easy · medium · hard · extreme · automatic.

## Protected endpoints (configurable)

Login, signup, forgot password, password reset, support, contact, report, feedback, API, marketplace, jobs, generic.

## Database (additive)

Migration: `20260722120000_phase30_human_verification`

Tables:

- `HumanVerificationSettings`
- `HumanVerificationPolicy`
- `HumanVerificationChallenge`
- `HumanVerificationAttempt`
- `HumanVerificationAnalytics`
- `HumanVerificationAuditLog`

Settings are also mirrored to `AppSetting` scope `human_verification` so admin config works even before the migration is applied. Challenge create/verify requires the Phase 30 tables.

## Frontend

- Component: `geezle/src/components/human-verification/ScrolithHumanVerification.tsx`
- Service: `geezle/src/services/humanVerification.ts`
- Integrated on: Login, Signup, Forgot Password, Reset Password, Support
- Admin panel: `HumanVerificationPanel` inside Google Settings (alongside optional Google reCAPTCHA)

## Backend

- Service: `geezle-backend/src/services/humanVerification/*`
- Public API: `/api/human-verification/*`
- Admin API: `/api/admin/security/human-verification/*`
- Gate helper: `utils/humanVerificationGate.ts`
- Wired into auth (register/login/forgot/reset) and support ticket create

## Defaults

- `masterEnabled: false` — no production behavior change until admin enables
- Login/signup/support/password flows default **on** when master is enabled
- Marketplace/jobs/API default **off** (future-ready)

## Deployment notes

**This phase intentionally does not deploy or apply migrations.**

When ready:

1. Apply migration `20260722120000_phase30_human_verification`
2. Deploy backend + frontend
3. Enable **Master Enable** in Admin → Google Settings → Scrolith Human Verification
4. Monitor analytics and audit logs

## Regression stance

Extends existing systems only:

- Does not remove Google reCAPTCHA paths
- Does not delete routes/columns/permissions
- Auth and support continue to work when HV is disabled
