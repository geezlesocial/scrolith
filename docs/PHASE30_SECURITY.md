# Phase 30 — Security Model: Scrolith Human Verification

## Threat model

Targets:

- Credential stuffing / automated login
- Mass registration
- Support spam
- Password reset abuse

Out of scope for this phase: full bot-management / WAF replacement. HV is one control layer.

## Controls

### Challenge integrity

1. Challenge generated server-side only.
2. Correct answer stored as `SHA-256(salt:normalizedAnswer)` where salt derives from challenge token.
3. Client receives prompt + options only.
4. Challenge expires (`expiresAt`).
5. Solved challenges cannot be reused.

### Verification token integrity

1. On success, a high-entropy `verificationToken` is issued.
2. Only the SHA-256 hash is stored.
3. Token is endpoint-bound.
4. Single consumption (`verificationConsumedAt`).
5. Separate TTL from challenge TTL.

### Abuse resistance

- IP rate limits on create/verify
- Attempt counter with lockout
- Progressive difficulty
- Optional risk scoring
- Audit log for create/solve/fail/settings

### Privacy

- No Google reCAPTCHA scripts for Scrolith HV
- No third-party CAPTCHA network calls
- No external fingerprint vendors
- Minimal client fingerprint is optional, generated locally
- GDPR-friendly: no advertising identifiers required

### Compatibility with Google reCAPTCHA

Both can be enabled:

1. Scrolith HV (first-party interactive)
2. Google reCAPTCHA (if platform integrations enable it)

Enabling HV does **not** remove reCAPTCHA code paths.

## Failure modes

| Scenario | Behavior |
|---|---|
| Master disabled | No challenge; auth/support unchanged |
| Migration not applied + master enabled | Create returns `HV_UNAVAILABLE` |
| Token missing when required | `400 HV_TOKEN_REQUIRED` |
| Gate internal error | `503 HV_GATE_ERROR` (fail closed) |

## Secrets

No new third-party secrets required. Challenge tokens are random (`base64url`).

## Accessibility & mobile security UX

- Large touch targets (≥48px)
- Keyboard operable option buttons
- ARIA labels/roles
- Screen-reader instructions
- Reduced third-party script attack surface on mobile WebViews

## Residual risks

- Determined humans/farms can still solve challenges (by design).
- In-memory locks reset on multi-instance restart; DB attempt history remains.
- Client fingerprint is soft binding only (WebViews may rotate).

## Recommendations

1. Enable HV after migration.
2. Pair with existing rate limits and 2FA for admins.
3. Monitor top IPs in analytics; block extreme abuse at edge if needed.
