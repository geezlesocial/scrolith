# Phase 30 — API Reference: Scrolith Human Verification

Base path: `/api/human-verification`

## Public

### `GET /api/human-verification/config?endpoint=login`

Returns whether verification is required for the endpoint and public branding/theme.

```json
{
  "success": true,
  "required": true,
  "publicSettings": {
    "masterEnabled": true,
    "theme": {},
    "branding": {},
    "endpoints": {}
  }
}
```

### `POST /api/human-verification/create`

Body:

```json
{
  "endpoint": "login",
  "fingerprint": "optional-device-fingerprint",
  "sessionId": "optional"
}
```

Response when required:

```json
{
  "success": true,
  "required": true,
  "challenge": {
    "challengeToken": "...",
    "challengeType": "arithmetic",
    "difficulty": "easy",
    "prompt": {
      "title": "Solve",
      "instruction": "Select the correct result.",
      "display": "3 + 4",
      "kind": "arithmetic"
    },
    "options": [
      { "id": "a1", "label": "7", "value": "7" },
      { "id": "a2", "label": "5", "value": "5" }
    ],
    "expiresAt": "ISO-8601",
    "maxAttempts": 5
  }
}
```

**Correct answer is never included.**

### `POST /api/human-verification/verify`

Body:

```json
{
  "challengeToken": "...",
  "optionId": "a1",
  "answer": "7",
  "startedAt": 1710000000000,
  "fingerprint": "optional"
}
```

Success:

```json
{
  "success": true,
  "verificationToken": "...",
  "expiresAt": "ISO-8601",
  "endpoint": "login",
  "message": "Verified."
}
```

## Protected form submission

Include on auth/support requests:

```json
{
  "humanVerificationToken": "<token from verify>"
}
```

Aliases accepted: `human_verification_token`, `hvToken`, `hv_token`.

### Auth endpoints consuming the token

- `POST /api/auth/login` → endpoint `login`
- `POST /api/auth/register` → endpoint `signup`
- `POST /api/auth/forgot-password` → endpoint `forgot_password`
- `POST /api/auth/reset-password` → endpoint `password_reset`

### Support

- `POST /api/support/tickets` → endpoint `support`

When master is disabled or the endpoint toggle is off, tokens are **not required**.

## Admin (authenticated admin)

| Method | Path |
|---|---|
| GET | `/api/admin/security/human-verification/settings` |
| PATCH / PUT | `/api/admin/security/human-verification/settings` |
| GET | `/api/admin/security/human-verification/analytics?days=30` |
| GET | `/api/admin/security/human-verification/audit?limit=50` |

Permissions: `settings.read` / `settings.enterprise_change` (and analytics/audit variants where applicable).

## Error codes

| Code | Meaning |
|---|---|
| `HV_TOKEN_REQUIRED` | Verification required but token missing |
| `HV_TOKEN_INVALID` | Unknown/expired/consumed token |
| `HV_TOKEN_ENDPOINT_MISMATCH` | Token issued for another endpoint |
| `HV_WRONG_ANSWER` | Incorrect option |
| `HV_EXPIRED` | Challenge expired |
| `HV_MAX_ATTEMPTS` | Attempts exhausted |
| `HV_LOCKED` | Temporary IP lock |
| `HV_RATE_LIMIT` | Create rate limit |
| `HV_UNAVAILABLE` | Tables/migration not ready |
