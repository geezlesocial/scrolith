# CORS Remediation

## Blocker

Revision `scrolith-backend-00268-ruz` allowed only:

```text
https://messaging-322ab66d---scrolith-frontend-25ysnpjdda-as.a.run.app
```

Promoting that revision would break production browser calls from `https://scrolith.com` / `https://www.scrolith.com`.

## Corrected allowlist

Candidate `scrolith-backend-prisma-pool2` (tag `prisma-pool-cors`) uses:

```text
https://scrolith.com
https://www.scrolith.com
https://messaging-322ab66d---scrolith-frontend-25ysnpjdda-as.a.run.app
```

| Control | Value |
|---------|--------|
| Wildcard `*` | **disabled** |
| Wildcard `*.a.run.app` | **disabled** |
| Credentials | allowed for exact origins only |

`BASE_ALLOWED_ORIGINS` in `geezle-backend/src/config/cors.ts` also includes localhost/Capacitor origins used by mobile/dev; production env still constrains via `CORS_ALLOWED_ORIGINS` + production checks.

## Validation (candidate URL)

| Origin | Preflight | Access-Control-Allow-Origin |
|--------|-----------|-------------------------------|
| `https://scrolith.com` | 204 | `https://scrolith.com` |
| `https://www.scrolith.com` | 204 | `https://www.scrolith.com` |
| `https://evil.example` | no allow | empty / not reflected |

## Production impact

None. Production traffic remains on `scrolith-backend-00152-9tk` @ 100%.
